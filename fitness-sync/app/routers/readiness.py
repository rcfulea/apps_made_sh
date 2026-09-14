from fastapi import APIRouter, HTTPException
from .. import readiness as readiness_mod

router = APIRouter(prefix="/api/readiness", tags=["readiness"])


@router.get("")
def readiness_series():
    return readiness_mod.weekly_readiness()


@router.get("/latest")
def readiness_latest():
    row = readiness_mod.latest_readiness()
    if not row:
        raise HTTPException(404, "no watch data yet")
    return row
