import io
from datetime import date, datetime, timezone
from types import SimpleNamespace

import pytest
from openpyxl import Workbook

from app.excel import export_workbook, read_rows, rows_to_drafts, to_date

TODAY = date(2026, 11, 9)
MEMBERS = [(1, "Ravi Kumar", "ravi.k@corp.in"), (2, "Meera Lead", "meera@corp.in")]


def xlsx(rows):
    wb = Workbook()
    for r in rows:
        wb.active.append(r)
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()


def test_reads_header_below_a_title_row_with_aliases_and_skips_blank_rows():
    data = xlsx([["My tasks from 1:1"], [], ["Task", "Owner", "Deadline", "State"],
                 ["Send deck", "Ravi", datetime(2026, 11, 20), "WIP"], [None, None, None, None],
                 ["Fix bug", "meera@corp.in", None, "done"]])
    rows = read_rows(data)
    drafts = rows_to_drafts(rows, MEMBERS, TODAY)
    assert [d["title"] for d in drafts.drafts] == ["Send deck", "Fix bug"]
    assert drafts.drafts[0] == {"title": "Send deck", "description": "", "status": "in_progress",
                                "priority": "medium", "due_date": date(2026, 11, 20), "assignee_id": 1}
    assert drafts.drafts[1]["assignee_id"] == 2 and drafts.drafts[1]["status"] == "done"
    assert rows[0]["_row"] == 4  # row numbers match what the user sees in Excel
    assert drafts.issues == []


def test_csv_with_bom():
    rows = read_rows("﻿Title,Priority,Due date\nCall client,P1,25/11/2026\n".encode("utf-8"))
    d = rows_to_drafts(rows, MEMBERS, TODAY).drafts[0]
    assert (d["title"], d["priority"], d["due_date"]) == ("Call client", "high", date(2026, 11, 25))


def test_missing_title_column():
    with pytest.raises(ValueError, match="Title"):
        read_rows(xlsx([["Owner", "Due"], ["Ravi", "today"]]))


def test_non_utf8_csv_rejected():
    with pytest.raises(ValueError):
        read_rows("Title\nCaf\xe9".encode("latin-1"))


def test_problems_become_issues_not_failures():
    rows = [{"_row": 2, "title": "A", "status": "someday", "priority": "huge", "due_date": "soon",
             "assignee": "Nobody"},
            {"_row": 3, "title": "", "status": "done"},
            {"_row": 4, "title": None, "status": None}]
    result = rows_to_drafts(rows, MEMBERS, TODAY)
    assert result.drafts[0] == {"title": "A", "description": "", "status": "todo", "priority": "medium",
                                "due_date": None, "assignee_id": None}
    messages = [i["message"] for i in result.issues]
    assert any("status" in m for m in messages) and any("priority" in m for m in messages)
    assert any("due date" in m for m in messages) and any("Nobody" in m for m in messages)
    assert {"row": 3, "message": "Skipped: no title", "skipped": True} in result.issues
    assert all(i["row"] != 4 for i in result.issues)  # a fully empty row is silently ignored


@pytest.mark.parametrize("value,expected", [
    (46346, date(2026, 11, 20)), (46346.75, date(2026, 11, 20)), (datetime(2026, 1, 2, 9), date(2026, 1, 2)),
    (date(2026, 1, 2), date(2026, 1, 2)), ("2026-11-20 00:00:00", date(2026, 11, 20)), ("", None), (None, None),
    (True, None), (0, None), (-5, None)])
def test_to_date(value, expected):
    assert to_date(value, TODAY) == expected


def test_export_then_import_round_trip():
    now = datetime(2026, 11, 9, 10, tzinfo=timezone.utc)
    tasks = [SimpleNamespace(number=1, title="Send deck", description="v2", status="in_progress",
                             priority="high", assignee_id=1, reporter_id=2, due_date=date(2026, 11, 20),
                             created_at=now, updated_at=now),
             SimpleNamespace(number=2, title="Old", description="", status="done", priority="low",
                             assignee_id=None, reporter_id=2, due_date=None, created_at=now, updated_at=now)]
    data = export_workbook("SRC", tasks, {1: "Ravi Kumar", 2: "Meera Lead"})
    result = rows_to_drafts(read_rows(data), MEMBERS, TODAY)
    assert result.issues == []
    assert [(d["title"], d["status"], d["priority"], d["assignee_id"], d["due_date"]) for d in result.drafts] == [
        ("Send deck", "in_progress", "high", 1, date(2026, 11, 20)), ("Old", "done", "low", None, None)]
