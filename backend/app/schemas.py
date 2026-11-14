import re
from datetime import date, datetime, timezone
from typing import Annotated, List, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, PlainSerializer, field_validator

Status = Literal["todo", "in_progress", "blocked", "done"]
Priority = Literal["low", "medium", "high", "urgent"]
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def _utc(value: datetime) -> str:
    # SQLite hands datetimes back without a timezone; they are stored in UTC.
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).isoformat()


UTCDateTime = Annotated[datetime, PlainSerializer(_utc, return_type=str)]


class Out(BaseModel):
    model_config = ConfigDict(from_attributes=True)


class Clean(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True)


# ------------------------------------------------------------------ auth
class RegisterIn(Clean):
    name: str = Field(min_length=1, max_length=80)
    email: str = Field(max_length=254)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("email")
    @classmethod
    def _email(cls, v: str) -> str:
        if not EMAIL.match(v):
            raise ValueError("Enter a valid email address")
        return v.lower()


class LoginIn(Clean):
    email: str
    password: str

    @field_validator("email")
    @classmethod
    def _lower(cls, v: str) -> str:
        return v.lower()


class UserOut(Out):
    id: int
    name: str
    email: str


class AuthOut(BaseModel):
    token: str
    user: UserOut


# ------------------------------------------------------------------ teams
class TeamIn(Clean):
    name: str = Field(min_length=1, max_length=80)
    key: Optional[str] = Field(default=None, description="2-6 letters used in task keys, e.g. TSK")

    @field_validator("key")
    @classmethod
    def _key(cls, v: Optional[str]) -> Optional[str]:
        if v in (None, ""):
            return None
        v = v.upper()
        if not re.fullmatch(r"[A-Z][A-Z0-9]{1,5}", v):
            raise ValueError("Use 2-6 letters or digits, starting with a letter")
        return v


class JoinIn(Clean):
    code: str = Field(min_length=4, max_length=16)


class TeamOut(BaseModel):
    id: int
    name: str
    key: str
    invite_code: str
    role: str


class MemberOut(BaseModel):
    user_id: int
    name: str
    email: str
    role: str
    job_title: Optional[str] = None


class MemberIn(Clean):
    job_title: Optional[str] = Field(None, max_length=40)  # blank or null clears it


# ------------------------------------------------------------------ tasks
class TaskIn(Clean):
    title: str = Field(min_length=1, max_length=200)
    description: str = Field(default="", max_length=10000)
    status: Status = "todo"
    priority: Priority = "medium"
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None


class TaskPatch(Clean):
    title: Optional[str] = Field(default=None, min_length=1, max_length=200)
    description: Optional[str] = Field(default=None, max_length=10000)
    status: Optional[Status] = None
    priority: Optional[Priority] = None
    assignee_id: Optional[int] = None
    due_date: Optional[date] = None


class QuickIn(Clean):
    text: str = Field(min_length=1, max_length=500)


class TaskOut(BaseModel):
    id: int
    key: str
    number: int
    team_id: int
    title: str
    description: str
    status: Status
    priority: Priority
    assignee_id: Optional[int]
    reporter_id: int
    due_date: Optional[date]
    note_id: Optional[int]
    comment_count: int = 0
    created_at: UTCDateTime
    updated_at: UTCDateTime


class CommentIn(Clean):
    body: str = Field(min_length=1, max_length=5000)


class CommentOut(BaseModel):
    id: int
    task_id: int
    author_id: int
    author_name: str
    body: str
    created_at: UTCDateTime


class ActivityOut(BaseModel):
    id: int
    actor_id: int
    actor_name: str
    field: str
    old: Optional[str]
    new: Optional[str]
    created_at: UTCDateTime


class ImportIssue(BaseModel):
    row: Optional[int]
    message: str
    skipped: bool


class ImportOut(BaseModel):
    created: int
    issues: List[ImportIssue]


# ------------------------------------------------------------------ notes
class NoteIn(Clean):
    title: str = Field(min_length=1, max_length=200)
    meeting_date: Optional[date] = None
    body: str = Field(default="", max_length=50000)
    starts_at: Optional[datetime] = None
    meeting_link: Optional[str] = Field(None, max_length=500)
    event_id: Optional[str] = Field(None, max_length=300)

    @field_validator("meeting_link")
    @classmethod
    def _web_link(cls, value: Optional[str]) -> Optional[str]:
        if not value:
            return None
        if not re.match(r"^https?://\S+$", value, re.I):
            raise ValueError("Paste the meeting's web link, starting with https://")
        return value


class NoteOut(Out):
    id: int
    team_id: int
    author_id: int
    title: str
    meeting_date: Optional[date]
    body: str
    starts_at: Optional[UTCDateTime] = None
    meeting_link: Optional[str] = None
    event_id: Optional[str] = None
    created_at: UTCDateTime
    updated_at: UTCDateTime


# ------------------------------------------------------------------ today's work
class UpdateIn(Clean):
    text: str = Field(default="", max_length=2000)
    areas: List[str] = Field(default_factory=list, max_length=8)

    @field_validator("areas")
    @classmethod
    def _tidy(cls, value: List[str]) -> List[str]:
        out: List[str] = []
        for area in (part for item in value for part in item.split(",")):  # commas separate areas
            area = " ".join(area.split())
            if len(area) > 40:
                raise ValueError("Keep each repo or area under 40 characters")
            if area and area.lower() not in (a.lower() for a in out):
                out.append(area)
        if len(out) > 8:
            raise ValueError("Up to 8 repos or areas")
        return out


class UpdateOut(BaseModel):
    user_id: int
    day: date
    text: str
    areas: List[str]
    updated_at: UTCDateTime


# ------------------------------------------------------------------ calendar
class CalendarIn(BaseModel):
    url: str = Field(min_length=1, max_length=2000)


class MeetingOut(Out):
    id: str
    title: str
    starts_at: UTCDateTime
    ends_at: UTCDateTime
    link: Optional[str]
    attendees: List[str]


class MeetingsOut(BaseModel):
    connected: bool
    error: Optional[str] = None
    meetings: List[MeetingOut] = []


class ParseIn(BaseModel):
    text: str = Field(max_length=50000)


class ParsedItemOut(BaseModel):
    line: int
    text: str
    title: str
    assignee_id: Optional[int]
    assignee_query: Optional[str]
    priority: Priority
    due_date: Optional[date]
    due_error: Optional[str]
    task_key: Optional[str]


class ConvertIn(BaseModel):
    line: int = Field(ge=0)
    text: str = Field(description="The line as the client saw it; guards against converting a line that moved")


class ConvertOut(BaseModel):
    note: NoteOut
    tasks: List[TaskOut]
