"""Team membership checks and task helpers shared by the routes."""
from datetime import date
from typing import Any, Dict, List, Optional

from fastapi import HTTPException
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from .models import Activity, Comment, Membership, Note, Task, Team, User
from .notes import Member
from .schemas import TaskOut

TRACKED = ("title", "status", "priority", "assignee_id", "due_date", "description", "planned_on")


def require_member(db: Session, team_id: int, user: User) -> Membership:
    membership = db.get(Membership, (team_id, user.id))
    if membership is None:  # 404, not 403: do not reveal which teams exist
        raise HTTPException(404, "Team not found")
    return membership


def get_task(db: Session, task_id: int, user: User) -> Task:
    task = db.get(Task, task_id)
    if task is None or db.get(Membership, (task.team_id, user.id)) is None:
        raise HTTPException(404, "Task not found")
    return task


def get_note(db: Session, note_id: int, user: User) -> Note:
    note = db.get(Note, note_id)
    if note is None or db.get(Membership, (note.team_id, user.id)) is None:
        raise HTTPException(404, "Note not found")
    return note


def members_of(db: Session, team_id: int) -> List[Member]:
    rows = db.execute(select(User.id, User.name, User.email).join(Membership, Membership.user_id == User.id)
                      .where(Membership.team_id == team_id).order_by(User.name)).all()
    return [(r.id, r.name, r.email) for r in rows]


def check_assignee(db: Session, team_id: int, assignee_id: Optional[int]) -> None:
    if assignee_id is not None and db.get(Membership, (team_id, assignee_id)) is None:
        raise HTTPException(400, "The assignee must be a member of this team")


def _text(value: Any) -> Optional[str]:
    if value is None:
        return None
    return value.isoformat() if isinstance(value, date) else str(value)


def create_task(db: Session, team: Team, user: User, data: Dict[str, Any], note_id: Optional[int] = None) -> Task:
    check_assignee(db, team.id, data.get("assignee_id"))
    locked = db.execute(select(Team).where(Team.id == team.id).with_for_update()).scalar_one()
    number = locked.next_number
    locked.next_number = number + 1
    task = Task(team_id=team.id, number=number, reporter_id=user.id, note_id=note_id, **data)
    db.add(task)
    db.flush()
    db.add(Activity(task_id=task.id, actor_id=user.id, field="created", new=task.title))
    return task


def apply_patch(db: Session, task: Task, user: User, changes: Dict[str, Any]) -> None:
    if "assignee_id" in changes:
        check_assignee(db, task.team_id, changes["assignee_id"])
        if changes["assignee_id"] != task.assignee_id:
            changes.setdefault("planned_on", None)  # a Today list is the assignee's own; the new owner plans it
    if changes.get("planned_on") and changes.get("assignee_id", task.assignee_id) is None:
        raise HTTPException(422, "Assign the task to someone before putting it on Today")
    for name, value in changes.items():
        if name not in TRACKED or getattr(task, name) == value:
            continue
        old = getattr(task, name)
        setattr(task, name, value)
        long_text = name == "description"  # history says "changed the description", not the full text
        db.add(Activity(task_id=task.id, actor_id=user.id, field=name,
                        old=None if long_text else _text(old), new=None if long_text else _text(value)))


def task_out(task: Task, key: str, comment_count: int = 0) -> TaskOut:
    return TaskOut(id=task.id, key=f"{key}-{task.number}", number=task.number, team_id=task.team_id,
                   title=task.title, description=task.description, status=task.status, priority=task.priority,
                   assignee_id=task.assignee_id, reporter_id=task.reporter_id, due_date=task.due_date,
                   note_id=task.note_id, planned_on=task.planned_on, comment_count=comment_count, created_at=task.created_at,
                   updated_at=task.updated_at)


def comment_counts(db: Session, task_ids: List[int]) -> Dict[int, int]:
    if not task_ids:
        return {}
    rows = db.execute(select(Comment.task_id, func.count()).where(Comment.task_id.in_(task_ids))
                      .group_by(Comment.task_id)).all()
    return {task_id: count for task_id, count in rows}
