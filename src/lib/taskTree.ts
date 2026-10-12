import type { BoardColumn, BoardTaskRow } from "./types";

export interface TaskNode {
  task: BoardTaskRow;
  children: TaskNode[];
}

const byPosition = (a: TaskNode, b: TaskNode) =>
  a.task.position - b.task.position || a.task.id - b.task.id;

export function buildTaskTree(rows: BoardTaskRow[]): {
  roots: TaskNode[];
  byId: Map<number, TaskNode>;
} {
  const all = new Map<number, TaskNode>();
  for (const r of rows) if (!r.archived_at) all.set(r.id, { task: r, children: [] });
  const roots: TaskNode[] = [];
  for (const node of all.values()) {
    if (node.task.parent_id == null) roots.push(node);
    else all.get(node.task.parent_id)?.children.push(node);
  }
  const byId = new Map<number, TaskNode>();
  const visit = (list: TaskNode[]) => {
    list.sort(byPosition);
    for (const n of list) {
      byId.set(n.task.id, n);
      visit(n.children);
    }
  };
  visit(roots);
  return { roots, byId };
}

export function groupRootsByColumn(
  roots: TaskNode[],
  columns: BoardColumn[],
): Record<number, number[]> {
  const out: Record<number, number[]> = {};
  for (const c of columns) out[c.id] = [];
  for (const r of roots) {
    if (r.task.column_id != null) out[r.task.column_id]?.push(r.task.id);
  }
  return out;
}

export interface Progress {
  done: number;
  total: number;
  pct: number;
}

export function computeProgress(node: TaskNode): Progress {
  let done = 0;
  let total = 0;
  const walk = (n: TaskNode, isSelf: boolean) => {
    for (const s of n.task.steps) {
      total++;
      if (s.is_done) done++;
    }
    if (!isSelf) {
      total++;
      if (n.task.status === "done") done++;
    }
    n.children.forEach((c) => walk(c, false));
  };
  walk(node, true);
  const pct =
    total === 0
      ? node.task.status === "done"
        ? 100
        : 0
      : Math.round((done / total) * 100);
  return { done, total, pct };
}

export function countDescendants(node: TaskNode): number {
  return node.children.reduce((n, c) => n + 1 + countDescendants(c), 0);
}

export function lineage(byId: Map<number, TaskNode>, id: number): TaskNode[] {
  const out: TaskNode[] = [];
  for (let n = byId.get(id); n; ) {
    out.unshift(n);
    n = n.task.parent_id == null ? undefined : byId.get(n.task.parent_id);
  }
  return out;
}

export function lineageAssigneeIds(
  byId: Map<number, TaskNode>,
  id: number,
): Set<string> {
  return new Set(
    lineage(byId, id).flatMap((n) => n.task.assignees.map((a) => a.user_id)),
  );
}

export function isSentBack(task: BoardTaskRow): boolean {
  if (task.status !== "in_progress" || task.reviews.length === 0) return false;
  const last = task.reviews.reduce((a, b) =>
    a.created_at > b.created_at ? a : b,
  );
  return last.decision === "rejected";
}
