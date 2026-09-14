"""Covers the merge-upsert semantics and dedup behavior that garmin_sync.py, the API,
and the web UI all depend on — this is the class of bug that already bit once
(METRIC_KEYS silently dropping a field before it reached the DB)."""


def test_merge_upsert_only_overwrites_given_fields(tmp_db):
    tmp_db.upsert_body_metric("2026-01-01", weight_kg=80.0, body_fat_pct=20.0, source="garmin_api")
    tmp_db.upsert_body_metric("2026-01-01", weight_kg=79.5)  # body_fat_pct omitted
    row = tmp_db.get_body_metric("2026-01-01")
    assert row["weight_kg"] == 79.5
    assert row["body_fat_pct"] == 20.0  # untouched, not nulled out
    assert row["source"] == "garmin_api"  # untouched


def test_merge_upsert_does_not_overwrite_with_none(tmp_db):
    tmp_db.upsert_body_metric("2026-01-02", weight_kg=80.0)
    tmp_db.upsert_body_metric("2026-01-02", weight_kg=None, bmi=22.0)
    row = tmp_db.get_body_metric("2026-01-02")
    assert row["weight_kg"] == 80.0
    assert row["bmi"] == 22.0


def test_every_watch_field_round_trips(tmp_db):
    """Regression test for the exact bug found this session: a field present in the
    schema/WATCH_FIELDS but missing from some hand-copied filter list gets silently
    dropped before it reaches the DB. Assert every declared field actually persists."""
    fields = {k: 1.0 for k in tmp_db.WATCH_FIELDS}
    tmp_db.upsert_watch_metric("2026-W01", **fields)
    row = tmp_db.get_watch_metric("2026-W01")
    for k in tmp_db.WATCH_FIELDS:
        assert row[k] == 1.0, f"{k} did not round-trip"


def test_hevy_dedup_via_unique_constraint(tmp_db):
    kwargs = dict(date="2026-01-01", title="Day 1", exercise="Floor Press (Dumbbell)",
                  set_index="0", set_type="normal", weight_kg=20.0, reps=10,
                  duration_seconds=60, load_kg=200.0, source="hevy_csv", imported_from="a.csv")
    id1, inserted1 = tmp_db.insert_hevy_set(**kwargs)
    id2, inserted2 = tmp_db.insert_hevy_set(**kwargs)  # re-importing the same file
    assert inserted1 is True
    assert inserted2 is False
    assert id1 == id2


def test_toggle_meal_flips_and_persists(tmp_db):
    row = tmp_db.toggle_meal("2026-01-01", "meal_breakfast")
    assert row["meal_breakfast"] == 1
    row = tmp_db.toggle_meal("2026-01-01", "meal_breakfast")
    assert row["meal_breakfast"] == 0


def test_measurement_crud(tmp_db):
    tmp_db.upsert_measurement("2026-01-01", waist_cm=84.5)
    tmp_db.upsert_measurement("2026-01-08", waist_cm=83.7)
    rows = tmp_db.list_measurements()
    assert [r["waist_cm"] for r in rows] == [84.5, 83.7]
    assert tmp_db.delete_measurement("2026-01-01") == 1
    assert tmp_db.get_measurement("2026-01-01") is None


def test_ensure_columns_patches_a_pre_existing_table(tmp_db, tmp_path):
    """Simulates the exact failure mode hit this session: a DB created with an OLDER
    schema (missing a field added later) must get that column patched in by init_db()
    on next startup, not raise OperationalError on the next read/write."""
    import sqlite3
    old_db_path = str(tmp_path / "old_schema.db")
    conn = sqlite3.connect(old_db_path)
    conn.execute("""CREATE TABLE watch_metrics (
        week TEXT PRIMARY KEY, resting_hr REAL, updated_at TEXT NOT NULL
    )""")  # no vo2max, bmr_kcal, sleep_score, etc. — the pre-migration shape
    conn.commit()
    conn.close()

    tmp_db.DB_PATH = old_db_path
    tmp_db.init_db()  # must patch in every missing WATCH_FIELDS column, not error

    row = tmp_db.upsert_watch_metric("2026-W02", vo2max=54.0, sleep_score=88.0)
    assert row["vo2max"] == 54.0
    assert row["sleep_score"] == 88.0
