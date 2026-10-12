import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TaskActivity } from "@/lib/types";

export function useTaskActivity(taskId: number | null) {
  return useQuery<TaskActivity[]>({
    queryKey: ["task-activity", taskId],
    enabled: taskId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_task_activity")
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return data as TaskActivity[];
    },
  });
}
