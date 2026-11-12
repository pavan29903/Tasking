from datetime import date
from typing import List

from fastapi import APIRouter, Depends, File, HTTPException, Request, Response, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from .. import excel
from ..access import (apply_patch, comment_counts, create_task, get_task, members_of, require_member,
                      task_out)
from ..db import get_db
from ..models import Activity, Comment, Membership, Task, Team, User
from ..notes import parse_line
from ..schemas import (ActivityOut, CommentIn, CommentOut, ImportOut, QuickIn, TaskIn, TaskOut,
                       TaskPatch)
from ..security import current_user

router = APIRouter(prefix="/api", tags=["tasks"])
NOT_NULL = ("title", "description", "status", "priority")


@router.get("/teams/{team_id}/tasks", response_model=List[TaskOut])
def list_tasks(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> List[TaskOut]:
    require_member(db, team_id, user)
    team = db.get(Team, team_id)
    tasks = list(db.scalars(select(Task).where(Task.team_id == team_id).order_by(Task.number.desc())))
    counts = comment_counts(db, [t.id for t in tasks])
    return [task_out(t, team.key, counts.get(t.id, 0)) for t in tasks]


@router.post("/teams/{team_id}/tasks", response_model=TaskOut, status_code=201)
def add_task(team_id: int, body: TaskIn, user: User = Depends(current_user),
             db: Session = Depends(get_db)) -> TaskOut:
    require_member(db, team_id, user)
    team = db.get(Team, team_id)
    task = create_task(db, team, user, body.model_dump())
    db.commit()
    return task_out(task, team.key)


@router.post("/teams/{team_id}/tasks/quick", response_model=TaskOut, status_code=201)
def quick_add(team_id: int, body: QuickIn, user: User = Depends(current_user),
              db: Session = Depends(get_db)) -> TaskOut:
    """One line like 'Send the deck @ravi !high due:fri' becomes a task."""
    require_member(db, team_id, user)
    team = db.get(Team, team_id)
    item = parse_line(body.text, members_of(db, team_id), date.today(), force=True)
    if item is None:
        raise HTTPException(400, "Write what needs doing, not only @name, !priority or due:")
    if item.due_error:
        raise HTTPException(400, item.due_error)
    task = create_task(db, team, user, {"title": item.title, "priority": item.priority,
                                        "assignee_id": item.assignee_id, "due_date": item.due_date})
    db.commit()
    return task_out(task, team.key)


@router.patch("/tasks/{task_id}", response_model=TaskOut)
def update_task(task_id: int, body: TaskPatch, user: User = Depends(current_user),
                db: Session = Depends(get_db)) -> TaskOut:
    task = get_task(db, task_id, user)
    changes = body.model_dump(exclude_unset=True)
    for name in NOT_NULL:
        if name in changes and changes[name] is None:
            raise HTTPException(422, f"'{name}' cannot be empty")
    apply_patch(db, task, user, changes)
    db.commit()
    team = db.get(Team, task.team_id)
    return task_out(task, team.key, comment_counts(db, [task.id]).get(task.id, 0))


@router.delete("/tasks/{task_id}", status_code=204)
def delete_task(task_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    task = get_task(db, task_id, user)
    if task.reporter_id != user.id and db.get(Membership, (task.team_id, user.id)).role != "owner":
        raise HTTPException(403, "Only the person who created this task or the team owner can delete it")
    db.delete(task)
    db.commit()
    return Response(status_code=204)


@router.get("/tasks/{task_id}/comments", response_model=List[CommentOut])
def list_comments(task_id: int, user: User = Depends(current_user),
                  db: Session = Depends(get_db)) -> List[CommentOut]:
    get_task(db, task_id, user)
    rows = db.execute(select(Comment, User.name).join(User, User.id == Comment.author_id)
                      .where(Comment.task_id == task_id).order_by(Comment.created_at, Comment.id)).all()
    return [CommentOut(id=c.id, task_id=c.task_id, author_id=c.author_id, author_name=name, body=c.body,
                       created_at=c.created_at) for c, name in rows]


@router.post("/tasks/{task_id}/comments", response_model=CommentOut, status_code=201)
def add_comment(task_id: int, body: CommentIn, user: User = Depends(current_user),
                db: Session = Depends(get_db)) -> CommentOut:
    get_task(db, task_id, user)
    comment = Comment(task_id=task_id, author_id=user.id, body=body.body)
    db.add(comment)
    db.commit()
    return CommentOut(id=comment.id, task_id=task_id, author_id=user.id, author_name=user.name,
                      body=comment.body, created_at=comment.created_at)


@router.get("/tasks/{task_id}/activity", response_model=List[ActivityOut])
def list_activity(task_id: int, user: User = Depends(current_user),
                  db: Session = Depends(get_db)) -> List[ActivityOut]:
    get_task(db, task_id, user)
    rows = db.execute(select(Activity, User.name).join(User, User.id == Activity.actor_id)
                      .where(Activity.task_id == task_id).order_by(Activity.created_at, Activity.id)).all()
    return [ActivityOut(id=a.id, actor_id=a.actor_id, actor_name=name, field=a.field, old=a.old, new=a.new,
                        created_at=a.created_at) for a, name in rows]


@router.get("/teams/{team_id}/export")
def export_tasks(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    require_member(db, team_id, user)
    team = db.get(Team, team_id)
    tasks = list(db.scalars(select(Task).where(Task.team_id == team_id).order_by(Task.number)))
    names = {uid: name for uid, name, _ in members_of(db, team_id)}
    names.update({u.id: u.name for u in db.scalars(select(User).where(User.id.in_(
        {t.reporter_id for t in tasks} - set(names))))})  # reporters who have since left the team
    filename = f"{team.key}-tasks-{date.today().isoformat()}.xlsx"
    return Response(excel.export_workbook(team.key, tasks, names),
                    media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


@router.post("/teams/{team_id}/import", response_model=ImportOut)
async def import_tasks(team_id: int, request: Request, file: UploadFile = File(...),
                       user: User = Depends(current_user), db: Session = Depends(get_db)) -> ImportOut:
    require_member(db, team_id, user)
    limit = request.app.state.settings.max_upload_bytes
    data = await file.read(limit + 1)
    if len(data) > limit:
        raise HTTPException(413, f"The file is larger than {limit // (1024 * 1024)} MB")
    if not data:
        raise HTTPException(400, "The file is empty")
    try:
        rows = excel.read_rows(data)
    except ValueError as exc:
        raise HTTPException(400, str(exc)) from exc
    except Exception as exc:  # corrupt or password-protected workbook
        raise HTTPException(400, "Could not open this file. Save it as .xlsx or .csv and try again.") from exc
    result = excel.rows_to_drafts(rows, members_of(db, team_id), date.today())
    team = db.get(Team, team_id)
    for draft in result.drafts:
        create_task(db, team, user, draft)
    db.commit()
    return ImportOut(created=len(result.drafts), issues=result.issues)
