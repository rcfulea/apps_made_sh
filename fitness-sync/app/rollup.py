#!/usr/bin/env python3
"""Weekly rollup — ported from tracker.py's build_rollout(). Same muscle-group mapping,
main-lift tracking, and 7-day weight moving average; the difference is it reads from
SQLite (body_metrics, watch_metrics, hevy_sets, daily_log) instead of parsing CSVs, and
returns the rows instead of writing rollout.csv — this is now a live API endpoint
(GET /api/rollup/weeks), not a nightly batch file.
"""
import re, datetime, collections

from . import db

RECOVERY = ["resting_hr", "steps_avg", "distance_m", "stress_avg", "active_kcal",
            "total_kcal", "bmr_kcal", "body_battery", "respiration_avg", "vo2max", "fitness_age",
            "spo2_avg", "spo2_lowest", "floors_climbed", "hrv_last_night", "hrv_weekly_avg",
            "sleep_score", "sleep_duration_hr"]


# ---------------------------------------------------------------- muscle-group map
def groups(ex):
    e = ex.lower()
    if ex == "Running" or e == "running":
        return {"Cardio"}
    out = set()
    if "deadlift" in e or "squat" in e or "lunge" in e or "calf" in e or "leg" in e: out.add("Lower Body")
    if any(k in e for k in ["floor press", "chest press", "fly", "chest", "press"]): out.add("chest")
    if "overhead" in e or "shoulder press" in e: out.add("front_delts")
    if "front raise" in e: out.add("front_delts")
    if "lateral" in e or "side raise" in e: out.add("side_delts")
    if "rear delt" in e or "reverse fly" in e: out.add("rear_delts")
    if any(k in e for k in ["row", "pullover"]): out.add("back")
    if "tricep" in e or "extension" in e: out.add("triceps")
    if "curl" in e: out.add("biceps")
    if "shrug" in e: out.add("traps")
    if any(k in e for k in ["plank", "russian twist", "dead bug", "renegade"]): out.add("core")
    return out


PRIMARY = ["Chest", "Front Delts", "Side Delts", "Rear Delts", "Back", "Triceps", "Biceps",
           "Traps", "Core", "Lower Body"]
KEY = {"Chest": ["chest"], "Front Delts": ["front_delts"], "Side Delts": ["side_delts"],
       "Rear Delts": ["rear_delts"], "Back": ["back"], "Triceps": ["triceps"],
       "Biceps": ["biceps"], "Traps": ["traps"], "Core": ["core"], "Lower Body": ["Lower Body"]}
MAIN_LIFTS = ["Floor Press (Dumbbell)", "Shoulder Press (Dumbbell)", "Bent Over Row (Dumbbell)",
              "Dumbbell Row", "Deadlift (Dumbbell)", "Front Raise (Dumbbell)",
              "Decline Chest Fly (Dumbbell)", "Triceps Kickback (Dumbbell)",
              "Bicep Curl (Dumbbell)", "Concentration Curl"]


def wkey(d):
    y, w, _ = d.isocalendar()
    return f"{y}-W{w:02d}"


def _lift_field(ex):
    return "lift_" + re.sub(r"[^A-Za-z]", "_", ex)


def seven_day_moving_avg(weight_series, at):
    """weight_series: sorted [(date, weight_kg), ...] with weight_kg not None.
    Trailing 7-day mean, forward-filled to nearest date on/before `at`."""
    if not weight_series:
        return 0.0
    for i in range(len(weight_series) - 1, -1, -1):
        if weight_series[i][0] <= at:
            window = [weight_series[j][1] for j in range(max(0, i - 6), i + 1)]
            return sum(window) / len(window)
    return 0.0


def build_weekly_rollup(from_week=None, to_week=None):
    """Full weekly rollup, same shape as the old rollout.csv rows. from_week/to_week
    filter the OUTPUT rows only — the 7-day moving average still needs the full weight
    history to forward-fill correctly, so source data is never pre-filtered by range."""
    body_rows = db.list_body_metrics()
    watch_rows = {r["week"]: r for r in db.list_watch_metrics()}
    daily_rows = db.list_daily_log()
    hevy_rows = db.list_hevy_sets()

    weight_by_date = collections.OrderedDict()
    for r in body_rows:
        d = datetime.date.fromisoformat(r["date"])
        weight_by_date[d] = r
    weight_series = sorted((d, r["weight_kg"]) for d, r in weight_by_date.items() if r.get("weight_kg"))

    meals_by_date = {}
    for r in daily_rows:
        d = datetime.date.fromisoformat(r["date"])
        checked = sum(1 for f in db.MEAL_FIELDS if r.get(f))
        meals_by_date[d] = dict(meals_hit=(checked == len(db.MEAL_FIELDS)), meals_checked=checked,
                                 protein_g=r.get("protein_g") or 0.0, note=r.get("note", ""))

    byweek = collections.defaultdict(lambda: collections.defaultdict(float))
    lift_wk = collections.defaultdict(lambda: [0.0, 0])
    cardio = collections.defaultdict(int)
    hevy_dates = set()
    sessions_by_wk = collections.defaultdict(set)
    for r in hevy_rows:
        d = datetime.date.fromisoformat(r["date"])
        wk = wkey(d)
        hevy_dates.add(d)
        sessions_by_wk[wk].add(d)
        ex = r["exercise"]
        load = r.get("load_kg") or 0.0
        dur = r.get("duration_seconds") or 0
        for g in groups(ex):
            if g == "Cardio":
                cardio[wk] += dur
            else:
                byweek[wk][g] += load
        lw = lift_wk[wk + "|" + ex]
        lw[0] = max(lw[0], r.get("weight_kg") or 0.0)
        lw[1] += 1

    all_dates = hevy_dates | set(weight_by_date) | set(meals_by_date)
    all_wks = {wkey(d) for d in all_dates} | set(watch_rows.keys())
    weeks = sorted(all_wks)
    if from_week:
        weeks = [w for w in weeks if w >= from_week]
    if to_week:
        weeks = [w for w in weeks if w <= to_week]

    out_rows = []
    for wk in weeks:
        wk_hevy = sorted(d for d in hevy_dates if wkey(d) == wk)
        wk_all = sorted(d for d in all_dates if wkey(d) == wk)
        wk_end = max(wk_all, default=None)
        wk_meal_rows = [meals_by_date[d] for d in meals_by_date if wkey(d) == wk]

        rec = {"week": wk,
               "from": (wk_hevy[0].isoformat() if wk_hevy else (wk_all[0].isoformat() if wk_all else "—")),
               "to": (wk_hevy[-1].isoformat() if wk_hevy else (wk_all[-1].isoformat() if wk_all else "—")),
               "sessions": len(sessions_by_wk.get(wk, ()))}

        for label in PRIMARY:
            tot = sum(byweek[wk][k] for k in KEY[label])
            rec[label] = round(tot / 1000, 3) if tot else 0.0

        for ex in MAIN_LIFTS:
            lw = lift_wk.get(wk + "|" + ex)
            rec[_lift_field(ex)] = f"{lw[0]:.0f}/{lw[1]}" if lw and lw[1] else "—"

        rec["running_min"] = round(cardio.get(wk, 0) / 60) or 0
        rec["weight_7d_MA_kg"] = round(seven_day_moving_avg(weight_series, wk_end), 2) if wk_end else 0.0

        bf_vals = [weight_by_date[d]["body_fat_pct"] for d in weight_by_date
                   if wkey(d) == wk and weight_by_date[d].get("body_fat_pct")]
        rec["body_fat_pct_avg"] = round(sum(bf_vals) / len(bf_vals), 1) if bf_vals else 0

        rec["meals_logged_days"] = len(wk_meal_rows)
        rec["mini_meals_target_met"] = sum(1 for m in wk_meal_rows if m["meals_hit"])
        rec["meals_checked_total"] = sum(m["meals_checked"] for m in wk_meal_rows)
        prots = [m["protein_g"] for m in wk_meal_rows if m["protein_g"]]
        rec["protein_avg_g"] = round(sum(prots) / len(prots), 0) if prots else 0

        wm = watch_rows.get(wk, {})
        for sig in RECOVERY:
            v = wm.get(sig)
            rec["rv_" + sig] = v if v not in (None, 0) else "—"

        out_rows.append(rec)

    return out_rows


def week_summary(wk):
    rows = build_weekly_rollup(from_week=wk, to_week=wk)
    return rows[0] if rows else None


def current_weight_7d_ma():
    """Latest 7-day moving-average weight, or None if there's no weight data yet.
    Used to auto-scale the protein target (see app/pages/routes.py's _protein_goal)."""
    rows = db.list_body_metrics()
    series = sorted((datetime.date.fromisoformat(r["date"]), r["weight_kg"])
                     for r in rows if r.get("weight_kg"))
    if not series:
        return None
    return round(seven_day_moving_avg(series, series[-1][0]), 2)
