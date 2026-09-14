#!/usr/bin/env python3
"""One-off, READ-ONLY discovery tool: log into your real Garmin account and probe the
data surface garminconnect (cyberjunky/python-garminconnect, pinned 0.3.2 — same lib
garmin_sync.py uses) actually returns for YOUR account/device, before we lock down what
goes into body_metrics/watch_metrics. Writes nothing to the app DB.

Run interactively (needs a TTY for MFA the first time):
    python3 explore_garmin.py

Uses the same tokenstore as garmin_sync.py (GARMIN_TOKENSTORE, default
garmin/tokens.txt) — if you've already run `garmin_sync.py --mode init`, this reuses
that login with no new MFA prompt. Otherwise it'll ask for GARMIN_EMAIL/GARMIN_PASSWORD
(env or prompt) and MFA once, same as `--mode init`.

Output: prints a summary table (endpoint -> empty/populated + a few sample keys) to
stdout, and writes the full raw JSON per endpoint to garmin_explore_output.json
(gitignored — it's your real personal data) for a closer look.
"""
import os, sys, json, datetime

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "garmin"))
sys.path.insert(0, HERE)
from garmin.garmin_sync import login, TOKENSTORE, _tokenstore_present  # noqa: E402

OUT_PATH = os.path.join(HERE, "garmin_explore_output.json")

today = datetime.date.today()
d = today.isoformat()
week_ago = (today - datetime.timedelta(days=7)).isoformat()
month_ago = (today - datetime.timedelta(days=30)).isoformat()

# (label, callable) — fitness-relevant surface only; skips golf/menstrual/pregnancy/
# gear/badges/nutrition-logging/workout-authoring, which aren't relevant to this app.
def probes(g):
    return [
        ("body_composition_30d", lambda: g.get_body_composition(month_ago, enddate=d)),
        ("weigh_ins_30d", lambda: g.get_weigh_ins(month_ago, d)),
        ("daily_weigh_ins_today", lambda: g.get_daily_weigh_ins(d)),
        ("user_summary_today", lambda: g.get_user_summary(d)),
        ("stats_today", lambda: g.get_stats(d)),
        ("stats_and_body_today", lambda: g.get_stats_and_body(d)),
        ("sleep_data_today", lambda: g.get_sleep_data(d)),
        ("hrv_data_today", lambda: g.get_hrv_data(d)),
        ("training_readiness_today", lambda: g.get_training_readiness(d)),
        ("morning_training_readiness", lambda: g.get_morning_training_readiness(d)),
        ("training_status_today", lambda: g.get_training_status(d)),
        ("rhr_day_today", lambda: g.get_rhr_day(d)),
        ("stress_data_today", lambda: g.get_stress_data(d)),
        ("all_day_stress_today", lambda: g.get_all_day_stress(d)),
        ("weekly_stress_8w", lambda: g.get_weekly_stress(d, weeks=8)),
        ("body_battery_7d", lambda: g.get_body_battery(week_ago, d)),
        ("body_battery_events_today", lambda: g.get_body_battery_events(d)),
        ("respiration_data_today", lambda: g.get_respiration_data(d)),
        ("spo2_data_today", lambda: g.get_spo2_data(d)),
        ("steps_data_today", lambda: g.get_steps_data(d)),
        ("daily_steps_30d", lambda: g.get_daily_steps(month_ago, d)),
        ("weekly_steps_8w", lambda: g.get_weekly_steps(d, weeks=8)),
        ("floors_today", lambda: g.get_floors(d)),
        ("intensity_minutes_today", lambda: g.get_intensity_minutes_data(d)),
        ("weekly_intensity_minutes", lambda: g.get_weekly_intensity_minutes(d)),
        ("hydration_today", lambda: g.get_hydration_data(d)),
        ("max_metrics_today", lambda: g.get_max_metrics(d)),
        ("fitnessage_today", lambda: g.get_fitnessage_data(d)),
        ("endurance_score_today", lambda: g.get_endurance_score(d)),
        ("hill_score_today", lambda: g.get_hill_score(d)),
        ("lactate_threshold", lambda: g.get_lactate_threshold()),
        ("running_tolerance", lambda: g.get_running_tolerance(d)),
        ("race_predictions", lambda: g.get_race_predictions()),
        ("personal_record", lambda: g.get_personal_record()),
        ("cycling_ftp", lambda: g.get_cycling_ftp()),
        ("goals", lambda: g.get_goals()),
        ("devices", lambda: g.get_devices()),
        ("device_last_used", lambda: g.get_device_last_used()),
        ("primary_training_device", lambda: g.get_primary_training_device()),
        ("activities_recent_10", lambda: g.get_activities(0, 10)),
        ("activities_by_date_30d", lambda: g.get_activities_by_date(month_ago, d)),
        ("last_activity", lambda: g.get_last_activity()),
        ("all_day_events_today", lambda: g.get_all_day_events(d)),
        ("user_profile", lambda: g.get_user_profile()),
        ("unit_system", lambda: g.get_unit_system()),
    ]


def _is_empty(v):
    if v is None:
        return True
    if isinstance(v, (list, dict)) and len(v) == 0:
        return True
    return False


def _sample_keys(v, n=8):
    if isinstance(v, dict):
        return list(v.keys())[:n]
    if isinstance(v, list) and v:
        first = v[0]
        return (list(first.keys())[:n] if isinstance(first, dict) else [type(first).__name__])
    return []


def main():
    if not _tokenstore_present(TOKENSTORE) and not (os.environ.get("GARMIN_EMAIL") and os.environ.get("GARMIN_PASSWORD")):
        print(f"No tokenstore at {TOKENSTORE} and no GARMIN_EMAIL/GARMIN_PASSWORD set.")
        print("Set GARMIN_EMAIL/GARMIN_PASSWORD env vars (or run garmin/garmin_sync.py --mode init first), "
              "then re-run this from a real terminal (MFA prompt needs a TTY).")
        sys.exit(1)

    print(f"Logging in (tokenstore: {TOKENSTORE}) ...")
    g = login()
    print("Logged in. Probing endpoints ...\n")

    results = {}
    rows = []
    for label, fn in probes(g):
        try:
            v = fn()
            results[label] = v
            rows.append((label, "empty" if _is_empty(v) else "DATA", _sample_keys(v)))
        except Exception as e:
            results[label] = {"__error__": f"{type(e).__name__}: {e}"}
            rows.append((label, f"ERROR {type(e).__name__}", []))

    width = max(len(r[0]) for r in rows) + 2
    print(f"{'endpoint':<{width}}{'status':<12}sample keys")
    for label, status, keys in rows:
        print(f"{label:<{width}}{status:<12}{', '.join(map(str, keys))}")

    with open(OUT_PATH, "w") as f:
        json.dump(results, f, indent=2, default=str)
    print(f"\nFull raw output written to {OUT_PATH} (gitignored, your personal data — "
          f"open it and paste any interesting bits back for us to decide what to add).")


if __name__ == "__main__":
    main()
