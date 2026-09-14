import sys, os, datetime

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from app.sync import loop  # noqa: E402


def _set(tmp_db, date, exercise, weight, reps):
    tmp_db.insert_hevy_set(date=date, title="t", exercise=exercise, set_index="0",
                            set_type="normal", weight_kg=weight, reps=reps,
                            duration_seconds=60, load_kg=weight * reps,
                            source="user", imported_from=None)


def test_pr_notification_fires_once_per_exercise_date(tmp_db, monkeypatch):
    sent = []
    monkeypatch.setattr(loop.notify, "send", lambda *a, **k: sent.append((a, k)))
    loop._notified_prs.clear()

    _set(tmp_db, "2026-01-01", "Bench", 100, 5)
    loop._check_pr_notifications()
    assert len(sent) == 1
    assert "Bench" in sent[0][0][1]

    loop._check_pr_notifications()  # same data again -> no duplicate notification
    assert len(sent) == 1


def test_readiness_notification_fires_on_low_score(tmp_db, monkeypatch):
    sent = []
    monkeypatch.setattr(loop.notify, "send", lambda *a, **k: sent.append((a, k)))
    loop._notified_readiness_week = None

    for wk in ["2026-W01", "2026-W02", "2026-W03"]:
        tmp_db.upsert_watch_metric(wk, sleep_score=80, resting_hr=50, stress_avg=20)
    # sharp drop this week
    tmp_db.upsert_watch_metric("2026-W04", sleep_score=30, resting_hr=65, stress_avg=60)

    loop._check_readiness_notification()
    assert len(sent) == 1
    assert loop._notified_readiness_week == "2026-W04"

    loop._check_readiness_notification()  # already notified this week -> no duplicate
    assert len(sent) == 1


def test_readiness_notification_silent_when_no_dip(tmp_db, monkeypatch):
    sent = []
    monkeypatch.setattr(loop.notify, "send", lambda *a, **k: sent.append((a, k)))
    loop._notified_readiness_week = None

    for wk in ["2026-W01", "2026-W02", "2026-W03", "2026-W04"]:
        tmp_db.upsert_watch_metric(wk, sleep_score=80, resting_hr=50, stress_avg=20)

    loop._check_readiness_notification()
    assert sent == []


def test_adherence_streak_break_detects_break_after_three_full_days(tmp_db, monkeypatch):
    sent = []
    monkeypatch.setattr(loop.notify, "send", lambda *a, **k: sent.append((a, k)))
    loop._notified_streak_break_date = None

    today = datetime.date.today()
    days = [(today - datetime.timedelta(days=n)).isoformat() for n in range(1, 5)]
    # yesterday=days[0] broke the streak; the 3 before it (days[1..3]) were full
    for d in days[1:4]:
        for f in tmp_db.MEAL_FIELDS:
            tmp_db.toggle_meal(d, f)
    tmp_db.toggle_meal(days[0], "meal_breakfast")  # only 1/4 yesterday

    loop._check_adherence_streak_break()
    assert len(sent) == 1
    assert loop._notified_streak_break_date == days[0]


def test_adherence_streak_break_silent_when_streak_intact(tmp_db, monkeypatch):
    sent = []
    monkeypatch.setattr(loop.notify, "send", lambda *a, **k: sent.append((a, k)))
    loop._notified_streak_break_date = None

    today = datetime.date.today()
    days = [(today - datetime.timedelta(days=n)).isoformat() for n in range(1, 5)]
    for d in days:
        for f in tmp_db.MEAL_FIELDS:
            tmp_db.toggle_meal(d, f)

    loop._check_adherence_streak_break()
    assert sent == []
