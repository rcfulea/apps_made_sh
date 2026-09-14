import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import training  # noqa: E402


def _set(tmp_db, date, exercise, weight, reps, idx="0"):
    tmp_db.insert_hevy_set(date=date, title="t", exercise=exercise, set_index=idx,
                            set_type="normal", weight_kg=weight, reps=reps,
                            duration_seconds=60, load_kg=weight * reps,
                            source="user", imported_from=None)


def test_epley_1rm_formula():
    assert training._epley_1rm(100, 10) == 100 * (1 + 10 / 30.0)
    assert training._epley_1rm(0, 10) == 0.0
    assert training._epley_1rm(100, 0) == 0.0


def test_pr_flags_first_set_is_always_a_pr(tmp_db):
    _set(tmp_db, "2026-01-01", "Floor Press", 20, 10)
    flagged = training.sets_with_pr_flags()
    assert flagged[0]["is_weight_pr"] is True
    assert flagged[0]["is_1rm_pr"] is True


def test_pr_flags_only_trigger_on_new_best(tmp_db):
    _set(tmp_db, "2026-01-01", "Floor Press", 20, 10)
    _set(tmp_db, "2026-01-08", "Floor Press", 20, 10)  # same weight, not a PR
    _set(tmp_db, "2026-01-15", "Floor Press", 22, 10)  # heavier, IS a PR
    flagged = training.sets_with_pr_flags("Floor Press")
    assert [r["is_weight_pr"] for r in flagged] == [True, False, True]


def test_exercise_summary_close_to_pr(tmp_db):
    _set(tmp_db, "2026-01-01", "Bench", 100, 5)   # best 1RM session
    _set(tmp_db, "2026-01-08", "Bench", 97, 5)     # within 95% of best but not a new PR
    summary = training.exercise_summary()
    row = next(r for r in summary if r["exercise"] == "Bench")
    assert row["close_to_pr"] is True
    assert row["best_weight_kg"] == 100.0


def test_exercise_summary_plateau_detection(tmp_db):
    # 6 sessions, weight never exceeds the first session's weight -> plateaued
    for i, d in enumerate(["2026-01-01", "2026-01-08", "2026-01-15",
                            "2026-01-22", "2026-01-29", "2026-02-05"]):
        _set(tmp_db, d, "Squat", 60, 10)
    summary = training.exercise_summary()
    row = next(r for r in summary if r["exercise"] == "Squat")
    assert row["plateau"] is True
    assert row["sessions_logged"] == 6


def test_exercise_summary_no_plateau_when_progressing(tmp_db):
    weights = [60, 62, 64, 66, 68, 70]
    for w, d in zip(weights, ["2026-01-01", "2026-01-08", "2026-01-15",
                               "2026-01-22", "2026-01-29", "2026-02-05"]):
        _set(tmp_db, d, "Deadlift", w, 8)
    summary = training.exercise_summary()
    row = next(r for r in summary if r["exercise"] == "Deadlift")
    assert row["plateau"] is False


def test_last_session_for(tmp_db):
    _set(tmp_db, "2026-01-01", "Row", 20, 10)
    _set(tmp_db, "2026-01-08", "Row", 22, 10)
    row = training.last_session_for("Row")
    assert row["last_date"] == "2026-01-08"
    assert row["last_top_weight_kg"] == 22.0
    assert training.last_session_for("Nonexistent") is None
