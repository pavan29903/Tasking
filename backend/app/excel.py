"""Excel/CSV import and Excel export for tasks."""
import csv
import io
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from typing import Any, Dict, List, Optional, Sequence

from openpyxl import Workbook, load_workbook
from openpyxl.styles import Font

from .models import PRIORITIES
from .notes import Member, match_member, parse_date

MAX_ROWS = 2000
HEADERS = {
    "title": ("title", "task", "summary", "task name", "item", "action item", "action"),
    "description": ("description", "details", "notes", "comments", "remarks"),
    "status": ("status", "state"),
    "priority": ("priority", "prio"),
    "assignee": ("assignee", "owner", "assigned to", "responsible", "who"),
    "due_date": ("due", "due date", "deadline", "target date", "eta", "due on"),
}
STATUS_WORDS = {
    "todo": ("", "todo", "to do", "open", "new", "pending", "not started"),
    "in_progress": ("in progress", "in-progress", "wip", "doing", "started", "ongoing", "working"),
    "blocked": ("blocked", "on hold", "hold", "waiting", "stuck"),
    "done": ("done", "completed", "complete", "closed", "finished", "resolved"),
}
STATUS_LABELS = {"todo": "To do", "in_progress": "In progress", "blocked": "Blocked", "done": "Done"}
EXCEL_EPOCH = date(1899, 12, 30)


@dataclass
class ImportResult:
    drafts: List[Dict[str, Any]] = field(default_factory=list)
    issues: List[Dict[str, Any]] = field(default_factory=list)  # {row, message, skipped}


def _norm(value: Any) -> str:
    return " ".join(str(value).strip().lower().replace("_", " ").split()) if value is not None else ""


def read_rows(data: bytes) -> List[Dict[str, Any]]:
    """Rows from the first sheet of an .xlsx (or a UTF-8 .csv), keyed by our field names."""
    if data[:2] == b"PK":
        sheet = load_workbook(io.BytesIO(data), read_only=True, data_only=True).worksheets[0]
        table = [list(r) for r in sheet.iter_rows(values_only=True)]
    else:
        try:
            text = data.decode("utf-8-sig")
        except UnicodeDecodeError as exc:
            raise ValueError("Upload an .xlsx file or a UTF-8 .csv file") from exc
        table = [list(r) for r in csv.reader(io.StringIO(text))]
    for header_index, header in enumerate(table[:10]):  # header may sit below a title row
        columns = {}
        for col, cell in enumerate(header):
            name = _norm(cell)
            for fieldname, aliases in HEADERS.items():
                if name in aliases and fieldname not in columns:
                    columns[fieldname] = col
        if "title" in columns:
            break
    else:
        raise ValueError("No 'Title' or 'Task' column found in the first 10 rows")
    rows = []
    for raw in table[header_index + 1:header_index + 1 + MAX_ROWS]:
        row = {f: raw[c] if c < len(raw) else None for f, c in columns.items()}
        row["_row"] = header_index + 2 + len(rows)  # row number as shown in Excel
        rows.append(row)
    return rows


def to_date(value: Any, today: date) -> Optional[date]:
    if value in (None, ""):
        return None
    if isinstance(value, datetime):
        return value.date()
    if isinstance(value, date):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return EXCEL_EPOCH + timedelta(days=int(value)) if 1 <= value < 100000 else None  # Excel day number
    text = str(value).strip()
    return parse_date(text, today) or (parse_date(text.split(" ")[0], today) if " " in text else None)


def rows_to_drafts(rows: Sequence[Dict[str, Any]], members: Sequence[Member], today: date) -> ImportResult:
    result = ImportResult()
    for row in rows:
        number = row.get("_row")
        title = " ".join(str(row.get("title") or "").split())[:200]
        if not title:
            if any(row.get(k) not in (None, "") for k in HEADERS if k != "title"):
                result.issues.append({"row": number, "message": "Skipped: no title", "skipped": True})
            continue
        draft: Dict[str, Any] = {"title": title, "description": str(row.get("description") or "").strip()}
        status = _norm(row.get("status"))
        draft["status"] = next((key for key, words in STATUS_WORDS.items() if status in words), None)
        if draft["status"] is None:
            draft["status"] = "todo"
            result.issues.append({"row": number, "message": f"Unknown status '{row.get('status')}', set to To do",
                                  "skipped": False})
        priority = _norm(row.get("priority")) or "medium"
        priority = {"med": "medium", "critical": "urgent", "p0": "urgent", "p1": "high", "p2": "medium",
                    "p3": "low", "normal": "medium"}.get(priority, priority)
        if priority not in PRIORITIES:
            result.issues.append({"row": number, "message": f"Unknown priority '{row.get('priority')}', set to Medium",
                                  "skipped": False})
            priority = "medium"
        draft["priority"] = priority
        draft["due_date"] = to_date(row.get("due_date"), today)
        if draft["due_date"] is None and row.get("due_date") not in (None, ""):
            result.issues.append({"row": number, "message": f"Could not read due date '{row.get('due_date')}'",
                                  "skipped": False})
        who = str(row.get("assignee") or "").strip()
        draft["assignee_id"] = None
        if who:
            draft["assignee_id"] = match_member(who, members) or next(
                (m[0] for m in members if m[2].lower() == who.lower() or m[1].lower() == who.lower()), None)
            if draft["assignee_id"] is None:
                result.issues.append({"row": number, "message": f"'{who}' is not in this team, left unassigned",
                                      "skipped": False})
        result.drafts.append(draft)
    return result


def export_workbook(team_key: str, tasks: Sequence[Any], names: Dict[int, str]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "Tasks"
    headers = ["Key", "Title", "Description", "Status", "Priority", "Assignee", "Reporter", "Due date",
               "Created", "Updated"]
    ws.append(headers)
    for cell in ws[1]:
        cell.font = Font(bold=True)
    for t in tasks:
        ws.append([f"{team_key}-{t.number}", t.title, t.description or None, STATUS_LABELS.get(t.status, t.status),
                   t.priority.capitalize(), names.get(t.assignee_id), names.get(t.reporter_id),
                   t.due_date, t.created_at.replace(tzinfo=None), t.updated_at.replace(tzinfo=None)])
    for row in ws.iter_rows(min_row=2):
        row[7].number_format = "dd-mmm-yyyy"
        row[8].number_format = row[9].number_format = "dd-mmm-yyyy hh:mm"
    for letter, width in zip("ABCDEFGHIJ", (10, 48, 48, 13, 10, 20, 20, 13, 18, 18)):
        ws.column_dimensions[letter].width = width
    ws.freeze_panes = "A2"
    out = io.BytesIO()
    wb.save(out)
    return out.getvalue()
