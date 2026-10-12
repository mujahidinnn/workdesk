import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useAuth } from "@/context/auth";
import { useDivisions } from "@/hooks/useDivisions";
import { useProfiles, type BoardData } from "@/hooks/useBoard";
import { buildTaskTree, lineageAssigneeIds, type TaskNode } from "@/lib/taskTree";
import { accessFor, canWorkTask, type TaskAccess } from "@/lib/taskPermissions";
import type { BoardMember, Division } from "@/lib/types";

interface BoardCtx {
  data: BoardData;
  boardId: number;
  roots: TaskNode[];
  byId: Map<number, TaskNode>;
  access: TaskAccess;
  people: Map<string, BoardMember>;
  divisions: Division[];
  canWork: (taskId: number) => boolean;
}

const Ctx = createContext<BoardCtx | null>(null);

export function BoardProvider({ data, children }: { data: BoardData; children: ReactNode }) {
  const { user, isAdmin } = useAuth();
  const { data: divisions = [] } = useDivisions();
  const memberIds = new Set(data.members.map((m) => m.user_id));
  const referenced = data.tasks
    .flatMap((x) => [
      ...x.assignees.flatMap((a) => [a.user_id, a.assigned_by]),
      ...x.reviewers.map((r) => r.user_id),
      ...x.steps.flatMap((s) => [s.assignee_id, s.done_by]),
      x.created_by,
      x.completed_by,
      x.submitted_by,
    ])
    .filter((id): id is string => !!id && !memberIds.has(id));
  const { data: former = [] } = useProfiles(referenced);
  const value = useMemo<BoardCtx>(() => {
    const { roots, byId } = buildTaskTree(data.tasks);
    const access = accessFor(user?.id ?? "", isAdmin(), data.members);
    return {
      data,
      boardId: data.board.id,
      roots,
      byId,
      access,
      people: new Map([
        ...former.map((p): [string, BoardMember] => [p.id, { user_id: p.id, member_role: "member", left: true, profile: p }]),
        ...data.members.map((m): [string, BoardMember] => [m.user_id, m]),
      ]),
      divisions,
      canWork: (id) => canWorkTask(access, lineageAssigneeIds(byId, id)),
    };
  }, [data, divisions, former, user?.id, isAdmin]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useBoardCtx() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useBoardCtx outside BoardProvider");
  return ctx;
}
