import { expect, test } from "vitest";
import { buildTaskTree, lineageAssigneeIds } from "../taskTree";
import {
  canReviewTask,
  canSelfAssign,
  canTickStep,
  canUnassign,
  canWorkTask,
  submitBlocker,
  type TaskAccess,
} from "../taskPermissions";
import { row } from "./boardFixtures";

const dev: TaskAccess = { userId: "u2", isAdmin: false, memberRole: "member" };
const pic: TaskAccess = { userId: "p1", isAdmin: false, memberRole: "pic" };
const reviewer: TaskAccess = { userId: "r1", isAdmin: false, memberRole: "reviewer" };

test("canWorkTask: lineage assignees and the PIC", () => {
  expect(canWorkTask(dev, new Set(["u2"]))).toBe(true);
  expect(canWorkTask(dev, new Set(["u1"]))).toBe(false);
  expect(canWorkTask(pic, new Set())).toBe(true);
  expect(canWorkTask({ ...dev, isAdmin: true }, new Set())).toBe(true);
});

test("canUnassign: whoever assigned, or the PIC", () => {
  expect(canUnassign(dev, "u2")).toBe(true);
  expect(canUnassign(dev, "u1")).toBe(false);
  expect(canUnassign(pic, "u1")).toBe(true);
});

test("submitBlocker walks the same checks as submit_review()", () => {
  const rows = [
    row({ id: 1, assignees: [{ user_id: "u2", assigned_by: "u2" }] }),
    row({ id: 2, parent_id: 1, status: "todo" }),
  ];
  const { byId } = buildTaskTree(rows);
  const ids = lineageAssigneeIds(byId, 1);
  expect(submitBlocker(reviewer, byId.get(1)!, ids)).toBe("not_assignee");
  expect(submitBlocker(dev, byId.get(1)!, ids)).toBe("output");

  rows[0] = { ...rows[0], expected_output: "x", steps: [{ id: 1, is_done: false }] };
  let t = buildTaskTree(rows);
  expect(submitBlocker(dev, t.byId.get(1)!, ids)).toBe("steps");

  rows[0] = { ...rows[0], steps: [{ id: 1, is_done: true }] };
  t = buildTaskTree(rows);
  expect(submitBlocker(dev, t.byId.get(1)!, ids)).toBe("subtasks");

  rows[1] = { ...rows[1], status: "done" };
  t = buildTaskTree(rows);
  expect(submitBlocker(dev, t.byId.get(1)!, ids)).toBe(null);

  rows[0] = { ...rows[0], status: "in_review" };
  t = buildTaskTree(rows);
  expect(submitBlocker(dev, t.byId.get(1)!, ids)).toBe("status");
});

test("canReviewTask: never your own, named reviewers win", () => {
  const waiting = row({
    id: 1,
    status: "in_review",
    assignees: [{ user_id: "p1", assigned_by: "p1" }],
  });
  expect(canReviewTask(pic, waiting)).toBe(false);
  expect(canReviewTask(reviewer, waiting)).toBe(true);
  expect(canReviewTask(dev, waiting)).toBe(false);
  const named = { ...waiting, reviewers: [{ user_id: "u2" }] };
  expect(canReviewTask(dev, named)).toBe(true);
  expect(canReviewTask(reviewer, named)).toBe(false);
  expect(canReviewTask(reviewer, { ...waiting, status: "in_progress" })).toBe(false);
});

test("canReviewTask: whoever submitted never judges it", () => {
  const submitted = row({ id: 1, status: "in_review", submitted_by: "r1" });
  expect(canReviewTask(reviewer, submitted)).toBe(false);
  expect(canReviewTask(pic, submitted)).toBe(true);
});

test("canSelfAssign: claim an unowned task, or join one you already work on", () => {
  const free = buildTaskTree([row({ id: 1 })]).byId.get(1)!;
  const owned = buildTaskTree([row({ id: 1, assignees: [{ user_id: "u9", assigned_by: "u9" }] })]).byId.get(1)!;
  expect(canSelfAssign(dev, free, new Set())).toBe(true);
  expect(canSelfAssign(dev, owned, new Set(["u9"]))).toBe(false);
  expect(canSelfAssign(pic, owned, new Set(["u9"]))).toBe(true);
  expect(canSelfAssign({ ...dev, memberRole: null }, free, new Set())).toBe(false);
  const mine = buildTaskTree([row({ id: 1, assignees: [{ user_id: "u2", assigned_by: "u2" }] })]).byId.get(1)!;
  expect(canSelfAssign(dev, mine, new Set(["u2"]))).toBe(false);
});

test("canTickStep: an owned step belongs to its owner and the PIC", () => {
  const lineageIds = new Set(["u2"]);
  expect(canTickStep(dev, { assignee_id: null }, lineageIds)).toBe(true);
  expect(canTickStep(reviewer, { assignee_id: null }, lineageIds)).toBe(false);
  expect(canTickStep(dev, { assignee_id: "r1" }, lineageIds)).toBe(false);
  expect(canTickStep(reviewer, { assignee_id: "r1" }, lineageIds)).toBe(true);
  expect(canTickStep(pic, { assignee_id: "r1" }, lineageIds)).toBe(true);
});
