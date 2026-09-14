from fastapi import APIRouter, HTTPException
from .. import db
from ..models import WatchMetricIn

router = APIRouter(prefix="/api/watch-metrics", tags=["watch-metrics"])


@router.get("")
def list_watch_metrics(from_week: str | None = None, to_week: str | None = None):
    return db.list_watch_metrics(from_week=from_week, to_week=to_week)


@router.get("/{week}")
def get_watch_metric(week: str):
    row = db.get_watch_metric(week)
    if not row:
        raise HTTPException(404, "no watch-metric row for that week")
    return row


@router.put("/{week}")
def upsert_watch_metric(week: str, body: WatchMetricIn):
    return db.upsert_watch_metric(week, **body.model_dump())
