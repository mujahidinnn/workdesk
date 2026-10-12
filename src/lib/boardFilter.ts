import { addDays, format } from "date-fns";
import type { TaskNode } from "./taskTree";

export interface BoardFilter {
  q: string;
  assignee?: string;
  division?: number;
  label?: number;
  due?: "overdue" | "week";
}

export const EMPTY_FILTER: BoardFilter = { q: "" };

export const isFiltering = (f: BoardFilter) =>
  !!(f.q.trim() || f.assignee || f.division || f.label || f.due);

export function matchesFilter(node: TaskNode, f: BoardFilter, today: Date): boolean {
  const t = node.task;
  const q = f.q.trim().toLowerCase();
  const todayIso = format(today, "yyyy-MM-dd");
  const weekIso = format(addDays(today, 7), "yyyy-MM-dd");
  const self =
    (!q || t.title.toLowerCase().includes(q) || `#${t.task_no}` === q) &&
    (!f.assignee ||
      t.assignees.some((a) => a.user_id === f.assignee) ||
      t.steps.some((s) => s.assignee_id === f.assignee)) &&
    (!f.division || t.division_id === f.division) &&
    (!f.label || t.labels.some((l) => l.label_id === f.label)) &&
    (!f.due ||
      (t.status !== "done" &&
        !!t.due_date &&
        (f.due === "overdue" ? t.due_date < todayIso : t.due_date <= weekIso)));
  return self || node.children.some((c) => matchesFilter(c, f, today));
}

const KEYS = { q: "q", assignee: "who", division: "div", label: "label", due: "due" } as const;

const positiveInt = (v: string | null) => {
  const n = Number(v);
  return v && Number.isInteger(n) && n > 0 ? n : undefined;
};

export function filterFromParams(p: URLSearchParams): BoardFilter {
  const due = p.get(KEYS.due);
  const f: BoardFilter = { q: p.get(KEYS.q) ?? "" };
  const who = p.get(KEYS.assignee);
  if (who) f.assignee = who;
  const division = positiveInt(p.get(KEYS.division));
  if (division) f.division = division;
  const label = positiveInt(p.get(KEYS.label));
  if (label) f.label = label;
  if (due === "overdue" || due === "week") f.due = due;
  return f;
}

export function filterToParams(f: BoardFilter, p: URLSearchParams) {
  const set = (k: string, v: string | number | undefined) => (v ? p.set(k, String(v)) : p.delete(k));
  set(KEYS.q, f.q.trim() || undefined);
  set(KEYS.assignee, f.assignee);
  set(KEYS.division, f.division);
  set(KEYS.label, f.label);
  set(KEYS.due, f.due);
}
