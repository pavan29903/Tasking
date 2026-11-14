"""Today's work: each member says what they are working on, and everyone in the team can see it."""
from datetime import date, datetime, timedelta, timezone
from typing import List

from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..access import require_member
from ..db import get_db
from ..models import DailyUpdate, Membership, User
from ..schemas import UpdateIn, UpdateOut
from ..security import current_user

router = APIRouter(prefix="/api/teams", tags=["today's work"])


def _out(u: DailyUpdate) -> UpdateOut:
    return UpdateOut(user_id=u.user_id, day=u.day, text=u.text,
                     areas=[a for a in u.areas.split(",") if a], updated_at=u.updated_at)


@router.get("/{team_id}/updates", response_model=List[UpdateOut])
def list_updates(team_id: int, day: date, user: User = Depends(current_user),
                 db: Session = Depends(get_db)) -> List[UpdateOut]:
    """Everyone's update for one day (the browser sends its own local date). People who left the team are hidden."""
    require_member(db, team_id, user)
    rows = db.scalars(select(DailyUpdate)
                      .join(Membership, (Membership.team_id == DailyUpdate.team_id) & (Membership.user_id == DailyUpdate.user_id))
                      .where(DailyUpdate.team_id == team_id, DailyUpdate.day == day)
                      .order_by(DailyUpdate.updated_at.desc()))
    return [_out(u) for u in rows]


@router.put("/{team_id}/updates/{day}", response_model=UpdateOut,
            responses={204: {"description": "Blank update: removed"}})
def save_update(team_id: int, day: date, body: UpdateIn, user: User = Depends(current_user),
                db: Session = Depends(get_db)):
    """Write or change your own update for a day. Sending it blank removes it."""
    require_member(db, team_id, user)
    if day > datetime.now(timezone.utc).date() + timedelta(days=1):  # +1: ahead-of-UTC time zones are already "tomorrow"
        raise HTTPException(422, "You can't write an update for a future day")
    row = db.scalar(select(DailyUpdate).where(DailyUpdate.team_id == team_id, DailyUpdate.user_id == user.id,
                                              DailyUpdate.day == day))
    if not body.text.strip() and not body.areas:
        if row:
            db.delete(row)
            db.commit()
        return Response(status_code=204)
    if row is None:
        row = DailyUpdate(team_id=team_id, user_id=user.id, day=day)
        db.add(row)
    row.text, row.areas = body.text.strip(), ",".join(body.areas)
    db.commit()
    return _out(row)
