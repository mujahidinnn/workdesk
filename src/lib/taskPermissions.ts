// Mirrors the RLS rules in 20261102000000_task_board_schema.sql and the
// RPCs in 20261102000100_task_board_workflow.sql. Hides actions only; the
// database is what refuses them.
import type { TaskNode } from "./taskTree";
import type { BoardTaskRow, MemberRole } from "./types";

export interface TaskAccess {
  userId: string;
  isAdmin: boolean;
  memberRole: MemberRole | null;
}

export const isBoardPic = (a: TaskAccess) =>
  a.isAdmin || a.memberRole === "pic";

export function canWorkTask(a: TaskAccess, lineageAssignees: Set<string>) {
  return isBoardPic(a) || lineageAssignees.has(a.userId);
}

export function canSelfAssign(a: TaskAccess, node: TaskNode, lineageAssignees: Set<string>) {
  if (node.task.assignees.some((x) => x.user_id === a.userId)) return false;
  if (canWorkTask(a, lineageAssignees)) return true;
  return node.task.assignees.length === 0 && (a.isAdmin || a.memberRole != null);
}

export function canTickStep(a: TaskAccess, step: { assignee_id: string | null }, lineageAssignees: Set<string>) {
  if (step.assignee_id) return step.assignee_id === a.userId || isBoardPic(a);
  return canWorkTask(a, lineageAssignees);
}

export function canUnassign(a: TaskAccess, assignedBy: string | null) {
  return isBoardPic(a) || assignedBy === a.userId;
}

export type SubmitBlocker =
  | "not_assignee"
  | "status"
  | "output"
  | "steps"
  | "subtasks";

export function submitBlocker(
  a: TaskAccess,
  node: TaskNode,
  lineageAssignees: Set<string>,
): SubmitBlocker | null {
  const t = node.task;
  if (!lineageAssignees.has(a.userId)) return "not_assignee";
  if (t.status === "in_review" || t.status === "done") return "status";
  if (!t.expected_output?.trim()) return "output";
  if (t.steps.some((s) => !s.is_done)) return "steps";
  if (node.children.some((c) => c.task.status !== "done")) return "subtasks";
  return null;
}

export function canReviewTask(a: TaskAccess, task: BoardTaskRow) {
  if (task.status !== "in_review") return false;
  if (task.assignees.some((x) => x.user_id === a.userId)) return false;
  if (task.submitted_by === a.userId) return false;
  if (task.reviewers.length > 0)
    return task.reviewers.some((r) => r.user_id === a.userId);
  return a.isAdmin || a.memberRole === "pic" || a.memberRole === "reviewer";
}

export function accessFor(
  userId: string,
  isAdmin: boolean,
  members: { user_id: string; member_role: MemberRole }[],
): TaskAccess {
  return {
    userId,
    isAdmin,
    memberRole: members.find((m) => m.user_id === userId)?.member_role ?? null,
  };
}
