"""Turn meeting-note lines into task drafts.

An action line starts with one of: ``[ ]``, ``[]``, ``- [ ]``, ``todo:``, ``action:``.
Inside it you can write:

* ``@ravi``          assignee (first name, full name without spaces, or email name)
* ``!high``          priority: low, medium (or med), high, urgent
* ``due:fri``        today, tomorrow, mon..sun (next one after today),
                     2026-11-20, 20/11/2026, 20-11-2026 or 20/11 (day first)

A line that has been turned into a task ends with its key, e.g. ``(TSK-12)``.
"""
import re
from dataclasses import dataclass
from datetime import date, datetime, timedelta
from typing import Iterable, List, Optional, Sequence, Tuple

ACTION_PREFIX = re.compile(r"^\s*(?:[-*]\s*)?(?:\[\s?\]|todo:|action:)\s*", re.IGNORECASE)
CONVERTED = re.compile(r"\s*\(([A-Z][A-Z0-9]{0,5}-\d+)\)\s*$")
MENTION = re.compile(r"(?<!\S)@([\w.\-]+)")
PRIORITY = re.compile(r"(?<!\S)!(low|medium|med|high|urgent)\b", re.IGNORECASE)
DUE = re.compile(r"(?<!\S)due:(\S+)", re.IGNORECASE)
_DAYS = ("monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday")
WEEKDAYS = {**{d[:3]: i for i, d in enumerate(_DAYS)}, **{d: i for i, d in enumerate(_DAYS)}}
TITLE_MAX = 200

Member = Tuple[int, str, str]  # (user id, name, email)


@dataclass
class ParsedItem:
    line: int
    text: str
    title: str
    assignee_id: Optional[int] = None
    assignee_query: Optional[str] = None
    priority: str = "medium"
    due_date: Optional[date] = None
    due_error: Optional[str] = None
    task_key: Optional[str] = None


def parse_date(value: str, today: date) -> Optional[date]:
    """Parse a written date; day comes before month (20/11 is 20 November)."""
    v = value.strip().lower().rstrip(".,;")
    if v == "today":
        return today
    if v == "tomorrow":
        return today + timedelta(days=1)
    if v in WEEKDAYS:  # the next one after today, so "due:mon" said on a Monday means next week
        return today + timedelta(days=(WEEKDAYS[v] - today.weekday()) % 7 or 7)
    for fmt in ("%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%d %b %Y", "%d %B %Y"):
        try:
            return datetime.strptime(v, fmt).date()
        except ValueError:
            pass
    m = re.fullmatch(r"(\d{1,2})[/-](\d{1,2})", v)
    if m:
        try:
            return date(today.year, int(m.group(2)), int(m.group(1)))
        except ValueError:
            return None
    return None


def match_member(query: str, members: Iterable[Member]) -> Optional[int]:
    """Return the one member a mention refers to, or None if no match or ambiguous."""
    q = query.lower().strip(".-")
    if not q:
        return None
    exact, prefix = set(), set()
    for user_id, name, email in members:
        first = name.split()[0].lower() if name.split() else ""
        options = {first, name.lower().replace(" ", ""), email.split("@")[0].lower()}
        if q in options:
            exact.add(user_id)
        elif first.startswith(q):
            prefix.add(user_id)
    pool = exact or prefix
    return next(iter(pool)) if len(pool) == 1 else None


def parse_line(text: str, members: Sequence[Member], today: date, line: int = 0,
               force: bool = False) -> Optional[ParsedItem]:
    """Parse one line. ``force`` treats any line as an action (used by quick add)."""
    prefix = ACTION_PREFIX.match(text)
    if not prefix and not force:
        return None
    rest = text[prefix.end():] if prefix else text
    item = ParsedItem(line=line, text=text, title="")
    converted = CONVERTED.search(rest)
    if converted:
        item.task_key = converted.group(1)
        rest = rest[:converted.start()]
    mention = MENTION.search(rest)
    if mention:
        item.assignee_query = mention.group(1)
        item.assignee_id = match_member(mention.group(1), members)
    for found in PRIORITY.finditer(rest):  # last one wins
        word = found.group(1).lower()
        item.priority = "medium" if word == "med" else word
    due = DUE.search(rest)
    if due:
        item.due_date = parse_date(due.group(1), today)
        if item.due_date is None:
            item.due_error = f"Could not read the date '{due.group(1)}'"
    title = PRIORITY.sub("", DUE.sub("", MENTION.sub("", rest)))
    item.title = " ".join(title.split())[:TITLE_MAX]
    return item if item.title else None


def parse_note(body: str, members: Sequence[Member], today: date) -> List[ParsedItem]:
    items = []
    for index, text in enumerate(body.splitlines()):
        parsed = parse_line(text, members, today, line=index)
        if parsed:
            items.append(parsed)
    return items


def mark_converted(body: str, line: int, key: str) -> str:
    """Append ``(KEY-n)`` to a line so it is not turned into a task twice."""
    lines = body.splitlines()
    if not 0 <= line < len(lines):
        raise IndexError(line)
    if CONVERTED.search(lines[line]):
        raise ValueError("line already converted")
    lines[line] = f"{lines[line].rstrip()} ({key})"
    trailing = "\n" if body.endswith("\n") else ""
    return "\n".join(lines) + trailing
