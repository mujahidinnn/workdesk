import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import { toast } from "sonner";
import type { TaskCommentWithAuthor } from "@/lib/types";

export function useTaskComments(taskId: number | null) {
  return useQuery<TaskCommentWithAuthor[]>({
    queryKey: ["task-comments", taskId],
    enabled: taskId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_task_comments")
        .select(
          "*, author:profiles!t_task_comments_user_id_fkey(id, full_name, avatar_url)",
        )
        .eq("task_id", taskId!)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return data as TaskCommentWithAuthor[];
    },
  });
}

export function useAddTaskComment() {
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
        .from("t_task_comments")
        .insert({ task_id: taskId, user_id: user.id, comment, mentions });
      if (error) throw error;
    },
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTaskComment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; taskId: number }) => {
      const { error } = await supabase
        .from("t_task_comments")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["task-comments", taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
