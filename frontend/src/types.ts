export type Status = 'todo' | 'in_progress' | 'blocked' | 'done';
export type Priority = 'low' | 'medium' | 'high' | 'urgent';

export interface User { id: number; name: string; email: string }
export interface Team { id: number; name: string; key: string; invite_code: string; role: 'owner' | 'member' }
export interface Member { user_id: number; name: string; email: string; role: 'owner' | 'member'; job_title?: string | null }

export interface Task {
  id: number;
  key: string;
  number: number;
  team_id: number;
  title: string;
  description: string;
  status: Status;
  priority: Priority;
  assignee_id: number | null;
  reporter_id: number;
  due_date: string | null; // YYYY-MM-DD
  note_id: number | null;
  comment_count: number;
  created_at: string;
  updated_at: string;
}

export type TaskPatch = Partial<Pick<Task, 'title' | 'description' | 'status' | 'priority' | 'assignee_id' | 'due_date'>>;

export interface Comment { id: number; task_id: number; author_id: number; author_name: string; body: string; created_at: string }
export interface Activity {
  id: number; actor_id: number; actor_name: string; field: string;
  old: string | null; new: string | null; created_at: string;
}

export interface Note {
  id: number; team_id: number; author_id: number; title: string;
  meeting_date: string | null; body: string; created_at: string; updated_at: string;
  starts_at?: string | null; meeting_link?: string | null; event_id?: string | null;
}

/** One occurrence of a meeting from your connected calendar. */
export interface Meeting { id: string; title: string; starts_at: string; ends_at: string; link: string | null; attendees: string[] }
export interface MyMeetings { connected: boolean; error: string | null; meetings: Meeting[] }

export interface ParsedItem {
  line: number; text: string; title: string;
  assignee_id: number | null; assignee_query: string | null;
  priority: Priority; due_date: string | null; due_error: string | null; task_key: string | null;
}

export interface ImportIssue { row: number | null; message: string; skipped: boolean }

/** What someone is working on for a day, in one team. */
export interface DailyUpdate { user_id: number; day: string; text: string; areas: string[]; updated_at: string }
