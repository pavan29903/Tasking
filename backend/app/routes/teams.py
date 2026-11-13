import re
import secrets
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..access import require_member
from ..db import get_db
from ..models import Membership, Task, Team, User
from ..schemas import JoinIn, MemberIn, MemberOut, TeamIn, TeamOut
from ..security import current_user

router = APIRouter(prefix="/api/teams", tags=["teams"])
CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, easy to read out in a meeting


def new_invite_code(db: Session) -> str:
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(8))
        if not db.scalar(select(Team.id).where(Team.invite_code == code)):
            return code


def default_key(name: str) -> str:
    letters = re.sub(r"[^A-Za-z]", "", name).upper()
    return (letters[:3] or "TSK").ljust(2, "X")


def _out(team: Team, role: str) -> TeamOut:
    return TeamOut(id=team.id, name=team.name, key=team.key, invite_code=team.invite_code, role=role)


@router.get("", response_model=List[TeamOut])
def my_teams(user: User = Depends(current_user), db: Session = Depends(get_db)) -> List[TeamOut]:
    rows = db.execute(select(Team, Membership.role).join(Membership, Membership.team_id == Team.id)
                      .where(Membership.user_id == user.id).order_by(Team.name)).all()
    return [_out(team, role) for team, role in rows]


@router.post("", response_model=TeamOut, status_code=201)
def create_team(body: TeamIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TeamOut:
    team = Team(name=body.name, key=body.key or default_key(body.name), invite_code=new_invite_code(db),
                created_by=user.id, next_number=1)
    db.add(team)
    db.flush()
    db.add(Membership(team_id=team.id, user_id=user.id, role="owner"))
    db.commit()
    return _out(team, "owner")


@router.post("/join", response_model=TeamOut)
def join_team(body: JoinIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TeamOut:
    team = db.scalar(select(Team).where(Team.invite_code == body.code.upper().replace(" ", "")))
    if team is None:
        raise HTTPException(404, "That invite code does not match any team. Check it with whoever shared it.")
    membership = db.get(Membership, (team.id, user.id))
    if membership is None:
        membership = Membership(team_id=team.id, user_id=user.id, role="member")
        db.add(membership)
        db.commit()
    return _out(team, membership.role)


@router.get("/{team_id}/members", response_model=List[MemberOut])
def members(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> List[MemberOut]:
    require_member(db, team_id, user)
    rows = db.execute(select(User, Membership).join(Membership, Membership.user_id == User.id)
                      .where(Membership.team_id == team_id).order_by(User.name)).all()
    return [_member(u, m) for u, m in rows]


def _member(person: User, membership: Membership) -> MemberOut:
    return MemberOut(user_id=person.id, name=person.name, email=person.email, role=membership.role,
                     job_title=membership.job_title)


@router.patch("/{team_id}/members/{member_id}", response_model=MemberOut)
def update_member(team_id: int, member_id: int, body: MemberIn, user: User = Depends(current_user),
                  db: Session = Depends(get_db)) -> MemberOut:
    """Set someone's job role (Developer, BDA...). Anyone may set their own; the owner may set anyone's."""
    me = require_member(db, team_id, user)
    if member_id != user.id and me.role != "owner":
        raise HTTPException(403, "Only the team owner can change other people's roles")
    target = db.get(Membership, (team_id, member_id))
    if target is None:
        raise HTTPException(404, "That person is not in this team")
    target.job_title = " ".join((body.job_title or "").split()) or None
    db.commit()
    return _member(db.get(User, member_id), target)


@router.post("/{team_id}/invite-code", response_model=TeamOut)
def rotate_invite_code(team_id: int, user: User = Depends(current_user), db: Session = Depends(get_db)) -> TeamOut:
    if require_member(db, team_id, user).role != "owner":
        raise HTTPException(403, "Only the team owner can change the invite code")
    team = db.get(Team, team_id)
    team.invite_code = new_invite_code(db)
    db.commit()
    return _out(team, "owner")


@router.delete("/{team_id}/members/{member_id}", status_code=204)
def remove_member(team_id: int, member_id: int, user: User = Depends(current_user),
                  db: Session = Depends(get_db)) -> Response:
    me = require_member(db, team_id, user)
    if member_id != user.id and me.role != "owner":
        raise HTTPException(403, "Only the team owner can remove other people")
    target = db.get(Membership, (team_id, member_id))
    if target is None:
        raise HTTPException(404, "That person is not in this team")
    if target.role == "owner":
        owners = db.scalar(select(func.count()).where(Membership.team_id == team_id, Membership.role == "owner"))
        if owners == 1:
            raise HTTPException(400, "The team needs an owner. The only owner cannot leave.")
    db.delete(target)
    for task in db.scalars(select(Task).where(Task.team_id == team_id, Task.assignee_id == member_id)):
        task.assignee_id = None  # their open work goes back to the pool
    db.commit()
    return Response(status_code=204)
