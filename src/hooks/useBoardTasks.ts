import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { positionBetween } from "@/lib/position";
import type { BoardTask } from "@/lib/types";
import { boardKey, type BoardData } from "./useBoard";
import { toast } from "sonner";

export type TaskPatch = Partial<
  Pick<
    BoardTask,
    | "title"
    | "description"
    | "expected_output"
    | "division_id"
    | "priority"
    | "start_date"
    | "due_date"
    | "estimate_hours"
    | "status"
    | "archived_at"
  >
>;

function useBoardWrite<V, R = unknown>(
  boardId: number,
  fn: (v: V) => Promise<R>,
  taskIdOf?: (v: V) => number,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    // Stay pending until the board has refetched, so buttons keep their
    // loading state until the change is on screen (no double submits).
    onSuccess: (_d, v) =>
      Promise.all([
        qc.invalidateQueries({ queryKey: boardKey(boardId) }),
        qc.invalidateQueries({ queryKey: ["board-stats"] }),
        qc.invalidateQueries({ queryKey: ["my-tasks"] }),
        taskIdOf && qc.invalidateQueries({ queryKey: ["task-activity", taskIdOf(v)] }),
      ]),
    onError: (e: Error) => toast.error(e.message),
  });
}

const ok = ({ error }: { error: unknown }) => {
  if (error) throw error;
};

export function useCreateTask(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: {
      title: string;
      position: number;
      column_id?: number | null;
      parent_id?: number | null;
      division_id?: number | null;
    }) => {
      const { data, error } = await supabase
        .from("t_tasks")
        .insert({ board_id: boardId, ...v })
        .select("id, task_no")
        .single();
      if (error) throw error;
      return data;
    },
  );
}

export function useUpdateTask(boardId: number) {
  return useBoardWrite(
    boardId,
    async ({ id, ...patch }: TaskPatch & { id: number }) =>
      ok(await supabase.from("t_tasks").update(patch).eq("id", id)),
    (v) => v.id,
  );
}

export function useDeleteTask(boardId: number) {
  return useBoardWrite(boardId, async (id: number) =>
    ok(await supabase.from("t_tasks").delete().eq("id", id)),
  );
}

export function useAssign(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; userId: string }) =>
      ok(await supabase.from("t_task_assignees").insert({ task_id: v.taskId, user_id: v.userId })),
    (v) => v.taskId,
  );
}

export function useUnassign(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; userId: string }) => {
      const { error, count } = await supabase
        .from("t_task_assignees")
        .delete({ count: "exact" })
        .eq("task_id", v.taskId)
        .eq("user_id", v.userId);
      if (error) throw error;
      if (count === 0) throw new Error("Only whoever assigned them, or the PIC, can remove this person");
    },
    (v) => v.taskId,
  );
}

export function useToggleReviewer(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; userId: string; on: boolean }) =>
      ok(
        v.on
          ? await supabase.from("t_task_reviewers").insert({ task_id: v.taskId, user_id: v.userId })
          : await supabase.from("t_task_reviewers").delete().eq("task_id", v.taskId).eq("user_id", v.userId),
      ),
    (v) => v.taskId,
  );
}

export function useToggleLabel(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; labelId: number; on: boolean }) =>
      ok(
        v.on
          ? await supabase.from("t_task_label_map").insert({ task_id: v.taskId, label_id: v.labelId })
          : await supabase.from("t_task_label_map").delete().eq("task_id", v.taskId).eq("label_id", v.labelId),
      ),
    (v) => v.taskId,
  );
}

export function useCreateLabel(boardId: number) {
  return useBoardWrite(boardId, async (v: { name: string; color: string }) =>
    ok(await supabase.from("t_task_labels").insert({ board_id: boardId, ...v })),
  );
}

export function useUpdateLabel(boardId: number) {
  return useBoardWrite(boardId, async ({ id, ...v }: { id: number; name: string; color: string }) =>
    ok(await supabase.from("t_task_labels").update(v).eq("id", id)),
  );
}

export function useDeleteLabel(boardId: number) {
  return useBoardWrite(boardId, async (id: number) =>
    ok(await supabase.from("t_task_labels").delete().eq("id", id)),
  );
}

interface MoveVars {
  taskId: number;
  columnId: number;
  beforeId: number | null;
  afterId: number | null;
}

export function useMoveTask(boardId: number) {
  const qc = useQueryClient();
  const key = boardKey(boardId);
  return useMutation({
    mutationFn: async (v: MoveVars) =>
      ok(
        await supabase.rpc("move_task", {
          p_task_id: v.taskId,
          p_column_id: v.columnId,
          p_before_id: v.beforeId ?? undefined,
          p_after_id: v.afterId ?? undefined,
        }),
      ),
    onMutate: async (v) => {
      await qc.cancelQueries({ queryKey: key });
      const prev = qc.getQueryData<BoardData>(key);
      if (prev) {
        const pos = (id: number | null) =>
          prev.tasks.find((t) => t.id === id)?.position ?? null;
        const position = positionBetween(pos(v.beforeId), pos(v.afterId));
        qc.setQueryData<BoardData>(key, {
          ...prev,
          tasks: prev.tasks.map((t) =>
            t.id === v.taskId ? { ...t, column_id: v.columnId, position } : t,
          ),
        });
      }
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(key, ctx.prev);
      toast.error(e.message);
    },
    onSettled: (_d, _e, v) => {
      qc.invalidateQueries({ queryKey: key });
      qc.invalidateQueries({ queryKey: ["task-activity", v.taskId] });
    },
  });
}

export function useReparentTask(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: {
      taskId: number;
      parentId: number | null;
      columnId?: number;
      beforeId: number | null;
      afterId: number | null;
    }) =>
      ok(
        await supabase.rpc("reparent_task", {
          p_task_id: v.taskId,
          p_new_parent_id: v.parentId as number,
          p_column_id: v.columnId,
          p_before_id: v.beforeId ?? undefined,
          p_after_id: v.afterId ?? undefined,
        }),
      ),
    (v) => v.taskId,
  );
}

export function useSubmitReview(boardId: number) {
  return useBoardWrite(
    boardId,
    async (taskId: number) => ok(await supabase.rpc("submit_review", { p_task_id: taskId })),
    (taskId) => taskId,
  );
}

export function useReviewTask(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; decision: "approved" | "rejected"; note: string }) =>
      ok(
        await supabase.rpc("review_task", {
          p_task_id: v.taskId,
          p_decision: v.decision,
          p_note: v.note,
        }),
      ),
    (v) => v.taskId,
  );
}

export function useWithdrawReview(boardId: number) {
  return useBoardWrite(
    boardId,
    async (taskId: number) => ok(await supabase.rpc("withdraw_review", { p_task_id: taskId })),
    (taskId) => taskId,
  );
}

export function useMoveTaskToBoard(boardId: number) {
  return useBoardWrite(
    boardId,
    async (v: { taskId: number; targetBoardId: number }) =>
      ok(await supabase.rpc("move_task_to_board", { p_task_id: v.taskId, p_board_id: v.targetBoardId })),
  );
}
