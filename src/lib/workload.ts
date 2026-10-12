import { differenceInCalendarDays, parseISO } from "date-fns";
import type { TaskStatus } from "./types";

export interface WorkloadInput {
  user_id: string;
  status: TaskStatus;
  due_date: string | null;
  completed_at: string | null;
}

export interface WorkloadCounts {
  todo: number;
  in_progress: number;
  in_review: number;
  overdue: number;
  done_7d: number;
}

export const emptyCounts = (): WorkloadCounts => ({
  todo: 0,
  in_progress: 0,
  in_review: 0,
  overdue: 0,
  done_7d: 0,
});

export function summarizeWorkload(
  rows: WorkloadInput[],
  today: Date,
): Map<string, WorkloadCounts> {
  const out = new Map<string, WorkloadCounts>();
  for (const r of rows) {
    const c = out.get(r.user_id) ?? emptyCounts();
    out.set(r.user_id, c);
    if (r.status === "done") {
      if (r.completed_at && differenceInCalendarDays(today, parseISO(r.completed_at)) < 7)
        c.done_7d++;
      continue;
    }
    c[r.status]++;
    if (r.due_date && differenceInCalendarDays(today, parseISO(r.due_date)) > 0)
      c.overdue++;
  }
  return out;
}

export const openCount = (c: WorkloadCounts) =>
  c.todo + c.in_progress + c.in_review;
