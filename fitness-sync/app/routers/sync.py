import threading

from fastapi import APIRouter
from ..sync import loop

router = APIRouter(prefix="/api/sync", tags=["sync"])


@router.get("/status")
def sync_status():
    return loop.STATUS


@router.post("/run")
def sync_run():
    """Trigger an immediate sync cycle (Garmin pull/watch + Hevy import) instead of
    waiting for the next scheduled interval. Runs in a background thread; poll
    /api/sync/status for completion."""
    if loop.STATUS["running"]:
        return {"started": False, "reason": "a sync is already running"}
    t = threading.Thread(target=loop.run_once, daemon=True, name="fitness-sync-manual")
    t.start()
    return {"started": True}
