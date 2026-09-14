"""Background sync — replaces entrypoint.sh's shell polling loop. Runs inside the
FastAPI process as a daemon thread (started from main.py's lifespan hook) instead of a
separate container process shelling out to two scripts every cycle; same cadence
(SYNC_INTERVAL_HOURS), same steps (Garmin pull, Garmin watch, Hevy import), just called
as in-process functions instead of subprocesses.
"""
import os, sys, time, threading, datetime, traceback

HERE = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, HERE)

from garmin import garmin_sync  # noqa: E402
from . import hevy_import  # noqa: E402
from .. import db, training as training_mod, readiness as readiness_mod, notify  # noqa: E402

STATUS = {
    "last_run_started": None,
    "last_run_finished": None,
    "last_garmin_pull_ok": None,
    "last_garmin_watch_ok": None,
    "last_hevy_import": None,
    "last_backup": None,
    "last_error": None,
    "running": False,
}

# In-memory dedup so the same event doesn't ping twice — resets on restart, which is
# fine (worst case one repeat notification, never a missed one). Same "acceptable
# in-memory state" tradeoff as STATUS above.
_notified_prs = set()          # {(exercise, date)}
_notified_readiness_week = None
_notified_streak_break_date = None


def _check_pr_notifications():
    for row in training_mod.exercise_summary():
        key = (row["exercise"], row["last_date"])
        if row["last_top_is_pr"] and key not in _notified_prs:
            _notified_prs.add(key)
            notify.send("New PR", f"{row['exercise']}: {row['last_top_weight_kg']}kg x "
                        f"{row['last_top_reps']} on {row['last_date']}", tags=["muscle"])


def _check_readiness_notification():
    global _notified_readiness_week
    rows = readiness_mod.weekly_readiness()
    scored = [r for r in rows if r["readiness"] is not None]
    if not scored:
        return
    latest = scored[-1]
    if latest["week"] == _notified_readiness_week:
        return
    dip = latest["readiness"] < 35
    if len(scored) >= 2:
        dip = dip or (scored[-2]["readiness"] - latest["readiness"] >= 15)
    if dip:
        _notified_readiness_week = latest["week"]
        notify.send("Readiness dip", f"{latest['week']}: readiness {latest['readiness']} "
                    f"({latest['band']}) — consider a lighter session.", priority="high", tags=["warning"])


def _check_adherence_streak_break():
    global _notified_streak_break_date
    today = datetime.date.today()
    days = [(today - datetime.timedelta(days=n)).isoformat() for n in range(1, 6)]
    yesterday = days[0]
    if yesterday == _notified_streak_break_date:
        return
    rows = {r["date"]: r for r in db.list_daily_log(from_date=days[-1], to_date=yesterday)}
    checked = [sum(1 for f in db.MEAL_FIELDS if rows.get(d, {}).get(f)) for d in reversed(days)]
    if len(checked) >= 4 and checked[-1] < 4 and all(c == 4 for c in checked[-4:-1]):
        _notified_streak_break_date = yesterday
        notify.send("Meal streak broken", f"{yesterday}: only {checked[-1]}/4 meals checked "
                    f"after 3 full days — back on it today?", tags=["fork_and_knife"])


def _has_garmin_auth():
    return garmin_sync._tokenstore_present(garmin_sync.TOKENSTORE) or (
        os.environ.get("GARMIN_EMAIL") and os.environ.get("GARMIN_PASSWORD"))


def run_once():
    """One sync cycle: Garmin pull + watch (if auth available) + Hevy import. Never
    raises — each step is caught so one failure doesn't block the others, mirroring
    entrypoint.sh's `|| echo ... continuing` behavior."""
    STATUS["running"] = True
    STATUS["last_run_started"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    STATUS["last_error"] = None
    try:
        if _has_garmin_auth():
            try:
                rc = garmin_sync.mode_pull()
                STATUS["last_garmin_pull_ok"] = (rc == 0)
            except Exception as e:
                STATUS["last_garmin_pull_ok"] = False
                STATUS["last_error"] = f"garmin pull: {e}"
                traceback.print_exc()
            try:
                rc = garmin_sync.mode_watch()
                STATUS["last_garmin_watch_ok"] = (rc == 0)
                if rc == 0:
                    try:
                        _check_readiness_notification()
                    except Exception:
                        traceback.print_exc()
            except Exception as e:
                STATUS["last_garmin_watch_ok"] = False
                STATUS["last_error"] = f"garmin watch: {e}"
                traceback.print_exc()
        else:
            sys.stderr.write("[sync] no Garmin tokenstore/creds — skipping Garmin pull. "
                              "Run --mode init once (see README).\n")

        try:
            files, seen, inserted = hevy_import.import_dir()
            STATUS["last_hevy_import"] = {"files": files, "seen": seen, "inserted": inserted}
            if inserted:
                try:
                    _check_pr_notifications()
                except Exception:
                    traceback.print_exc()
        except Exception as e:
            STATUS["last_error"] = f"hevy import: {e}"
            traceback.print_exc()

        today = datetime.date.today().isoformat()
        already_backed_up_today = isinstance(STATUS.get("last_backup"), dict) and \
            STATUS["last_backup"].get("date") == today
        if not already_backed_up_today:
            try:
                dest = db.backup_db()
                STATUS["last_backup"] = {"date": today, "path": dest}
            except Exception as e:
                STATUS["last_error"] = f"backup: {e}"
                traceback.print_exc()
            try:
                _check_adherence_streak_break()
            except Exception as e:
                STATUS["last_error"] = f"streak check: {e}"
                traceback.print_exc()
    finally:
        STATUS["running"] = False
        STATUS["last_run_finished"] = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _loop(interval_hours):
    sleep_s = max(1, int(interval_hours * 3600))
    while True:
        run_once()
        time.sleep(sleep_s)


def start_background(interval_hours=None):
    interval_hours = interval_hours or float(os.environ.get("SYNC_INTERVAL_HOURS", "6"))
    t = threading.Thread(target=_loop, args=(interval_hours,), daemon=True, name="fitness-sync-loop")
    t.start()
    return t
