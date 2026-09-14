import os, re, datetime

from fastapi import APIRouter, File, HTTPException, UploadFile
from .. import db
from ..models import WorkoutIn, WorkoutUpdate
from ..sync import hevy_import

router = APIRouter(prefix="/api/workouts", tags=["workouts"])


@router.get("")
def list_workouts(from_: str | None = None, to: str | None = None, exercise: str | None = None):
    return db.list_hevy_sets(from_date=from_, to_date=to, exercise=exercise)


@router.get("/{set_id}")
def get_workout(set_id: int):
    row = db.get_hevy_set(set_id)
    if not row:
        raise HTTPException(404, "no set with that id")
    return row


@router.post("", status_code=201)
def add_workout(body: WorkoutIn):
    fields = body.model_dump()
    fields["load_kg"] = fields["weight_kg"] * fields["reps"]
    set_id, _inserted = db.insert_hevy_set(
        date=fields["date"], title=fields["title"], exercise=fields["exercise"],
        set_index=fields["set_index"], set_type=fields["set_type"],
        weight_kg=fields["weight_kg"], reps=fields["reps"],
        duration_seconds=fields["duration_seconds"], load_kg=fields["load_kg"],
        source=fields["source"], imported_from=None)
    return db.get_hevy_set(set_id)


@router.put("/{set_id}")
def edit_workout(set_id: int, body: WorkoutUpdate):
    if not db.get_hevy_set(set_id):
        raise HTTPException(404, "no set with that id")
    fields = body.model_dump()
    if fields.get("weight_kg") is not None or fields.get("reps") is not None:
        current = db.get_hevy_set(set_id)
        w = fields.get("weight_kg") if fields.get("weight_kg") is not None else current["weight_kg"]
        r = fields.get("reps") if fields.get("reps") is not None else current["reps"]
        fields["load_kg"] = (w or 0) * (r or 0)
    return db.update_hevy_set(set_id, **fields)


@router.delete("/{set_id}", status_code=204)
def delete_workout(set_id: int):
    if not db.delete_hevy_set(set_id):
        raise HTTPException(404, "no set with that id")


@router.post("/import")
def import_workouts():
    """Re-scan hevy/inbox/*.csv now (also runs on the background sync cadence)."""
    files, seen, inserted = hevy_import.import_dir()
    return {"files_scanned": files, "sets_seen": seen, "sets_inserted": inserted}


@router.post("/upload")
async def upload_workout_csv(file: UploadFile = File(...)):
    """Upload a Hevy export CSV directly (Hevy app -> Profile -> Export Data) instead of
    placing it into hevy/inbox/ by hand. Saved with a timestamp prefix — Hevy reuses a
    generic export filename each time, so this avoids one drop silently overwriting the
    last — then imported immediately (dedup via hevy_sets' UNIQUE constraint, same as
    the background re-scan)."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(400, "expected a .csv file")
    safe_name = re.sub(r"[^A-Za-z0-9._-]", "_", os.path.basename(file.filename))
    stamped = f"{datetime.datetime.now(datetime.timezone.utc):%Y%m%dT%H%M%S}_{safe_name}"
    os.makedirs(hevy_import.HEVY_DIR, exist_ok=True)
    dest = os.path.join(hevy_import.HEVY_DIR, stamped)
    content = await file.read()
    with open(dest, "wb") as f:
        f.write(content)
    files, seen, inserted = hevy_import.import_dir()
    return {"saved_as": stamped, "files_scanned": files, "sets_seen": seen, "sets_inserted": inserted}
