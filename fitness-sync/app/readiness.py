"""Composite readiness score — Oura's actual mechanism (a recent value's deviation from
a trailing baseline, averaged across available signals into one 0-100 figure), adapted
to fitness-sync's week-keyed watch_metrics since we don't have daily granularity there.
Computed on the fly from watch_metrics, same philosophy as rollup.py/analytics.py —
nothing stored, so it's always consistent with whatever's currently in the DB.

Component signals and whether higher is better for each:
  hrv_last_night (higher=more recovered), resting_hr (lower=more recovered),
  sleep_score (higher=better), stress_avg (lower=better), body_battery (higher=better).
A component needs >=2 prior weeks of data to have a baseline; a week's overall score
needs >=2 available components, else readiness is None (not enough data, not a fake 50).
"""
from . import db

COMPONENTS = [
    ("hrv_last_night", True),
    ("resting_hr", False),
    ("sleep_score", True),
    ("stress_avg", False),
    ("body_battery", True),
]
BASELINE_WEEKS = 8


def _component_score(recent, baseline, higher_is_better):
    if recent is None or baseline in (None, 0):
        return None
    pct_diff = (recent - baseline) / abs(baseline)
    if not higher_is_better:
        pct_diff = -pct_diff
    score = 50 + pct_diff * (50 / 0.3)  # +/-30% deviation spans the full 0-100 range
    return max(0, min(100, round(score)))


def band(score):
    if score is None:
        return None
    if score >= 70:
        return "Good"
    if score >= 40:
        return "Moderate"
    return "Low"


def weekly_readiness():
    """[{week, readiness, band, components: {key: score}}, ...] for every week that has
    watch_metrics data, oldest first."""
    rows = db.list_watch_metrics()
    out = []
    for i, r in enumerate(rows):
        prior = rows[max(0, i - BASELINE_WEEKS):i]
        components = {}
        for key, higher_is_better in COMPONENTS:
            recent = r.get(key)
            prior_vals = [p[key] for p in prior if p.get(key) is not None]
            baseline = sum(prior_vals) / len(prior_vals) if len(prior_vals) >= 2 else None
            s = _component_score(recent, baseline, higher_is_better)
            if s is not None:
                components[key] = s
        readiness = round(sum(components.values()) / len(components)) if len(components) >= 2 else None
        out.append({"week": r["week"], "readiness": readiness, "band": band(readiness),
                     "components": components})
    return out


def latest_readiness():
    rows = weekly_readiness()
    return rows[-1] if rows else None
