from fastapi import APIRouter
from .. import analytics as analytics_mod

router = APIRouter(prefix="/api/analytics", tags=["analytics"])


@router.get("/metrics")
def list_metrics():
    """Every chartable metric key, grouped by category — what you can pass to
    /api/analytics/series?metrics=a,b,c."""
    return analytics_mod.categories()


@router.get("/series")
def series(metrics: str, from_: str | None = None, to: str | None = None):
    """Comma-separated metric keys -> {key: {label, unit, points}}. Mixes daily sources
    (body_metrics, body_measurements) with weekly (watch_metrics, placed at that week's
    Monday) on one date axis."""
    keys = [m.strip() for m in metrics.split(",") if m.strip()]
    return analytics_mod.get_series(keys, from_date=from_, to_date=to)
