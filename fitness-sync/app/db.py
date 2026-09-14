#!/usr/bin/env python3
"""SQLite persistence layer for fitness-sync — the single source of truth, replacing
the CSV files garmin-sync.py/tracker.py used to read/write. WAL mode lets the
background sync thread and web/API requests read+write concurrently without a
whole-file rewrite race.

Merge semantics: `_merge_upsert` only overwrites columns present (non-None) in the
given fields dict, via COALESCE(excluded.col, col) — this reproduces garmin-sync.py's
old "newest non-empty value wins" behavior, and doubles as a safe partial PUT for the
API (unset fields in a request body are left untouched, not nulled out).
"""
import os, sqlite3, datetime, glob

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_ROOT = os.path.dirname(HERE)
DB_PATH = os.environ.get("DB_PATH", os.path.join(REPO_ROOT, "data", "fitness.db"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS body_metrics (
  date TEXT PRIMARY KEY,
  weight_kg REAL, body_fat_pct REAL, body_water_pct REAL,
  muscle_mass_kg REAL, bone_mass_kg REAL, visceral_fat REAL,
  visceral_fat_rating REAL, basal_met REAL, active_met REAL,
  metabolic_age REAL, physique_rating REAL, bmi REAL,
  source TEXT NOT NULL DEFAULT 'garmin_api',
  extra_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS watch_metrics (
  week TEXT PRIMARY KEY,
  resting_hr REAL, steps_total REAL, steps_avg REAL, distance_m REAL,
  stress_avg REAL, active_kcal REAL, total_kcal REAL, bmr_kcal REAL,
  body_battery REAL, respiration_avg REAL,
  vo2max REAL, fitness_age REAL, spo2_avg REAL, spo2_lowest REAL, floors_climbed REAL,
  hrv_last_night REAL, hrv_weekly_avg REAL, sleep_score REAL, sleep_duration_hr REAL,
  extra_json TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hevy_sets (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date TEXT NOT NULL, title TEXT, exercise TEXT NOT NULL,
  set_index TEXT, set_type TEXT, weight_kg REAL, reps INTEGER,
  duration_seconds INTEGER, load_kg REAL,
  source TEXT NOT NULL DEFAULT 'hevy_csv',
  imported_from TEXT,
  UNIQUE(date, title, exercise, set_index, set_type, weight_kg, reps)
);

CREATE TABLE IF NOT EXISTS daily_log (       -- meal plan: one row per day
  date TEXT PRIMARY KEY,
  meal_breakfast INTEGER, meal_lunch INTEGER, meal_dinner INTEGER, meal_snack INTEGER,
  mini_meals_hit INTEGER,   -- legacy single-flag column, superseded by the 4 meal_* columns above
  protein_g REAL, note TEXT,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS body_measurements (   -- manual tape-measure entries; Garmin never reports these
  date TEXT PRIMARY KEY,
  neck_cm REAL, shoulders_cm REAL, chest_cm REAL, waist_cm REAL, hips_cm REAL,
  bicep_left_cm REAL, bicep_right_cm REAL, forearm_left_cm REAL, forearm_right_cm REAL,
  thigh_left_cm REAL, thigh_right_cm REAL, calf_left_cm REAL, calf_right_cm REAL,
  note TEXT, updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  created_at TEXT NOT NULL, author TEXT NOT NULL,
  title TEXT, body TEXT NOT NULL,
  related_date TEXT, related_week TEXT, tags TEXT
);

CREATE TABLE IF NOT EXISTS app_settings (   -- generic key-value store; first use: protein_goal_g
  key TEXT PRIMARY KEY,
  value TEXT
);
"""

BODY_FIELDS = ("weight_kg", "body_fat_pct", "body_water_pct", "muscle_mass_kg",
               "bone_mass_kg", "visceral_fat", "visceral_fat_rating", "basal_met",
               "active_met", "metabolic_age", "physique_rating", "bmi")
WATCH_FIELDS = ("resting_hr", "steps_total", "steps_avg", "distance_m", "stress_avg",
                 "active_kcal", "total_kcal", "bmr_kcal", "body_battery", "respiration_avg",
                 "vo2max", "fitness_age", "spo2_avg", "spo2_lowest", "floors_climbed",
                 "hrv_last_night", "hrv_weekly_avg", "sleep_score", "sleep_duration_hr")
MEASUREMENT_FIELDS = ("neck_cm", "shoulders_cm", "chest_cm", "waist_cm", "hips_cm",
                       "bicep_left_cm", "bicep_right_cm", "forearm_left_cm", "forearm_right_cm",
                       "thigh_left_cm", "thigh_right_cm", "calf_left_cm", "calf_right_cm")
MEAL_FIELDS = ("meal_breakfast", "meal_lunch", "meal_dinner", "meal_snack")


def get_conn():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def _ensure_columns(conn, table, field_names, coltype="REAL"):
    """CREATE TABLE IF NOT EXISTS only helps a brand-new DB — an existing DB from
    before a field was added needs the column patched in, or every read/write of that
    field raises OperationalError. Runs on every startup; ALTER ADD COLUMN is a no-op
    once the column exists, so this is safe to repeat."""
    existing = {row[1] for row in conn.execute(f"PRAGMA table_info({table})")}
    for name in field_names:
        if name not in existing:
            conn.execute(f"ALTER TABLE {table} ADD COLUMN {name} {coltype}")


def init_db():
    conn = get_conn()
    conn.executescript(SCHEMA)
    _ensure_columns(conn, "body_metrics", BODY_FIELDS)
    _ensure_columns(conn, "watch_metrics", WATCH_FIELDS)
    _ensure_columns(conn, "body_measurements", MEASUREMENT_FIELDS)
    _ensure_columns(conn, "daily_log", MEAL_FIELDS, coltype="INTEGER")
    conn.commit()
    conn.close()


def _now():
    return datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _row(r):
    return dict(r) if r is not None else None


def _merge_upsert(conn, table, key_col, key_val, fields: dict):
    fields = {k: v for k, v in fields.items() if v is not None}
    cols = list(fields.keys())
    if not cols:
        conn.execute(f"INSERT OR IGNORE INTO {table} ({key_col}, updated_at) VALUES (?, ?)",
                     [key_val, _now()])
        conn.commit()
        return
    col_list = ", ".join(cols)
    placeholders = ", ".join("?" for _ in cols)
    updates = ", ".join(f"{c}=COALESCE(excluded.{c}, {c})" for c in cols)
    sql = (f"INSERT INTO {table} ({key_col}, {col_list}, updated_at) VALUES (?, {placeholders}, ?) "
           f"ON CONFLICT({key_col}) DO UPDATE SET {updates}, updated_at=excluded.updated_at")
    conn.execute(sql, [key_val] + [fields[c] for c in cols] + [_now()])
    conn.commit()


# ---------------------------------------------------------------- body_metrics
def upsert_body_metric(date, **fields):
    conn = get_conn()
    try:
        _merge_upsert(conn, "body_metrics", "date", date, fields)
        return get_body_metric(date, conn=conn)
    finally:
        conn.close()


def get_body_metric(date, conn=None):
    own = conn is None
    conn = conn or get_conn()
    try:
        return _row(conn.execute("SELECT * FROM body_metrics WHERE date=?", (date,)).fetchone())
    finally:
        if own:
            conn.close()


def list_body_metrics(from_date=None, to_date=None, limit=None):
    conn = get_conn()
    try:
        sql = "SELECT * FROM body_metrics WHERE 1=1"
        params = []
        if from_date:
            sql += " AND date>=?"; params.append(from_date)
        if to_date:
            sql += " AND date<=?"; params.append(to_date)
        sql += " ORDER BY date"
        if limit:
            sql += " LIMIT ?"; params.append(limit)
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


def delete_body_metric(date):
    conn = get_conn()
    try:
        cur = conn.execute("DELETE FROM body_metrics WHERE date=?", (date,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


# ---------------------------------------------------------------- watch_metrics
def upsert_watch_metric(week, **fields):
    conn = get_conn()
    try:
        _merge_upsert(conn, "watch_metrics", "week", week, fields)
        return get_watch_metric(week, conn=conn)
    finally:
        conn.close()


def get_watch_metric(week, conn=None):
    own = conn is None
    conn = conn or get_conn()
    try:
        return _row(conn.execute("SELECT * FROM watch_metrics WHERE week=?", (week,)).fetchone())
    finally:
        if own:
            conn.close()


def list_watch_metrics(from_week=None, to_week=None):
    conn = get_conn()
    try:
        sql = "SELECT * FROM watch_metrics WHERE 1=1"
        params = []
        if from_week:
            sql += " AND week>=?"; params.append(from_week)
        if to_week:
            sql += " AND week<=?"; params.append(to_week)
        sql += " ORDER BY week"
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


# ---------------------------------------------------------------- hevy_sets
def insert_hevy_set(**fields):
    """INSERT OR IGNORE keyed on the same (date,title,exercise,set_index,set_type,
    weight_kg,reps) tuple tracker.py used as its in-memory dedup key — re-importing the
    same export file is a no-op. Returns (row_id, was_newly_inserted)."""
    conn = get_conn()
    try:
        cols = list(fields.keys())
        col_list = ", ".join(cols)
        placeholders = ", ".join("?" for _ in cols)
        cur = conn.execute(f"INSERT OR IGNORE INTO hevy_sets ({col_list}) VALUES ({placeholders})",
                            [fields[c] for c in cols])
        inserted = cur.rowcount == 1
        conn.commit()
        row = conn.execute(
            "SELECT id FROM hevy_sets WHERE date=? AND title=? AND exercise=? AND set_index=? "
            "AND set_type=? AND weight_kg=? AND reps=?",
            (fields.get("date"), fields.get("title"), fields.get("exercise"),
             fields.get("set_index"), fields.get("set_type"), fields.get("weight_kg"),
             fields.get("reps"))).fetchone()
        return (row["id"] if row else None), inserted
    finally:
        conn.close()


def get_hevy_set(set_id):
    conn = get_conn()
    try:
        return _row(conn.execute("SELECT * FROM hevy_sets WHERE id=?", (set_id,)).fetchone())
    finally:
        conn.close()


def list_hevy_sets(from_date=None, to_date=None, exercise=None):
    conn = get_conn()
    try:
        sql = "SELECT * FROM hevy_sets WHERE 1=1"
        params = []
        if from_date:
            sql += " AND date>=?"; params.append(from_date)
        if to_date:
            sql += " AND date<=?"; params.append(to_date)
        if exercise:
            sql += " AND exercise=?"; params.append(exercise)
        sql += " ORDER BY date, id"
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


def update_hevy_set(set_id, **fields):
    fields = {k: v for k, v in fields.items() if v is not None}
    if not fields:
        return get_hevy_set(set_id)
    conn = get_conn()
    try:
        set_clause = ", ".join(f"{c}=?" for c in fields)
        conn.execute(f"UPDATE hevy_sets SET {set_clause} WHERE id=?",
                     [*fields.values(), set_id])
        conn.commit()
        return _row(conn.execute("SELECT * FROM hevy_sets WHERE id=?", (set_id,)).fetchone())
    finally:
        conn.close()


def delete_hevy_set(set_id):
    conn = get_conn()
    try:
        cur = conn.execute("DELETE FROM hevy_sets WHERE id=?", (set_id,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


# ---------------------------------------------------------------- daily_log
def upsert_daily_log(date, **fields):
    conn = get_conn()
    try:
        _merge_upsert(conn, "daily_log", "date", date, fields)
        return get_daily_log_one(date, conn=conn)
    finally:
        conn.close()


def toggle_meal(date, meal_field):
    """Flip one meal_* boolean for a date — the single-tap check UX on /meal-plan.
    A plain UPDATE...SET x=NOT x can't distinguish "row doesn't exist yet" from "row
    exists with NULL", so this reads-then-writes explicitly instead."""
    assert meal_field in MEAL_FIELDS
    conn = get_conn()
    try:
        row = _row(conn.execute("SELECT * FROM daily_log WHERE date=?", (date,)).fetchone())
        current = bool(row[meal_field]) if row else False
        _merge_upsert(conn, "daily_log", "date", date, {meal_field: 0 if current else 1})
        return get_daily_log_one(date, conn=conn)
    finally:
        conn.close()


def get_daily_log_one(date, conn=None):
    own = conn is None
    conn = conn or get_conn()
    try:
        return _row(conn.execute("SELECT * FROM daily_log WHERE date=?", (date,)).fetchone())
    finally:
        if own:
            conn.close()


def list_daily_log(from_date=None, to_date=None):
    conn = get_conn()
    try:
        sql = "SELECT * FROM daily_log WHERE 1=1"
        params = []
        if from_date:
            sql += " AND date>=?"; params.append(from_date)
        if to_date:
            sql += " AND date<=?"; params.append(to_date)
        sql += " ORDER BY date"
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


# ---------------------------------------------------------------- body_measurements
def upsert_measurement(date, **fields):
    conn = get_conn()
    try:
        _merge_upsert(conn, "body_measurements", "date", date, fields)
        return get_measurement(date, conn=conn)
    finally:
        conn.close()


def get_measurement(date, conn=None):
    own = conn is None
    conn = conn or get_conn()
    try:
        return _row(conn.execute("SELECT * FROM body_measurements WHERE date=?", (date,)).fetchone())
    finally:
        if own:
            conn.close()


def list_measurements(from_date=None, to_date=None):
    conn = get_conn()
    try:
        sql = "SELECT * FROM body_measurements WHERE 1=1"
        params = []
        if from_date:
            sql += " AND date>=?"; params.append(from_date)
        if to_date:
            sql += " AND date<=?"; params.append(to_date)
        sql += " ORDER BY date"
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


def delete_measurement(date):
    conn = get_conn()
    try:
        cur = conn.execute("DELETE FROM body_measurements WHERE date=?", (date,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


# ---------------------------------------------------------------- notes
def insert_note(author, body, title=None, related_date=None, related_week=None, tags=None):
    conn = get_conn()
    try:
        cur = conn.execute(
            "INSERT INTO notes (created_at, author, title, body, related_date, related_week, tags) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            (_now(), author, title, body, related_date, related_week, tags))
        conn.commit()
        return get_note(cur.lastrowid, conn=conn)
    finally:
        conn.close()


def get_note(note_id, conn=None):
    own = conn is None
    conn = conn or get_conn()
    try:
        return _row(conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone())
    finally:
        if own:
            conn.close()


def list_notes(from_date=None, to_date=None, author=None, tag=None):
    conn = get_conn()
    try:
        sql = "SELECT * FROM notes WHERE 1=1"
        params = []
        if from_date:
            sql += " AND (related_date>=? OR related_date IS NULL)"; params.append(from_date)
        if to_date:
            sql += " AND (related_date<=? OR related_date IS NULL)"; params.append(to_date)
        if author:
            sql += " AND author=?"; params.append(author)
        if tag:
            sql += " AND tags LIKE ?"; params.append(f"%{tag}%")
        sql += " ORDER BY created_at DESC"
        return [dict(r) for r in conn.execute(sql, params).fetchall()]
    finally:
        conn.close()


def update_note(note_id, **fields):
    fields = {k: v for k, v in fields.items() if v is not None}
    if not fields:
        return get_note(note_id)
    conn = get_conn()
    try:
        set_clause = ", ".join(f"{c}=?" for c in fields)
        conn.execute(f"UPDATE notes SET {set_clause} WHERE id=?", [*fields.values(), note_id])
        conn.commit()
        return _row(conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone())
    finally:
        conn.close()


def delete_note(note_id):
    conn = get_conn()
    try:
        cur = conn.execute("DELETE FROM notes WHERE id=?", (note_id,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


# ---------------------------------------------------------------- backup / export
ALL_TABLES = ("body_metrics", "watch_metrics", "hevy_sets", "daily_log",
              "body_measurements", "notes", "app_settings")


def export_all():
    """Every row of every table, plain dicts — a full portable snapshot. Used by
    GET /api/export and by the migration/rollback story generally."""
    conn = get_conn()
    try:
        return {t: [dict(r) for r in conn.execute(f"SELECT * FROM {t}")] for t in ALL_TABLES}
    finally:
        conn.close()


def get_setting(key, default=None):
    conn = get_conn()
    try:
        row = conn.execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default
    finally:
        conn.close()


def delete_setting(key):
    conn = get_conn()
    try:
        cur = conn.execute("DELETE FROM app_settings WHERE key=?", (key,))
        conn.commit()
        return cur.rowcount
    finally:
        conn.close()


def set_setting(key, value):
    conn = get_conn()
    try:
        conn.execute("INSERT INTO app_settings (key, value) VALUES (?, ?) "
                      "ON CONFLICT(key) DO UPDATE SET value=excluded.value", (key, value))
        conn.commit()
    finally:
        conn.close()


def backup_db(keep=14):
    """VACUUM INTO a timestamped copy under data/backups/, then prune down to the
    `keep` most recent. Called once/day from the sync loop (see app/sync/loop.py) —
    data/fitness.db is the only copy of everything, so this is cheap insurance against
    a bad write or a corrupted file, not a full disaster-recovery story."""
    backup_dir = os.path.join(os.path.dirname(DB_PATH), "backups")
    os.makedirs(backup_dir, exist_ok=True)
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y%m%d")
    dest = os.path.join(backup_dir, f"fitness-{stamp}.db")
    if os.path.exists(dest):
        os.remove(dest)  # VACUUM INTO refuses to overwrite; same-day re-run (e.g. after a restart) replaces it
    conn = get_conn()
    try:
        conn.execute("VACUUM INTO ?", (dest,))
    finally:
        conn.close()
    for old in sorted(glob.glob(os.path.join(backup_dir, "fitness-*.db")))[:-keep]:
        os.remove(old)
    return dest
