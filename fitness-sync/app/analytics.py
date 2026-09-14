"""Multi-metric time series for the /analytics page and GET /api/analytics/series.
One registry maps a metric key straight to its source table + column (key == column
name in every source table, by design) so adding a new chartable metric later is a
one-line registry entry, not new plumbing.

watch_metrics is week-keyed, everything else is date-keyed. To let a viewer overlay a
weekly signal (e.g. sleep_score) against a daily one (e.g. weight_kg) on one x-axis,
weekly points are placed at that ISO week's Monday.
"""
import datetime

from . import db, rollup as rollup_mod, readiness as readiness_mod

# (key, source, label, unit, category) — category groups the toggle chips in the UI.
METRIC_REGISTRY = [
    ("weight_kg", "body_metrics", "Weight", "kg", "Body composition"),
    ("body_fat_pct", "body_metrics", "Body fat", "%", "Body composition"),
    ("body_water_pct", "body_metrics", "Body water", "%", "Body composition"),
    ("muscle_mass_kg", "body_metrics", "Muscle mass", "kg", "Body composition"),
    ("bone_mass_kg", "body_metrics", "Bone mass", "kg", "Body composition"),
    ("bmi", "body_metrics", "BMI", "", "Body composition"),

    ("neck_cm", "body_measurements", "Neck", "cm", "Measurements"),
    ("shoulders_cm", "body_measurements", "Shoulders", "cm", "Measurements"),
    ("chest_cm", "body_measurements", "Chest", "cm", "Measurements"),
    ("waist_cm", "body_measurements", "Waist", "cm", "Measurements"),
    ("hips_cm", "body_measurements", "Hips", "cm", "Measurements"),
    ("bicep_left_cm", "body_measurements", "Bicep (L)", "cm", "Measurements"),
    ("bicep_right_cm", "body_measurements", "Bicep (R)", "cm", "Measurements"),
    ("forearm_left_cm", "body_measurements", "Forearm (L)", "cm", "Measurements"),
    ("forearm_right_cm", "body_measurements", "Forearm (R)", "cm", "Measurements"),
    ("thigh_left_cm", "body_measurements", "Thigh (L)", "cm", "Measurements"),
    ("thigh_right_cm", "body_measurements", "Thigh (R)", "cm", "Measurements"),
    ("calf_left_cm", "body_measurements", "Calf (L)", "cm", "Measurements"),
    ("calf_right_cm", "body_measurements", "Calf (R)", "cm", "Measurements"),

    ("resting_hr", "watch_metrics", "Resting HR", "bpm", "Watch & recovery"),
    ("sleep_score", "watch_metrics", "Sleep score", "", "Watch & recovery"),
    ("sleep_duration_hr", "watch_metrics", "Sleep duration", "hr", "Watch & recovery"),
    ("vo2max", "watch_metrics", "VO2max", "", "Watch & recovery"),
    ("fitness_age", "watch_metrics", "Fitness age", "yr", "Watch & recovery"),
    ("stress_avg", "watch_metrics", "Stress avg", "", "Watch & recovery"),
    ("body_battery", "watch_metrics", "Body battery", "", "Watch & recovery"),
    ("spo2_avg", "watch_metrics", "SpO2 avg", "%", "Watch & recovery"),
    ("floors_climbed", "watch_metrics", "Floors climbed", "", "Watch & recovery"),
    ("hrv_last_night", "watch_metrics", "HRV last night", "ms", "Watch & recovery"),
    ("bmr_kcal", "watch_metrics", "Basal kcal", "kcal", "Watch & recovery"),
    ("active_kcal", "watch_metrics", "Active kcal", "kcal", "Watch & recovery"),
    ("total_kcal", "watch_metrics", "Total kcal", "kcal", "Watch & recovery"),

    ("meals_checked_total", "rollup_weekly", "Meals checked", "/28", "Meal plan"),
    ("mini_meals_target_met", "rollup_weekly", "Full days hit", "days", "Meal plan"),
    ("protein_avg_g", "rollup_weekly", "Avg protein", "g", "Meal plan"),

    ("readiness_score", "readiness", "Readiness", "", "Watch & recovery"),
]
_BY_KEY = {r[0]: r for r in METRIC_REGISTRY}


def categories():
    """Registry grouped by category, in registry order — drives the chip palette."""
    out = {}
    for key, _source, label, unit, cat in METRIC_REGISTRY:
        out.setdefault(cat, []).append((key, label, unit))
    return out


def _week_monday(wk):
    y, w = wk.split("-W")
    return datetime.date.fromisocalendar(int(y), int(w), 1).isoformat()


def _series_for(key, from_date=None, to_date=None):
    meta = _BY_KEY.get(key)
    if not meta:
        return []
    _key, source, _label, _unit, _cat = meta
    if source == "body_metrics":
        rows = db.list_body_metrics(from_date=from_date, to_date=to_date)
        return [{"date": r["date"], "value": r[key]} for r in rows if r.get(key) is not None]
    if source == "body_measurements":
        rows = db.list_measurements(from_date=from_date, to_date=to_date)
        return [{"date": r["date"], "value": r[key]} for r in rows if r.get(key) is not None]
    if source in ("watch_metrics", "rollup_weekly", "readiness"):
        if source == "watch_metrics":
            rows = db.list_watch_metrics()
        elif source == "rollup_weekly":
            rows = rollup_mod.build_weekly_rollup()
        else:
            rows = [{"week": r["week"], "readiness_score": r["readiness"]}
                    for r in readiness_mod.weekly_readiness()]
        out = [{"date": _week_monday(r["week"]), "value": r[key]}
               for r in rows if r.get(key) is not None]
        if from_date:
            out = [p for p in out if p["date"] >= from_date]
        if to_date:
            out = [p for p in out if p["date"] <= to_date]
        return sorted(out, key=lambda p: p["date"])
    return []


def get_series(keys, from_date=None, to_date=None):
    """{key: {label, unit, points: [{date, value}, ...]}} for each valid key."""
    out = {}
    for key in keys:
        meta = _BY_KEY.get(key)
        if not meta:
            continue
        _k, _source, label, unit, _cat = meta
        out[key] = {"label": label, "unit": unit, "points": _series_for(key, from_date, to_date)}
    return out
