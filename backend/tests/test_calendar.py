from datetime import datetime, timezone

import pytest

from app import calendar

ICS = b"""BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Google Inc//Google Calendar 70.9054//EN
BEGIN:VEVENT
UID:standup@google.com
DTSTART;TZID=Asia/Kolkata:20261110T100000
DTEND;TZID=Asia/Kolkata:20261110T101500
RRULE:FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR
SUMMARY:Stand-up
X-GOOGLE-CONFERENCE:https://meet.google.com/abc-defg-hij
ATTENDEE;CN=Meera Lead;PARTSTAT=ACCEPTED:mailto:meera@example.com
ATTENDEE;PARTSTAT=ACCEPTED:mailto:pavan@example.com
END:VEVENT
BEGIN:VEVENT
UID:review@google.com
DTSTART:20261114T093000Z
DTEND:20261114T103000Z
SUMMARY:Design review
DESCRIPTION:Agenda first.\\nJoin Zoom Meeting https://us02web.zoom.us/j/123456?pwd=abc. Thanks
END:VEVENT
BEGIN:VEVENT
UID:holiday@google.com
DTSTART;VALUE=DATE:20261116
DTEND;VALUE=DATE:20261117
SUMMARY:Holiday
END:VEVENT
BEGIN:VEVENT
UID:cancelled@google.com
DTSTART:20261115T050000Z
DTEND:20261115T060000Z
STATUS:CANCELLED
SUMMARY:Called off
END:VEVENT
BEGIN:VEVENT
UID:lunch@google.com
DTSTART:20261113T070000Z
SUMMARY:Lunch
LOCATION:Cafe downstairs
END:VEVENT
BEGIN:VEVENT
UID:later@google.com
DTSTART:20270101T050000Z
DTEND:20270101T060000Z
SUMMARY:Next year
END:VEVENT
END:VCALENDAR
""".replace(b"\n", b"\r\n")

START = datetime(2026, 11, 13, tzinfo=timezone.utc)
END = datetime(2026, 11, 17, tzinfo=timezone.utc)


def test_meetings_between_expands_filters_and_finds_links():
    found = calendar.meetings_between(ICS, START, END)
    titles = [(m.title, m.starts_at.isoformat()) for m in found]
    # Stand-up repeats on weekdays (10:00 IST = 04:30 UTC); the holiday, the cancelled one and next year are left out
    assert titles == [
        ("Stand-up", "2026-11-13T04:30:00+00:00"),
        ("Lunch", "2026-11-13T07:00:00+00:00"),
        ("Design review", "2026-11-14T09:30:00+00:00"),
        ("Stand-up", "2026-11-16T04:30:00+00:00"),
    ]
    standup, lunch, review = found[0], found[1], found[2]
    assert standup.link == "https://meet.google.com/abc-defg-hij"
    assert standup.attendees == ["Meera Lead", "pavan"]
    assert standup.ends_at.isoformat() == "2026-11-13T04:45:00+00:00"
    assert review.link == "https://us02web.zoom.us/j/123456?pwd=abc"  # trailing full stop trimmed
    assert lunch.link is None and lunch.ends_at == lunch.starts_at  # no end time: the page shows only the start
    assert standup.id != found[3].id and standup.id.startswith("standup@google.com|")  # one id per occurrence


@pytest.mark.parametrize("given,expected", [
    ("https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc/basic.ics",
     "https://calendar.google.com/calendar/ical/me%40gmail.com/private-abc/basic.ics"),
    ("  webcal://calendar.google.com/calendar/ical/x/basic.ics ", "https://calendar.google.com/calendar/ical/x/basic.ics"),
    ("https://outlook.office365.com/owa/calendar/x/calendar.ics", "https://outlook.office365.com/owa/calendar/x/calendar.ics"),
])
def test_check_url_accepts_calendar_links(given, expected):
    assert calendar.check_url(given) == expected


@pytest.mark.parametrize("bad", [
    "http://calendar.google.com/calendar/ical/x/basic.ics",  # not https
    "https://evil.example.com/calendar.ics",
    "https://calendar.google.com.evil.example.com/x.ics",
    "https://169.254.169.254/latest/meta-data",
    "file:///etc/passwd",
    "not a link",
])
def test_check_url_rejects_other_addresses(bad):
    with pytest.raises(calendar.CalendarError):
        calendar.check_url(bad)


def test_not_a_calendar():
    with pytest.raises(calendar.CalendarError, match="didn't return a calendar"):
        calendar.meetings_between(b"<html>Sign in</html>", START, END)


# ------------------------------------------------------------------ API
GOOD = "https://calendar.google.com/calendar/ical/pavan%40gmail.com/private-s3cret/basic.ics"


@pytest.fixture
def fake_calendar(monkeypatch):
    """Serve ICS for any allowed link; 'broken' in the link makes Google refuse it."""
    calls = []
    calendar._cache.clear()

    def fetch(url):
        calls.append(url)
        if "broken" in url:
            raise calendar.CalendarError("Google no longer accepts this calendar link")
        return ICS
    monkeypatch.setattr(calendar, "fetch", fetch)
    monkeypatch.setattr(calendar, "meetings_between",
                        lambda ics, start, end, real=calendar.meetings_between: real(ics, START, END))
    return calls


def test_connect_list_and_disconnect(signup, fake_calendar):
    me = signup()
    assert me.get("/api/me/meetings").json() == {"connected": False, "error": None, "meetings": []}

    r = me.put("/api/me/calendar", json={"url": GOOD})
    assert r.status_code == 200, r.text
    assert [m["title"] for m in r.json()["meetings"]][:2] == ["Stand-up", "Lunch"]

    r = me.get("/api/me/meetings")
    body = r.json()
    assert body["connected"] and body["error"] is None
    assert body["meetings"][0] == {"id": body["meetings"][0]["id"], "title": "Stand-up",
                                   "starts_at": "2026-11-13T04:30:00+00:00", "ends_at": "2026-11-13T04:45:00+00:00",
                                   "link": "https://meet.google.com/abc-defg-hij", "attendees": ["Meera Lead", "pavan"]}
    assert len(fake_calendar) == 1  # the second read came from the cache
    assert "s3cret" not in r.text and "s3cret" not in me.get("/api/me").text  # the secret link never comes back

    assert me.delete("/api/me/calendar").status_code == 204
    assert me.get("/api/me/meetings").json()["connected"] is False


def test_calendars_are_per_person(signup, fake_calendar):
    me, other = signup(), signup()
    me.put("/api/me/calendar", json={"url": GOOD})
    assert other.get("/api/me/meetings").json()["connected"] is False


@pytest.mark.parametrize("url,status", [("https://example.com/cal.ics", 400), ("", 422),
                                         ("https://calendar.google.com/broken/basic.ics", 400)])
def test_connect_refuses_bad_links_and_keeps_the_old_one(signup, fake_calendar, url, status):
    me = signup()
    me.put("/api/me/calendar", json={"url": GOOD})
    r = me.put("/api/me/calendar", json={"url": url})
    assert r.status_code == status
    if status == 400:
        assert "detail" in r.json() and "s3cret" not in r.text
    assert me.get("/api/me/meetings").json()["connected"] is True


def test_calendar_trouble_is_reported_not_raised(signup, fake_calendar, monkeypatch):
    me = signup()
    me.put("/api/me/calendar", json={"url": GOOD})
    calendar._cache.clear()

    def down(url):
        raise calendar.CalendarError("Couldn't reach your calendar. Try again in a minute.")
    monkeypatch.setattr(calendar, "fetch", down)
    r = me.get("/api/me/meetings")
    assert r.status_code == 200
    assert r.json() == {"connected": True, "error": "Couldn't reach your calendar. Try again in a minute.", "meetings": []}


def test_calendar_needs_sign_in(client):
    assert client.get("/api/me/meetings").status_code == 401
    assert client.put("/api/me/calendar", json={"url": GOOD}).status_code == 401


def test_notes_remember_the_meeting(team):
    member, t = team["member"], team["team"]
    note = member.post(f"/api/teams/{t['id']}/notes", json={
        "title": "Stand-up", "meeting_date": "2026-11-13", "starts_at": "2026-11-13T04:30:00Z",
        "meeting_link": "https://meet.google.com/abc-defg-hij", "event_id": "standup@google.com|20261113T0430"}).json()
    assert note["starts_at"] == "2026-11-13T04:30:00+00:00"
    assert note["meeting_link"] == "https://meet.google.com/abc-defg-hij"

    # the web app saves title, date, body and link; the meeting time and calendar id stay
    r = member.put(f"/api/notes/{note['id']}", json={"title": "Stand-up 13 Nov", "meeting_date": "2026-11-13",
                                                       "body": "x", "meeting_link": ""})
    assert r.status_code == 200
    assert r.json()["meeting_link"] is None
    assert r.json()["event_id"] == "standup@google.com|20261113T0430"
    assert r.json()["starts_at"] == "2026-11-13T04:30:00+00:00"


@pytest.mark.parametrize("link", ["javascript:alert(1)", "meet.google.com/abc", "https://x y"])
def test_meeting_link_must_be_a_web_link(team, link):
    r = team["member"].post(f"/api/teams/{team['team']['id']}/notes", json={"title": "x", "meeting_link": link})
    assert r.status_code == 422


@pytest.mark.parametrize("target", ["http://169.254.169.254/latest", "https://evil.example.com/x.ics",
                                    "http://calendar.google.com/x.ics"])
def test_redirects_away_from_calendar_hosts_are_refused(target):
    with pytest.raises(calendar.CalendarError):
        calendar._AllowedRedirects().redirect_request(None, None, 302, "Found", {}, target)
