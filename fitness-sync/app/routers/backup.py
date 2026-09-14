import datetime

from fastapi import APIRouter
from fastapi.responses import JSONResponse
from .. import db
from ..sync import loop

router = APIRouter(prefix="/api", tags=["backup"])


@router.get("/export")
def export_all():
    """Full JSON snapshot of every table — a portable backup, and a convenient
    one-shot dump for an LLM that wants the whole dataset rather than paging through
    individual endpoints."""
    return JSONResponse(db.export_all())


@router.post("/backup")
def trigger_backup():
    """VACUUM INTO an on-disk snapshot now (data/backups/fitness-YYYYMMDD.db) instead
    of waiting for the once-a-day automatic backup in the sync loop."""
    dest = db.backup_db()
    loop.STATUS["last_backup"] = {"date": datetime.date.today().isoformat(), "path": dest}
    return {"saved_as": dest}
