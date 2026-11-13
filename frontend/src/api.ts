import type {
  Activity, Comment, ImportIssue, Member, Note, ParsedItem, Task, TaskPatch, Team, User,
} from './types';

// Empty means "same server as the page" (dev proxy, or the API serving the built app).
// Set VITE_API_URL when the API lives elsewhere, e.g. for an APK that bundles the web files.
const BASE = (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');
const TOKEN_KEY = 'tasking.token';

export class ApiError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

function storage(): Storage | null {
  try { return window.localStorage; } catch { return null; }
}

export const session = {
  get token(): string | null { return storage()?.getItem(TOKEN_KEY) ?? null; },
  set(token: string) { storage()?.setItem(TOKEN_KEY, token); },
  clear() { storage()?.removeItem(TOKEN_KEY); },
};

function message(detail: unknown, status: number): string {
  if (typeof detail === 'string') return detail;
  if (Array.isArray(detail) && detail[0]?.msg) {
    const field = detail[0].loc?.at(-1);
    return `${field ? `${field}: ` : ''}${String(detail[0].msg).replace(/^Value error, /, '')}`;
  }
  if (status === 0) return 'Cannot reach the Tasking server. Check your connection.';
  return `Something went wrong (error ${status}). Try again.`;
}

async function request<T>(path: string, init: { method?: string; json?: unknown; form?: FormData; raw?: boolean } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (session.token) headers.Authorization = `Bearer ${session.token}`;
  if (init.json !== undefined) headers['Content-Type'] = 'application/json';
  let res: Response;
  try {
    res = await fetch(`${BASE}${path}`, {
      method: init.method ?? (init.json !== undefined || init.form ? 'POST' : 'GET'),
      headers,
      body: init.form ?? (init.json !== undefined ? JSON.stringify(init.json) : undefined),
    });
  } catch {
    throw new ApiError(0, message(null, 0));
  }
  if (res.status === 401 && session.token) {
    session.clear();
    window.dispatchEvent(new Event('tasking:signed-out'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, message(body.detail, res.status));
  }
  if (init.raw) return res as unknown as T;
  return (res.status === 204 ? undefined : await res.json()) as T;
}

interface AuthResult { token: string; user: User }

export const api = {
  register: (name: string, email: string, password: string) =>
    request<AuthResult>('/api/auth/register', { json: { name, email, password } }),
  login: (email: string, password: string) => request<AuthResult>('/api/auth/login', { json: { email, password } }),
  me: () => request<User>('/api/me'),

  teams: () => request<Team[]>('/api/teams'),
  createTeam: (name: string, key?: string) => request<Team>('/api/teams', { json: { name, key: key || null } }),
  joinTeam: (code: string) => request<Team>('/api/teams/join', { json: { code } }),
  members: (teamId: number) => request<Member[]>(`/api/teams/${teamId}/members`),
  rotateInvite: (teamId: number) => request<Team>(`/api/teams/${teamId}/invite-code`, { method: 'POST' }),
  removeMember: (teamId: number, userId: number) =>
    request<void>(`/api/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),
  setJobTitle: (teamId: number, userId: number, jobTitle: string | null) =>
    request<Member>(`/api/teams/${teamId}/members/${userId}`, { method: 'PATCH', json: { job_title: jobTitle } }),

  tasks: (teamId: number) => request<Task[]>(`/api/teams/${teamId}/tasks`),
  quickAdd: (teamId: number, text: string) => request<Task>(`/api/teams/${teamId}/tasks/quick`, { json: { text } }),
  updateTask: (id: number, patch: TaskPatch) => request<Task>(`/api/tasks/${id}`, { method: 'PATCH', json: patch }),
  deleteTask: (id: number) => request<void>(`/api/tasks/${id}`, { method: 'DELETE' }),
  comments: (taskId: number) => request<Comment[]>(`/api/tasks/${taskId}/comments`),
  addComment: (taskId: number, body: string) => request<Comment>(`/api/tasks/${taskId}/comments`, { json: { body } }),
  activity: (taskId: number) => request<Activity[]>(`/api/tasks/${taskId}/activity`),

  notes: (teamId: number) => request<Note[]>(`/api/teams/${teamId}/notes`),
  createNote: (teamId: number, note: Pick<Note, 'title' | 'meeting_date' | 'body'>) =>
    request<Note>(`/api/teams/${teamId}/notes`, { json: note }),
  saveNote: (note: Pick<Note, 'id' | 'title' | 'meeting_date' | 'body'>) =>
    request<Note>(`/api/notes/${note.id}`, { method: 'PUT', json: { title: note.title, meeting_date: note.meeting_date, body: note.body } }),
  deleteNote: (id: number) => request<void>(`/api/notes/${id}`, { method: 'DELETE' }),
  parse: (teamId: number, text: string) => request<ParsedItem[]>(`/api/teams/${teamId}/parse`, { json: { text } }),
  convertLine: (noteId: number, line: number, text: string) =>
    request<{ note: Note; tasks: Task[] }>(`/api/notes/${noteId}/convert`, { json: { line, text } }),
  convertAll: (noteId: number) => request<{ note: Note; tasks: Task[] }>(`/api/notes/${noteId}/convert-all`, { method: 'POST' }),

  importFile: (teamId: number, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<{ created: number; issues: ImportIssue[] }>(`/api/teams/${teamId}/import`, { form });
  },
  async exportFile(teamId: number): Promise<void> {
    const res = await request<Response>(`/api/teams/${teamId}/export`, { raw: true });
    const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'tasks.xlsx';
    const url = URL.createObjectURL(await res.blob());
    const a = Object.assign(document.createElement('a'), { href: url, download: name });
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};
