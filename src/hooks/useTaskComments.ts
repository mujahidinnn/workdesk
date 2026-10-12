import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import { toast } from "sonner";
import type { TaskCommentWithAuthor, TaskSource } from "@/lib/types";

const TABLE = {
  daily: "t_task_comments",
  board: "t_board_task_comments",
} as const;
const table = (source: TaskSource) => TABLE[source] as "t_task_comments";

export function useTaskComments(taskId: number | null, source: TaskSource = "daily") {
  return useQuery<TaskCommentWithAuthor[]>({
    queryKey: ["task-comments", source, taskId],
    enabled: taskId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table(source))
        .select(
          `*, author:profiles!${TABLE[source]}_user_id_fkey(id, full_name, avatar_url)`,
        )
        .eq("task_id", taskId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as unknown as TaskCommentWithAuthor[];
    },
  });
}

export function useAddTaskComment(source: TaskSource = "daily") {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      taskId,
      comment,
      mentions = [],
    }: {
      taskId: number;
      comment: string;
      mentions?: string[];
    }) => {
      if (!user) throw new Error("Not signed in");
      const { error } = await supabase
        .from(table(source))
        .insert({ task_id: taskId, user_id: user.id, comment, mentions });
      if (error) throw error;
    },
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["task-comments", source, taskId] });
      qc.invalidateQueries({ queryKey: ["problems-log"] });
      qc.invalidateQueries({ queryKey: ["task-activity", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTaskComment(source: TaskSource = "daily") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; taskId: number }) => {
      const { error } = await supabase.from(table(source)).delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["task-comments", source, taskId] });
      qc.invalidateQueries({ queryKey: ["problems-log"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
