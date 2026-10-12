import { expect, test } from "vitest";
import {
  buildTaskTree,
  computeProgress,
  countDescendants,
  groupRootsByColumn,
  isSentBack,
  lineage,
  lineageAssigneeIds,
} from "../taskTree";
import type { BoardColumn } from "../types";
import { row } from "./boardFixtures";

const rows = [
  row({ id: 1, assignees: [{ user_id: "u1", assigned_by: "u1" }] }),
  row({ id: 2, parent_id: 1, status: "done", steps: [{ id: 1, is_done: true }] }),
  row({
    id: 3,
    parent_id: 1,
    position: 1,
    assignees: [{ user_id: "u2", assigned_by: "u1" }],
    steps: [
      { id: 2, is_done: true },
      { id: 3, is_done: false },
    ],
  }),
  row({ id: 4, parent_id: 3 }),
  row({ id: 5, archived_at: "2026-10-02T00:00:00Z" }),
  row({ id: 6, parent_id: 5 }),
  row({ id: 7, column_id: 11, position: 1 }),
];

test("buildTaskTree nests, sorts by position, drops archived subtrees", () => {
  const { roots, byId } = buildTaskTree(rows);
  expect(roots.map((r) => r.task.id)).toEqual([7, 1]);
  expect(byId.get(1)!.children.map((c) => c.task.id)).toEqual([3, 2]);
  expect(byId.has(5)).toBe(false);
  expect(byId.has(6)).toBe(false);
});

test("groupRootsByColumn keeps empty columns", () => {
  const { roots } = buildTaskTree(rows);
  const cols = [{ id: 10 }, { id: 11 }, { id: 12 }] as BoardColumn[];
  expect(groupRootsByColumn(roots, cols)).toEqual({ 10: [1], 11: [7], 12: [] });
});

test("computeProgress counts subtree steps and descendant nodes", () => {
  const { byId } = buildTaskTree(rows);
  expect(computeProgress(byId.get(1)!)).toEqual({ done: 3, total: 6, pct: 50 });
  expect(computeProgress(byId.get(4)!)).toEqual({ done: 0, total: 0, pct: 0 });
  expect(countDescendants(byId.get(1)!)).toBe(3);
});

test("lineage and lineageAssigneeIds walk up to the root", () => {
  const { byId } = buildTaskTree(rows);
  expect(lineage(byId, 4).map((n) => n.task.id)).toEqual([1, 3, 4]);
  expect([...lineageAssigneeIds(byId, 4)].sort()).toEqual(["u1", "u2"]);
  expect([...lineageAssigneeIds(byId, 2)]).toEqual(["u1"]);
});

test("isSentBack reads the latest review only", () => {
  const rejected = { decision: "rejected" as const, created_at: "2026-10-03" };
  const approved = { decision: "approved" as const, created_at: "2026-10-02" };
  expect(isSentBack(row({ id: 1, status: "in_progress", reviews: [approved, rejected] }))).toBe(true);
  expect(isSentBack(row({ id: 1, status: "in_review", reviews: [rejected] }))).toBe(false);
  expect(isSentBack(row({ id: 1, status: "in_progress" }))).toBe(false);
});
