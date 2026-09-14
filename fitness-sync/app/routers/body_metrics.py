"""date is the natural primary key, so writes are PUT-only (create-or-update, matches
db.upsert_body_metric's merge semantics) — no separate POST that would just duplicate PUT."""
from fastapi import APIRouter, HTTPException
from .. import db
from ..models import BodyMetricIn

router = APIRouter(prefix="/api/body-metrics", tags=["body-metrics"])


@router.get("")
def list_body_metrics(from_: str | None = None, to: str | None = None, limit: int | None = None):
    return db.list_body_metrics(from_date=from_, to_date=to, limit=limit)


@router.get("/{date}")
def get_body_metric(date: str):
    row = db.get_body_metric(date)
    if not row:
        raise HTTPException(404, "no body-metric row for that date")
    return row


@router.put("/{date}")
def upsert_body_metric(date: str, body: BodyMetricIn):
    """Create or edit a day's reading. Only fields you pass overwrite; omitted fields
    keep their existing value (see db._merge_upsert)."""
    return db.upsert_body_metric(date, **body.model_dump())


@router.delete("/{date}", status_code=204)
def delete_body_metric(date: str):
    if not db.delete_body_metric(date):
        raise HTTPException(404, "no body-metric row for that date")
