import datetime
import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import rollup  # noqa: E402


def test_groups_maps_known_exercises():
    assert rollup.groups("Floor Press (Dumbbell)") == {"chest"}
    assert rollup.groups("Bicep Curl (Dumbbell)") == {"biceps"}
    assert rollup.groups("Running") == {"Cardio"}
    # deliberately multi-group: a row exercise is both a row (back) and a core movement
    assert rollup.groups("Renegade Row (Dumbbell)") == {"back", "core"}


def test_groups_unknown_exercise_maps_to_empty_set():
    assert rollup.groups("Some New Machine Nobody Mapped Yet") == set()


def test_seven_day_moving_avg_basic_window():
    series = [(datetime.date(2026, 1, d), 80.0 + d) for d in range(1, 8)]  # 81..87
    avg = rollup.seven_day_moving_avg(series, datetime.date(2026, 1, 7))
    assert avg == sum(81 + i for i in range(7)) / 7


def test_seven_day_moving_avg_forward_fills_to_nearest_prior_date():
    series = [(datetime.date(2026, 1, 1), 80.0), (datetime.date(2026, 1, 3), 82.0)]
    # querying a date with no reading falls back to the nearest one on/before it
    avg = rollup.seven_day_moving_avg(series, datetime.date(2026, 1, 5))
    assert avg == (80.0 + 82.0) / 2


def test_seven_day_moving_avg_empty_series_returns_zero():
    assert rollup.seven_day_moving_avg([], datetime.date(2026, 1, 1)) == 0.0


def test_build_weekly_rollup_joins_hevy_and_body_metrics(tmp_db):
    tmp_db.upsert_body_metric("2026-01-05", weight_kg=80.0)
    tmp_db.upsert_body_metric("2026-01-06", weight_kg=79.0)
    tmp_db.insert_hevy_set(date="2026-01-05", title="Day 1", exercise="Floor Press (Dumbbell)",
                            set_index="0", set_type="normal", weight_kg=20.0, reps=10,
                            duration_seconds=60, load_kg=200.0, source="hevy_csv", imported_from=None)

    weeks = rollup.build_weekly_rollup()
    wk = rollup.wkey(datetime.date(2026, 1, 5))
    row = next(w for w in weeks if w["week"] == wk)
    assert row["sessions"] == 1
    assert row["Chest"] == 0.2  # 200kg load -> 0.2 tonnes
    assert row["weight_7d_MA_kg"] > 0


def test_build_weekly_rollup_meals_checked_reflects_new_meal_fields(tmp_db):
    tmp_db.toggle_meal("2026-01-05", "meal_breakfast")
    tmp_db.toggle_meal("2026-01-05", "meal_lunch")
    weeks = rollup.build_weekly_rollup()
    wk = rollup.wkey(datetime.date(2026, 1, 5))
    row = next(w for w in weeks if w["week"] == wk)
    assert row["meals_checked_total"] == 2
    assert row["mini_meals_target_met"] == 0  # only 2/4 checked, not the full day
