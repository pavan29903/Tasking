import { useCallback, useEffect, useRef, useState } from 'react';
import { dueInfo, initials, priorityLabel } from '../lib/tasks';
import type { Priority, Status, Task } from '../types';

export function Logo({ size = 22 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <rect x="2" y="2" width="28" height="28" rx="7" fill="var(--pen)" />
      <path d="M9 16.5l4.5 4.5L23 11.5" fill="none" stroke="var(--pen-ink)" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function Avatar({ name }: { name: string | null | undefined }) {
  if (!name) return <span className="avatar empty" title="Unassigned" aria-label="Unassigned">–</span>;
  return <span className="avatar" title={name} aria-label={name}>{initials(name)}</span>;
}

export function Prio({ p }: { p: Priority }) {
  const marks = { urgent: '!!!', high: '!!', medium: '', low: '↓' }[p];
  if (!marks) return null;
  return <span className={`prio ${p}`} title={`${priorityLabel(p)} priority`}>{marks}<span className="sr-only"> {priorityLabel(p)} priority</span></span>;
}

export function Dot({ s }: { s: Status }) {
  return <span className={`dot ${s}`} aria-hidden="true" />;
}

export function Due({ task, today }: { task: Pick<Task, 'due_date' | 'status'>; today: string }) {
  const info = dueInfo(task, today);
  if (!info) return null;
  return <span className={`due ${info.tone}`} title={`Due ${task.due_date}`}>{info.label}</span>;
}

/** Debounced value, for "search as you type" without a request per keystroke. */
export function useDebounced<T>(value: T, ms: number): T {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

export function useToast() {
  const [toast, setToast] = useState<{ text: string; bad: boolean } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const show = useCallback((text: string, bad = false) => {
    setToast({ text, bad });
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), bad ? 6000 : 3000);
  }, []);
  const node = toast ? <div className={`toast${toast.bad ? ' bad' : ''}`} role="status" aria-live="polite">{toast.text}</div> : null;
  return { show, node };
}

export const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));
