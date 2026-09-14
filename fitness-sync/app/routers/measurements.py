"""Manual tape-measure body measurements — a separate entity from body_metrics because
Garmin/the scale never reports these; nothing here is ever auto-synced."""
from fastapi import APIRouter, HTTPException
from .. import db
from ..models import MeasurementIn

router = APIRouter(prefix="/api/measurements", tags=["measurements"])


@router.get("")
def list_measurements(from_: str | None = None, to: str | None = None):
    return db.list_measurements(from_date=from_, to_date=to)


@router.get("/{date}")
def get_measurement(date: str):
    row = db.get_measurement(date)
    if not row:
        raise HTTPException(404, "no measurement row for that date")
    return row


@router.put("/{date}")
def upsert_measurement(date: str, body: MeasurementIn):
    return db.upsert_measurement(date, **body.model_dump())


@router.delete("/{date}", status_code=204)
def delete_measurement(date: str):
    if not db.delete_measurement(date):
        raise HTTPException(404, "no measurement row for that date")
