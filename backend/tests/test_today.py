from datetime import date, datetime, timedelta, timezone

import pytest

TODAY = date.today().isoformat()
UTC_TODAY = datetime.now(timezone.utc).date()  # the server's idea of today


def _url(team, day=TODAY):
    return f"/api/teams/{team['team']['id']}/updates/{day}"


def _list(api, team, day=TODAY):
    r = api.get(f"/api/teams/{team['team']['id']}/updates", params={"day": day})
    assert r.status_code == 200, r.text
    return r.json()


def test_everyone_in_the_team_sees_each_update(team):
    owner, member = team["owner"], team["member"]
    r = member.put(_url(team), json={"text": "  Fixing login timeout in auth.py  ",
                                     "areas": ["tasking-backend", " auth ", "Tasking-Backend", ""]})
    assert r.status_code == 200, r.text
    assert r.json()["text"] == "Fixing login timeout in auth.py"
    assert r.json()["areas"] == ["tasking-backend", "auth"]  # tidied, duplicates (any case) and blanks dropped

    owner.put(_url(team), json={"text": "Client calls", "areas": []})
    seen = {u["user_id"]: u for u in _list(owner, team)}
    assert set(seen) == {owner.user["id"], member.user["id"]}
    assert seen[member.user["id"]]["areas"] == ["tasking-backend", "auth"]
    assert _list(member, team) and len(_list(member, team)) == 2  # members see everyone too, not only the owner


def test_one_update_per_person_per_day(team):
    member = team["member"]
    member.put(_url(team), json={"text": "Morning plan"})
    member.put(_url(team), json={"text": "Changed plan", "areas": ["web"]})
    yesterday = (date.today() - timedelta(days=1)).isoformat()
    member.put(_url(team, yesterday), json={"text": "Yesterday's work"})
    today = _list(member, team)
    assert [(u["text"], u["areas"]) for u in today] == [("Changed plan", ["web"])]
    assert [u["text"] for u in _list(member, team, yesterday)] == ["Yesterday's work"]


def test_commas_split_areas_and_limits(team):
    member = team["member"]
    r = member.put(_url(team), json={"text": "x", "areas": ["api, web,  mobile app "]})
    assert r.json()["areas"] == ["api", "web", "mobile app"]
    assert member.put(_url(team), json={"text": "x", "areas": ["a" * 41]}).status_code == 422
    assert member.put(_url(team), json={"text": "x", "areas": [",".join(str(i) for i in range(9))]}).status_code == 422
    assert member.put(_url(team), json={"text": "x" * 2001}).status_code == 422


def test_blank_update_removes_it(team):
    member = team["member"]
    member.put(_url(team), json={"text": "Something"})
    r = member.put(_url(team), json={"text": "   ", "areas": []})
    assert r.status_code == 204
    assert _list(member, team) == []
    assert member.put(_url(team), json={"text": ""}).status_code == 204  # nothing there: still fine


def test_areas_without_text_are_kept(team):
    r = team["member"].put(_url(team), json={"text": "", "areas": ["release branch"]})
    assert r.status_code == 200 and r.json()["areas"] == ["release branch"]


def test_future_days_are_refused_but_tomorrow_is_allowed(team):
    member = team["member"]
    tomorrow = (UTC_TODAY + timedelta(days=1)).isoformat()
    later = (UTC_TODAY + timedelta(days=2)).isoformat()
    assert member.put(_url(team, tomorrow), json={"text": "Plan"}).status_code == 200
    assert member.put(_url(team, later), json={"text": "Plan"}).status_code == 422


@pytest.mark.parametrize("day", ["yesterday", "2026-13-01"])
def test_bad_dates(team, day):
    assert team["member"].put(_url(team, day), json={"text": "x"}).status_code == 422
    assert team["member"].get(f"/api/teams/{team['team']['id']}/updates", params={"day": day}).status_code == 422


def test_outsiders_and_leavers(team):
    owner, member, outsider = team["owner"], team["member"], team["outsider"]
    assert outsider.get(f"/api/teams/{team['team']['id']}/updates", params={"day": TODAY}).status_code == 404
    assert outsider.put(_url(team), json={"text": "sneaky"}).status_code == 404

    member.put(_url(team), json={"text": "Working on reports"})
    assert member.delete(f"/api/teams/{team['team']['id']}/members/{member.user['id']}").status_code == 204
    assert _list(owner, team) == []  # someone who left no longer shows


def test_updates_stay_in_their_team(team):
    member = team["member"]
    other = member.post("/api/teams", json={"name": "Side project", "key": "SIDE"}).json()
    member.put(f"/api/teams/{other['id']}/updates/{TODAY}", json={"text": "Side work"})
    assert _list(team["owner"], team) == []
