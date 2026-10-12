import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TaskStep } from "@/lib/types";
import { boardKey } from "./useBoard";
import { toast } from "sonner";

const stepsKey = (taskId: number) => ["task-steps", taskId] as const;

export function useTaskSteps(taskId: number | null) {
  return useQuery<TaskStep[]>({
    queryKey: stepsKey(taskId ?? 0),
    enabled: taskId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_task_steps")
        .select("*")
        .eq("task_id", taskId!)
        .order("position")
        .order("id");
      if (error) throw error;
      return data as TaskStep[];
    },
  });
}

function useStepWrite<V>(boardId: number, taskId: number, fn: (v: V) => Promise<void>) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: fn,
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: stepsKey(taskId) }),
        qc.invalidateQueries({ queryKey: boardKey(boardId) }),
        qc.invalidateQueries({ queryKey: ["task-activity", taskId] }),
        qc.invalidateQueries({ queryKey: ["my-tasks"] }),
      ]),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useTaskStepWrites(boardId: number, taskId: number) {
  const add = useStepWrite(boardId, taskId, async (v: { title: string; position: number }) => {
    const { error } = await supabase.from("t_task_steps").insert({ task_id: taskId, ...v });
    if (error) throw error;
  });
  const update = useStepWrite(
    boardId,
    taskId,
    async ({ id, ...patch }: { id: number; title?: string; note?: string | null; is_done?: boolean; assignee_id?: string | null }) => {
      const { error, count } = await supabase
        .from("t_task_steps")
        .update(patch, { count: "exact" })
        .eq("id", id);
      if (error) throw error;
      if (count === 0) throw new Error("You cannot change this step");
    },
  );
  const remove = useStepWrite(boardId, taskId, async (id: number) => {
    const { error } = await supabase.from("t_task_steps").delete().eq("id", id);
    if (error) throw error;
  });
  const move = useStepWrite(
    boardId,
    taskId,
    async (v: { stepId: number; beforeId: number | null; afterId: number | null }) => {
      const { error } = await supabase.rpc("move_step", {
        p_step_id: v.stepId,
        p_before_id: v.beforeId ?? undefined,
        p_after_id: v.afterId ?? undefined,
      });
      if (error) throw error;
    },
  );
  return { add, update, remove, move };
}
