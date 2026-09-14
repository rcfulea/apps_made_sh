import sys, os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app import readiness  # noqa: E402


def test_component_score_higher_is_better():
    # recent 20% above baseline -> above 50, within 0-100
    s = readiness._component_score(120, 100, higher_is_better=True)
    assert 50 < s <= 100
    s_low = readiness._component_score(80, 100, higher_is_better=True)
    assert 0 <= s_low < 50


def test_component_score_lower_is_better_inverts():
    # resting_hr: recent LOWER than baseline is GOOD -> score above 50
    s = readiness._component_score(80, 100, higher_is_better=False)
    assert s > 50


def test_component_score_none_when_missing_data():
    assert readiness._component_score(None, 100, True) is None
    assert readiness._component_score(100, None, True) is None


def test_weekly_readiness_needs_baseline_history(tmp_db):
    tmp_db.upsert_watch_metric("2026-W01", sleep_score=80, resting_hr=50)
    rows = readiness.weekly_readiness()
    # only one week of data -> no baseline possible yet -> readiness is None, not fabricated
    assert rows[0]["readiness"] is None


def test_weekly_readiness_scores_once_baseline_exists(tmp_db):
    for wk, sleep, rhr in [("2026-W01", 70, 50), ("2026-W02", 70, 50), ("2026-W03", 70, 50)]:
        tmp_db.upsert_watch_metric(wk, sleep_score=sleep, resting_hr=rhr)
    # a 4th week with clearly better sleep and lower resting HR than baseline
    tmp_db.upsert_watch_metric("2026-W04", sleep_score=95, resting_hr=42)
    rows = readiness.weekly_readiness()
    latest = rows[-1]
    assert latest["week"] == "2026-W04"
    assert latest["readiness"] is not None
    assert latest["readiness"] > 50  # both components improved vs baseline
    assert latest["band"] in ("Good", "Moderate", "Low")
