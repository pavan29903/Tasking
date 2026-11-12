import { useRef, useState } from 'react';
import { api } from '../api';
import { priorityLabel, sortTasks, statusLabel, type SortKey } from '../lib/tasks';
import type { ImportIssue, Task } from '../types';
import { Avatar, Dot, Due, errorText } from './bits';

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'key', label: 'Key' }, { key: 'title', label: 'Title' }, { key: 'status', label: 'Status' },
  { key: 'priority', label: 'Priority' }, { key: 'assignee', label: 'Assignee' }, { key: 'due', label: 'Due' },
];

export function TaskTable({ tasks, names, today, teamId, onOpen, onImported, toast }: {
  tasks: Task[]; names: Map<number, string>; today: string; teamId: number;
  onOpen: (t: Task) => void; onImported: () => void; toast: (msg: string, bad?: boolean) => void;
}) {
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'key', dir: -1 });
  const [result, setResult] = useState<{ created: number; issues: ImportIssue[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const file = useRef<HTMLInputElement>(null);
  const rows = sortTasks(tasks, sort.key, sort.dir, names);

  async function importFile(f: File) {
    setBusy(true);
    try {
      const res = await api.importFile(teamId, f);
      setResult(res);
      onImported();
    } catch (err) {
      toast(errorText(err), true);
    } finally {
      setBusy(false);
      if (file.current) file.current.value = '';
    }
  }

  return (
    <div className="split">
      <div className="toolbar">
        <span className="muted small">{tasks.length} task{tasks.length === 1 ? '' : 's'}</span>
        <span className="filters">
          <input ref={file} type="file" accept=".xlsx,.csv" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
          <button className="btn small" disabled={busy} onClick={() => file.current?.click()}>Import from Excel</button>
          <button className="btn small" onClick={() => api.exportFile(teamId).catch((e) => toast(errorText(e), true))}>Download Excel</button>
        </span>
      </div>
      {result && (
        <div className="notice" role="status">
          Imported {result.created} task{result.created === 1 ? '' : 's'}.
          {result.issues.length > 0 && <> {result.issues.length} row{result.issues.length === 1 ? '' : 's'} need a look:</>}
          {result.issues.length > 0 && (
            <ul className="issues">{result.issues.map((i, n) => <li key={n}>Row {i.row}: {i.message}</li>)}</ul>
          )}
          <button className="btn ghost small" onClick={() => setResult(null)}>Dismiss</button>
        </div>
      )}
      <div className="sheet table-wrap">
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => (
                <th key={c.key} aria-sort={sort.key === c.key ? (sort.dir === 1 ? 'ascending' : 'descending') : 'none'}>
                  <button onClick={() => setSort((s) => ({ key: c.key, dir: s.key === c.key ? (s.dir === 1 ? -1 : 1) : 1 }))}>
                    {c.label}{sort.key === c.key ? (sort.dir === 1 ? ' ↑' : ' ↓') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((t) => (
              <tr key={t.id} onClick={() => onOpen(t)} onKeyDown={(e) => e.key === 'Enter' && onOpen(t)} tabIndex={0}>
                <td><span className="key">{t.key}</span></td>
                <td className="title-cell">{t.title}</td>
                <td><span className="card-meta"><Dot s={t.status} /> {statusLabel(t.status)}</span></td>
                <td><span className={`prio ${t.priority}`}>{priorityLabel(t.priority)}</span></td>
                <td><span className="card-meta"><Avatar name={t.assignee_id != null ? names.get(t.assignee_id) : null} />
                  <span className="small">{t.assignee_id != null ? names.get(t.assignee_id) ?? 'Former member' : 'Unassigned'}</span></span></td>
                <td><Due task={t} today={today} /></td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr><td colSpan={6} className="muted">No tasks match. Clear the filters, add a task above, or import your Excel sheet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
