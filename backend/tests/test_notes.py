from datetime import date

import pytest

from app.notes import mark_converted, match_member, parse_date, parse_line, parse_note

MONDAY = date(2026, 11, 9)
MEMBERS = [(1, "Ravi Kumar", "ravi.k@corp.in"), (2, "Rajesh Iyer", "rajesh@corp.in"),
           (3, "Meera Lead", "meera@corp.in")]


@pytest.mark.parametrize("line", ["[ ] Send deck", "[] Send deck", "- [ ] Send deck", "* [ ] Send deck",
                                  "todo: Send deck", "TODO: Send deck", "Action: Send deck", "   [ ] Send deck"])
def test_action_prefixes(line):
    assert parse_line(line, MEMBERS, MONDAY).title == "Send deck"


@pytest.mark.parametrize("line", ["Discussed roadmap", "", "   ", "[x] done already", "todo Send deck"])
def test_plain_lines_are_not_actions(line):
    assert parse_line(line, MEMBERS, MONDAY) is None


def test_all_tokens_extracted_and_removed_from_title():
    item = parse_line("[ ] Fix login bug @ravi !high due:fri", MEMBERS, MONDAY)
    assert (item.title, item.assignee_id, item.priority, item.due_date) == ("Fix login bug", 1, "high",
                                                                           date(2026, 11, 13))


@pytest.mark.parametrize("query,expected", [
    ("ravi", 1), ("RAVI", 1), ("ravikumar", 1), ("ravi.k", 1), ("meera", 3), ("mee", 3),
    ("ra", None),  # Ravi and Rajesh: ambiguous, leave unassigned
    ("nobody", None), ("", None), ("...", None)])
def test_match_member(query, expected):
    assert match_member(query, MEMBERS) == expected


def test_unknown_mention_keeps_query_for_the_ui():
    item = parse_line("[ ] Call vendor @suresh", MEMBERS, MONDAY)
    assert item.assignee_id is None and item.assignee_query == "suresh"


def test_email_in_text_is_not_a_mention():
    item = parse_line("[ ] Mail ravi@corp.in the report", MEMBERS, MONDAY)
    assert item.assignee_query is None and "ravi@corp.in" in item.title


@pytest.mark.parametrize("token,expected", [("!low", "low"), ("!med", "medium"), ("!URGENT", "urgent"),
                                            ("!high !low", "low")])
def test_priority(token, expected):
    assert parse_line(f"[ ] Thing {token}", MEMBERS, MONDAY).priority == expected


def test_default_priority_is_medium():
    assert parse_line("[ ] Thing", MEMBERS, MONDAY).priority == "medium"


@pytest.mark.parametrize("value,expected", [
    ("today", MONDAY), ("tomorrow", date(2026, 11, 10)), ("wed", date(2026, 11, 11)),
    ("Friday", date(2026, 11, 13)),
    ("mon", date(2026, 11, 16)),  # said on a Monday: next Monday, not today
    ("2026-12-01", date(2026, 12, 1)), ("01/12/2026", date(2026, 12, 1)), ("1-12-2026", date(2026, 12, 1)),
    ("20/11", date(2026, 11, 20)), ("20 Nov 2026", date(2026, 11, 20)), ("fri.", date(2026, 11, 13))])
def test_parse_date(value, expected):
    assert parse_date(value, MONDAY) == expected


@pytest.mark.parametrize("value", ["31/02/2026", "31/02", "someday", "13/13/2026", "", "monkey"])
def test_parse_date_rejects_bad_values(value):
    assert parse_date(value, MONDAY) is None


def test_bad_due_date_reported_not_fatal():
    item = parse_line("[ ] Ship it due:someday", MEMBERS, MONDAY)
    assert item.due_date is None and "someday" in item.due_error and item.title == "Ship it"


def test_only_tokens_means_no_task():
    assert parse_line("[ ] @ravi !high due:fri", MEMBERS, MONDAY) is None


def test_long_title_is_cut_to_200():
    assert len(parse_line("[ ] " + "x" * 500, MEMBERS, MONDAY).title) == 200


def test_converted_line_carries_its_key():
    item = parse_line("[ ] Send deck @ravi (SRC-12)", MEMBERS, MONDAY)
    assert item.task_key == "SRC-12" and item.title == "Send deck"


def test_force_treats_any_line_as_action_and_still_strips_prefix():
    assert parse_line("Send deck !urgent", MEMBERS, MONDAY, force=True).priority == "urgent"
    assert parse_line("[ ] Send deck", MEMBERS, MONDAY, force=True).title == "Send deck"


def test_parse_note_reports_line_numbers():
    body = "Weekly 1:1\n\n[ ] First @meera\nnotes here\r\ntodo: Second\n"
    assert [(i.line, i.title) for i in parse_note(body, MEMBERS, MONDAY)] == [(2, "First"), (4, "Second")]


def test_mark_converted():
    body = "intro\n[ ] Send deck  \nend\n"
    out = mark_converted(body, 1, "SRC-3")
    assert out == "intro\n[ ] Send deck (SRC-3)\nend\n"
    with pytest.raises(ValueError):
        mark_converted(out, 1, "SRC-4")
    with pytest.raises(IndexError):
        mark_converted(out, 9, "SRC-4")
    assert mark_converted("[ ] a", 0, "K-1") == "[ ] a (K-1)"  # no trailing newline added


@pytest.mark.parametrize("line,expected", [  # exactly what the web app's pickers write (frontend setToken/mentionFor)
    ("[ ] Send deck @ravi !urgent due:2026-11-20", (1, "urgent", date(2026, 11, 20))),
    ("[ ] Send deck @ravikumar due:2026-11-09", (1, "medium", MONDAY)),
    ("todo: Ask about it @meera !low", (3, "low", None)),
])
def test_picker_output_is_understood(line, expected):
    item = parse_line(line, MEMBERS, MONDAY)
    assert item.title in ("Send deck", "Ask about it")
    assert (item.assignee_id, item.priority, item.due_date) == expected
