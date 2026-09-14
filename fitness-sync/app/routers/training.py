from fastapi import APIRouter, HTTPException
from .. import training as training_mod

router = APIRouter(prefix="/api/training", tags=["training"])


@router.get("/summary")
def training_summary():
    """Per-exercise PR/plateau summary — best weight/1RM, last session, close-to-PR
    and plateau flags. Good context for an LLM deciding whether to suggest a program
    change (see docs/hermes_system_prompt.md)."""
    return training_mod.exercise_summary()


@router.get("/last-session")
def training_last_session(exercise: str):
    row = training_mod.last_session_for(exercise)
    if not row:
        raise HTTPException(404, "no history for that exercise")
    return row
