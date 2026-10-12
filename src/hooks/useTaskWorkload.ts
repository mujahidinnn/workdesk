import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { summarizeWorkload, type WorkloadCounts } from "@/lib/workload";
import type { TaskStatus } from "@/lib/types";

export interface TaskWorkload {
  counts: Map<string, WorkloadCounts>;
  steps: Map<string, number>;
}

export function useTaskWorkload(divisionId?: number) {
  return useQuery<TaskWorkload>({
    queryKey: ["task-workload", divisionId ?? null],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let cards = supabase
        .from("t_task_assignees")
        .select("user_id, task:t_tasks!inner(status, due_date, completed_at, archived_at, division_id)")
        .is("task.archived_at", null);
      let steps = supabase
        .from("t_task_steps")
        .select("assignee_id, task:t_tasks!inner(archived_at, division_id)")
        .eq("is_done", false)
        .not("assignee_id", "is", null)
        .is("task.archived_at", null);
      if (divisionId) {
        cards = cards.eq("task.division_id", divisionId);
        steps = steps.eq("task.division_id", divisionId);
      }
      const [c, s] = await Promise.all([cards, steps]);
      if (c.error) throw c.error;
      if (s.error) throw s.error;
      const stepCounts = new Map<string, number>();
      for (const r of s.data) stepCounts.set(r.assignee_id!, (stepCounts.get(r.assignee_id!) ?? 0) + 1);
      return {
        counts: summarizeWorkload(
          c.data.map((r) => {
            const t = r.task as { status: TaskStatus; due_date: string | null; completed_at: string | null };
            return { user_id: r.user_id, ...t };
          }),
          new Date(),
        ),
        steps: stepCounts,
      };
    },
  });
}
