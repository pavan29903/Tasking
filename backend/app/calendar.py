"""Read someone's calendar from its private iCal link (Google Calendar's "Secret address in iCal format").

Only a few calendar hosts are allowed, so the server can't be pointed at arbitrary addresses.
The link is a secret: it is never logged or sent back to the browser.
"""
import re
import time
import urllib.error
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
from urllib.parse import urlsplit

import icalendar
import recurring_ical_events

HOSTS = {"calendar.google.com", "outlook.office365.com", "outlook.live.com"}
MAX_BYTES = 15 * 1024 * 1024
CACHE_SECONDS = 180
JOIN = re.compile(
    r"https://(?:[\w-]+\.)*(?:meet\.google\.com|zoom\.us|teams\.microsoft\.com|teams\.live\.com|webex\.com)/[^\s<>\"'\\]*",
    re.I)


class CalendarError(Exception):
    """Something the person can fix; the message is safe to show them."""


@dataclass
class Meeting:
    id: str  # stays the same for one occurrence, so notes can be matched to it
    title: str
    starts_at: datetime
    ends_at: datetime
    link: Optional[str] = None
    attendees: List[str] = field(default_factory=list)


def check_url(url: str) -> str:
    """Normalise a pasted calendar link, or explain what is wrong with it."""
    url = url.strip()
    if url.lower().startswith("webcal://"):
        url = "https://" + url[len("webcal://"):]
    parts = urlsplit(url)
    if parts.scheme != "https" or (parts.hostname or "").lower() not in HOSTS:
        raise CalendarError("Paste the 'Secret address in iCal format' from Google Calendar settings "
                            "(it starts with https://calendar.google.com/).")
    return url


class _AllowedRedirects(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if urlsplit(newurl).scheme != "https" or (urlsplit(newurl).hostname or "").lower() not in HOSTS:
            raise CalendarError("Your calendar link points somewhere unexpected. Copy it again from Google Calendar.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


_opener = urllib.request.build_opener(_AllowedRedirects)


def fetch(url: str) -> bytes:
    request = urllib.request.Request(check_url(url), headers={"User-Agent": "Tasking calendar reader"})
    try:
        with _opener.open(request, timeout=15) as res:
            data = res.read(MAX_BYTES + 1)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403, 404):
            raise CalendarError("Google no longer accepts this calendar link (it may have been reset). "
                                "Copy the secret address again and reconnect.") from None
        raise CalendarError(f"Your calendar didn't load (error {e.code}). Try again in a minute.") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise CalendarError("Couldn't reach your calendar. Try again in a minute.") from None
    if len(data) > MAX_BYTES:
        raise CalendarError("This calendar is too large to read (over 15 MB).")
    return data


def _text(value) -> str:
    return str(value) if value is not None else ""


def _join_link(event) -> Optional[str]:
    for name in ("X-GOOGLE-CONFERENCE", "LOCATION", "URL", "DESCRIPTION"):
        found = JOIN.search(_text(event.get(name)))
        if found:
            return found.group(0).rstrip(".,;)")
    return None


def _attendees(event) -> List[str]:
    raw = event.get("ATTENDEE") or []
    people = raw if isinstance(raw, list) else [raw]
    names = []
    for person in people:
        name = person.params.get("CN") or str(person).split(":", 1)[-1]
        name = name.split("@")[0] if "@" in name else name
        if name and name not in names:
            names.append(str(name))
    return names[:15]


def _utc(value) -> datetime:
    return (value if value.tzinfo else value.replace(tzinfo=timezone.utc)).astimezone(timezone.utc)


def meetings_between(ics: bytes, start: datetime, end: datetime) -> List[Meeting]:
    """Timed, not-cancelled events from start to end (recurring ones expanded), earliest first."""
    try:
        calendar = icalendar.Calendar.from_ical(ics)
    except ValueError:
        raise CalendarError("That link didn't return a calendar. Copy the 'Secret address in iCal format'.") from None
    found = []
    for event in recurring_ical_events.of(calendar).between(start, end):
        begins = event.get("DTSTART").dt
        if not isinstance(begins, datetime):  # all-day: holidays and leave, not meetings
            continue
        if _text(event.get("STATUS")).upper() == "CANCELLED":
            continue
        ends = event.get("DTEND").dt if event.get("DTEND") else begins
        begins = _utc(begins)
        found.append(Meeting(
            id=f"{_text(event.get('UID'))[:250]}|{begins:%Y%m%dT%H%M}",
            title=_text(event.get("SUMMARY")).strip()[:200] or "(No title)",
            starts_at=begins, ends_at=_utc(ends) if isinstance(ends, datetime) else begins,
            link=_join_link(event), attendees=_attendees(event)))
    return sorted(found, key=lambda m: (m.starts_at, m.title))


# A small in-memory cache, so the Meetings page doesn't refetch the whole calendar on every visit.
_cache: Dict[str, Tuple[float, List[Meeting]]] = {}


def upcoming(url: str, now: Optional[datetime] = None) -> List[Meeting]:
    """Meetings from yesterday to 8 days ahead; the browser decides which of them are 'today' locally."""
    now = now or datetime.now(timezone.utc)
    hit = _cache.get(url)
    if hit and time.monotonic() - hit[0] < CACHE_SECONDS:
        return hit[1]
    result = meetings_between(fetch(url), now - timedelta(days=1), now + timedelta(days=8))
    if len(_cache) > 200:
        _cache.clear()
    _cache[url] = (time.monotonic(), result)
    return result


def forget(url: Optional[str]) -> None:
    if url:
        _cache.pop(url, None)

