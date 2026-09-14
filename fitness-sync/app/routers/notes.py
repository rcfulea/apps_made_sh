from fastapi import APIRouter, HTTPException
from .. import db
from ..models import NoteIn, NoteUpdate

router = APIRouter(prefix="/api/notes", tags=["notes"])


@router.get("")
def list_notes(from_: str | None = None, to: str | None = None,
               author: str | None = None, tag: str | None = None):
    return db.list_notes(from_date=from_, to_date=to, author=author, tag=tag)


@router.get("/{note_id}")
def get_note(note_id: int):
    row = db.get_note(note_id)
    if not row:
        raise HTTPException(404, "no note with that id")
    return row


@router.post("", status_code=201)
def add_note(body: NoteIn):
    """LLM- and user-authored insights/annotations. Set author='llm' for notes written by
    the local LLM's analysis; author='user' for your own."""
    return db.insert_note(**body.model_dump())


@router.put("/{note_id}")
def edit_note(note_id: int, body: NoteUpdate):
    if not db.get_note(note_id):
        raise HTTPException(404, "no note with that id")
    return db.update_note(note_id, **body.model_dump())


@router.delete("/{note_id}", status_code=204)
def delete_note(note_id: int):
    if not db.delete_note(note_id):
        raise HTTPException(404, "no note with that id")
