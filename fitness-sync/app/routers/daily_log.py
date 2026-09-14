"""Meal plan — one row per day: 4 checkable meal slots (breakfast/lunch/dinner/snack),
plus protein/note. Renamed from "daily log" for clarity; kept in this file (matches the
underlying daily_log table) rather than renaming the module, to keep the diff small."""
from fastapi import APIRouter, HTTPException
from .. import db
from ..models import DailyLogIn

router = APIRouter(prefix="/api/meal-plan", tags=["meal-plan"])


@router.get("")
def list_meal_plan(from_: str | None = None, to: str | None = None):
    return db.list_daily_log(from_date=from_, to_date=to)


@router.get("/{date}")
def get_meal_plan(date: str):
    row = db.get_daily_log_one(date)
    if not row:
        raise HTTPException(404, "no meal-plan row for that date")
    return row


@router.put("/{date}")
def upsert_meal_plan(date: str, body: DailyLogIn):
    fields = body.model_dump()
    for f in db.MEAL_FIELDS:
        if fields.get(f) is not None:
            fields[f] = int(fields[f])
    return db.upsert_daily_log(date, **fields)
