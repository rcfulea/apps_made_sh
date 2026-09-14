#!/usr/bin/env python3
"""One-time migration: legacy CSVs (garmin/weight.csv, garmin/metrics.csv, body.csv,
hevy/inbox/*.csv from the pre-SQLite layout) -> SQLite (app/db.py). Safe to re-run —
every write is an upsert/INSERT OR IGNORE, so running this twice is a no-op the second
time. CSVs are NEVER deleted or modified by this script.

Run once, from the fitness-sync/ dir:  python3 migrate_csv_to_sqlite.py

Prints a per-source row count so you can eyeball it against `wc -l` on the source CSV.
"""
import os, csv, sys, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from app import db  # noqa: E402
from app.sync.hevy_import import parse_hevy  # noqa: E402

WEIGHT_CSV = os.path.join(HERE, "garmin", "weight.csv")
METRICS_CSV = os.path.join(HERE, "garmin", "metrics.csv")
BODY_CSV = os.path.join(HERE, "body.csv")
HEVY_DIR = os.path.join(HERE, "hevy", "inbox")


def _read_headered(path):
    if not os.path.exists(path):
        return None, []
    hdr, rows = None, []
    with open(path, newline="", encoding="utf-8") as f:
        for raw in csv.reader(f):
            if not any(c.strip() for c in raw):
                continue
            first = raw[0].strip()
            if first.startswith("#"):
                continue
            if hdr is None:
                hdr = [h.strip() for h in raw]
                continue
            rec = {h: (raw[i].strip() if i < len(raw) else "") for i, h in enumerate(hdr)}
            rows.append(rec)
    return hdr, rows


def _f(s):
    s = (s or "").strip()
    if s in ("", "—"):
        return None
    try:
        return float(s)
    except ValueError:
        return None


def migrate_weight():
    hdr, rows = _read_headered(WEIGHT_CSV)
    if not hdr:
        print(f"[migrate] {WEIGHT_CSV}: not found, skipping")
        return 0
    n = 0
    for r in rows:
        d = r.get("date", "")
        if not d:
            continue
        fields = {k: _f(r.get(k)) for k in db.BODY_FIELDS if k in r}
        db.upsert_body_metric(d, source=r.get("source") or "garmin_api", **fields)
        n += 1
    print(f"[migrate] body_metrics: {n} row(s) from {WEIGHT_CSV}")
    return n


def migrate_metrics():
    hdr, rows = _read_headered(METRICS_CSV)
    if not hdr:
        print(f"[migrate] {METRICS_CSV}: not found, skipping")
        return 0
    n = 0
    for r in rows:
        wk = r.get("week", "")
        if not wk:
            continue
        fields = {k: _f(r.get(k)) for k in db.WATCH_FIELDS if k in r}
        db.upsert_watch_metric(wk, **fields)
        n += 1
    print(f"[migrate] watch_metrics: {n} row(s) from {METRICS_CSV}")
    return n


def migrate_body_log():
    hdr, rows = _read_headered(BODY_CSV)
    if not hdr:
        print(f"[migrate] {BODY_CSV}: not found, skipping")
        return 0
    n = 0
    for r in rows:
        d = r.get("date", "")
        if not d:
            continue
        mh = (r.get("mini_meals_hit", "") or "").strip().lower()
        hit = 0 if mh in ("", "0", "no", "n", "false") else 1
        db.upsert_daily_log(d, mini_meals_hit=hit, protein_g=_f(r.get("protein_g")),
                             note=r.get("note") or None)
        n += 1
    print(f"[migrate] daily_log: {n} row(s) from {BODY_CSV}")
    return n


def migrate_hevy():
    import glob
    files = sorted(glob.glob(os.path.join(HEVY_DIR, "*.csv")))
    seen, inserted = 0, 0
    for fp in files:
        for r in parse_hevy(fp):
            seen += 1
            _id, ins = db.insert_hevy_set(
                date=r["date"].isoformat(), title=r["title"], exercise=r["ex"],
                set_index=r["sidx"], set_type=r["settype"], weight_kg=r["weight"],
                reps=r["reps"], duration_seconds=r["dur"], load_kg=r["load"],
                source="hevy_csv", imported_from=os.path.basename(fp))
            if ins:
                inserted += 1
    print(f"[migrate] hevy_sets: {len(files)} file(s), {seen} set-row(s) seen, {inserted} inserted")
    return inserted


if __name__ == "__main__":
    db.init_db()
    migrate_weight()
    migrate_metrics()
    migrate_body_log()
    migrate_hevy()
    print("[migrate] done. Old CSVs left untouched — safe to keep as a rollback copy.")
