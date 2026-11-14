from datetime import date
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..access import create_task, get_note, members_of, require_member, task_out
from ..db import get_db
from ..models import Membership, Note, Team, User
from ..notes import ParsedItem, mark_converted, parse_note
from ..schemas import ConvertIn, ConvertOut, NoteIn, NoteOut, ParsedItemOut, ParseIn
from ..security import current_user

router = APIRouter(prefix="/api", tags=["meeting notes"])


def _item(p: ParsedItem) -> ParsedItemOut:
    return ParsedItemOut(**p.__dict__)


@router.get("/teams/{team_id}/notes", response_model=List[NoteOut])
def list_notes(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> List[Note]:
    require_member(db, team_id, user)
    return list(db.scalars(select(Note).where(Note.team_id == team_id)
                           .order_by(Note.meeting_date.desc().nulls_last(), Note.updated_at.desc())))


@router.post("/teams/{team_id}/notes", response_model=NoteOut, status_code=201)
def create_note(team_id: int, body: NoteIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Note:
    require_member(db, team_id, user)
    note = Note(team_id=team_id, author_id=user.id, **body.model_dump())
    db.add(note)
    db.commit()
    return note


@router.put("/notes/{note_id}", response_model=NoteOut)
def update_note(note_id: int, body: NoteIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Note:
    note = get_note(db, note_id, user)
    for name, value in body.model_dump(exclude_unset=True).items():  # fields left out keep their value
        setattr(note, name, value)
    db.commit()
    return note


@router.delete("/notes/{note_id}", status_code=204)
def delete_note(note_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    note = get_note(db, note_id, user)
    if note.author_id != user.id and db.get(Membership, (note.team_id, user.id)).role != "owner":
        raise HTTPException(403, "Only the person who wrote these notes or the team owner can delete them")
    db.delete(note)  # tasks made from it stay; they just lose the link
    db.commit()
    return Response(status_code=204)


@router.post("/teams/{team_id}/parse", response_model=List[ParsedItemOut])
def parse(team_id: int, body: ParseIn, user: User = Depends(current_user),
          db: Session = Depends(get_db)) -> List[ParsedItemOut]:
    """Preview which lines of some notes would become tasks (used while typing)."""
    require_member(db, team_id, user)
    return [_item(p) for p in parse_note(body.text, members_of(db, team_id), date.today())]


def _convert(db: Session, note: Note, user: User, items: List[ParsedItem]) -> ConvertOut:
    team = db.get(Team, note.team_id)
    created = []
    for item in items:
        task = create_task(db, team, user, {"title": item.title, "priority": item.priority,
                                            "assignee_id": item.assignee_id, "due_date": item.due_date},
                           note_id=note.id)
        note.body = mark_converted(note.body, item.line, f"{team.key}-{task.number}")
        created.append(task_out(task, team.key))
    db.commit()
    return ConvertOut(note=NoteOut.model_validate(note), tasks=created)


@router.post("/notes/{note_id}/convert", response_model=ConvertOut)
def convert_line(note_id: int, body: ConvertIn, user: User = Depends(current_user),
                 db: Session = Depends(get_db)) -> ConvertOut:
    note = get_note(db, note_id, user)
    lines = note.body.splitlines()
    if body.line >= len(lines) or lines[body.line] != body.text:
        raise HTTPException(409, "These notes changed since you last saw them. Reload and try again.")
    item = next((p for p in parse_note(note.body, members_of(db, note.team_id), date.today())
                 if p.line == body.line), None)
    if item is None:
        raise HTTPException(400, "That line is not an action item. Start it with [ ] or todo:")
    if item.task_key:
        raise HTTPException(409, f"That line is already task {item.task_key}")
    return _convert(db, note, user, [item])


@router.post("/notes/{note_id}/convert-all", response_model=ConvertOut)
def convert_all(note_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> ConvertOut:
    note = get_note(db, note_id, user)
    pending = [p for p in parse_note(note.body, members_of(db, note.team_id), date.today()) if not p.task_key]
    return _convert(db, note, user, pending)
