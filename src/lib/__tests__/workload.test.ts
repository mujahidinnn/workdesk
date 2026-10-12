import { expect, test } from "vitest";
import { openCount, summarizeWorkload } from "../workload";

test("summarizeWorkload buckets by status, flags overdue, counts recent done", () => {
  const today = new Date(2026, 9, 11);
  const m = summarizeWorkload(
    [
      { user_id: "a", status: "todo", due_date: "2026-10-10", completed_at: null },
      { user_id: "a", status: "in_progress", due_date: "2026-10-11", completed_at: null },
      { user_id: "a", status: "in_review", due_date: null, completed_at: null },
      { user_id: "a", status: "done", due_date: "2026-10-01", completed_at: "2026-10-05T10:00:00Z" },
      { user_id: "a", status: "done", due_date: null, completed_at: "2026-10-01T10:00:00Z" },
      { user_id: "b", status: "done", due_date: null, completed_at: null },
    ],
    today,
  );
  expect(m.get("a")).toEqual({ todo: 1, in_progress: 1, in_review: 1, overdue: 1, done_7d: 1 });
  expect(openCount(m.get("a")!)).toBe(3);
  expect(m.get("b")).toEqual({ todo: 0, in_progress: 0, in_review: 0, overdue: 0, done_7d: 0 });
});
