import datetime

from fastapi import APIRouter, HTTPException
from .. import db, rollup as rollup_mod

router = APIRouter(prefix="/api", tags=["rollup"])


@router.get("/rollup/weeks")
def rollup_weeks(from_week: str | None = None, to_week: str | None = None):
    return rollup_mod.build_weekly_rollup(from_week=from_week, to_week=to_week)


@router.get("/rollup/weeks/{week}")
def rollup_week(week: str):
    row = rollup_mod.week_summary(week)
    if not row:
        raise HTTPException(404, "no data for that week")
    return row


@router.get("/trend/weight")
def trend_weight(from_: str | None = None, to: str | None = None):
    """Daily weight + 7-day moving average — the chart source for the dashboard."""
    rows = db.list_body_metrics(from_date=from_, to_date=to)
    series = sorted((datetime.date.fromisoformat(r["date"]), r["weight_kg"])
                     for r in db.list_body_metrics() if r.get("weight_kg"))
    out = []
    for r in rows:
        if r.get("weight_kg") is None:
            continue
        d = datetime.date.fromisoformat(r["date"])
        out.append({
            "date": r["date"],
            "weight_kg": r["weight_kg"],
            "weight_7d_ma_kg": round(rollup_mod.seven_day_moving_avg(series, d), 2),
        })
    return out


@router.get("/trend/muscle-groups")
def trend_muscle_groups(from_week: str | None = None, to_week: str | None = None):
    """Per-group weekly tonnage series — the chart source for the muscle-group chart."""
    weeks = rollup_mod.build_weekly_rollup(from_week=from_week, to_week=to_week)
    return [{"week": w["week"], **{g: w[g] for g in rollup_mod.PRIMARY}} for w in weeks]


@router.get("/summary")
def summary():
    """One-shot latest snapshot — quick context for the dashboard or an LLM starting a
    conversation about the data."""
    body_rows = db.list_body_metrics(limit=1000)
    latest_body = body_rows[-1] if body_rows else None
    weeks = rollup_mod.build_weekly_rollup()
    latest_week = weeks[-1] if weeks else None
    notes = db.list_notes()[:5]
    return {
        "latest_body_metric": latest_body,
        "latest_week": latest_week,
        "recent_notes": notes,
        "weeks_tracked": len(weeks),
    }
