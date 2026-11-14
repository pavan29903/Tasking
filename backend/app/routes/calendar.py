from fastapi import APIRouter, Depends, HTTPException, Response
from sqlalchemy.orm import Session

from .. import calendar
from ..db import get_db
from ..models import User
from ..schemas import CalendarIn, MeetingOut, MeetingsOut
from ..security import current_user

router = APIRouter(prefix="/api/me", tags=["calendar"])


def _out(meetings) -> list:
    return [MeetingOut.model_validate(m) for m in meetings]


@router.get("/meetings", response_model=MeetingsOut)
def my_meetings(user: User = Depends(current_user)) -> MeetingsOut:
    """Your upcoming meetings from your connected calendar. Problems come back as `error`, not a failure,
    so the Meetings page still shows your notes."""
    if not user.calendar_url:
        return MeetingsOut(connected=False)
    try:
        return MeetingsOut(connected=True, meetings=_out(calendar.upcoming(user.calendar_url)))
    except calendar.CalendarError as e:
        return MeetingsOut(connected=True, error=str(e))


@router.put("/calendar", response_model=MeetingsOut)
def connect(body: CalendarIn, user: User = Depends(current_user), db: Session = Depends(get_db)) -> MeetingsOut:
    """Save your private calendar link, after checking that it really returns a calendar."""
    try:
        url = calendar.check_url(body.url)
        calendar.forget(url)
        meetings = calendar.upcoming(url)
    except calendar.CalendarError as e:
        raise HTTPException(400, str(e))
    calendar.forget(user.calendar_url)
    user.calendar_url = url
    db.commit()
    return MeetingsOut(connected=True, meetings=_out(meetings))


@router.delete("/calendar", status_code=204)
def disconnect(user: User = Depends(current_user), db: Session = Depends(get_db)) -> Response:
    calendar.forget(user.calendar_url)
    user.calendar_url = None
    db.commit()
    return Response(status_code=204)
