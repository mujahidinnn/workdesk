import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import { toast } from "sonner";
import type { TaskAttachment, TaskSource } from "@/lib/types";

const BUCKET = "task-attachments";
const SIGNED_URL_TTL = 60 * 60;

const TABLE = {
  daily: "t_task_attachments",
  board: "t_board_task_attachments",
} as const;
const table = (source: TaskSource) => TABLE[source] as "t_task_attachments";
const folder = (source: TaskSource, taskId: number) =>
  source === "board" ? `board/${taskId}` : `${taskId}`;

export interface TaskAttachmentWithUrl extends TaskAttachment {
  url: string | null;
}

export function useTaskAttachments(
  taskId: number | null,
  source: TaskSource = "daily",
) {
  return useQuery<TaskAttachmentWithUrl[]>({
    queryKey: ["task-attachments", source, taskId],
    enabled: taskId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from(table(source))
        .select("*")
        .eq("task_id", taskId!)
        .order("created_at", { ascending: true });
      if (error) throw error;

      const rows = data as TaskAttachment[];
      const withUrls = await Promise.all(
        rows.map(async (row) => {
          const { data: signed } = await supabase.storage
            .from(BUCKET)
            .createSignedUrl(row.file_path, SIGNED_URL_TTL);
          return { ...row, url: signed?.signedUrl ?? null };
        }),
      );
      return withUrls;
    },
  });
}

export function useUploadTaskAttachment(source: TaskSource = "daily") {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ taskId, file }: { taskId: number; file: File }) => {
      if (!user) throw new Error("Not signed in");
      const ext = file.name.split(".").pop();
      const path = `${folder(source, taskId)}/${crypto.randomUUID()}.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from(BUCKET)
        .upload(path, file);
      if (uploadErr) throw uploadErr;

      const { error: insertErr } = await supabase
        .from(table(source))
        .insert({
          task_id: taskId,
          file_path: path,
          file_name: file.name,
          uploaded_by: user.id,
        });
      if (insertErr) {
        await supabase.storage.from(BUCKET).remove([path]);
        throw insertErr;
      }
    },
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["task-attachments", source, taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteTaskAttachment(source: TaskSource = "daily") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      filePath,
    }: {
      id: number;
      filePath: string;
      taskId: number;
    }) => {
      const { error: storageErr } = await supabase.storage
        .from(BUCKET)
        .remove([filePath]);
      if (storageErr) throw storageErr;
      const { error } = await supabase
        .from(table(source))
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { taskId }) => {
      qc.invalidateQueries({ queryKey: ["task-attachments", source, taskId] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
