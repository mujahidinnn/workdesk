import { useRef, useState } from "react";
import { Paperclip, X, FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import {
  useTaskAttachments,
  useUploadTaskAttachment,
  useDeleteTaskAttachment,
  type TaskAttachmentWithUrl,
} from "@/hooks/useTaskAttachments";
import { cn } from "@/lib/utils";
import { useAuth } from "@/context/auth";
import type { TaskSource } from "@/lib/types";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

function isImage(fileName: string) {
  return /\.(jpe?g|png|webp|gif)$/i.test(fileName);
}

interface TaskAttachmentsProps {
  taskId: number;
  source?: TaskSource;
  canManage?: boolean;
}

export function TaskAttachments({
  taskId,
  source = "daily",
  canManage = false,
}: TaskAttachmentsProps) {
  const { user, canUpdate } = useAuth();
  // Mirrors the delete policies: the uploader, a master editor (daily log) or the PIC (board).
  const canRemove = (a: TaskAttachmentWithUrl) =>
    a.uploaded_by === user?.id || (source === "board" ? canManage : canUpdate("master"));
  const { t } = useTranslation();
  const { data: attachments = [], isLoading } = useTaskAttachments(taskId, source);
  const upload = useUploadTaskAttachment(source);
  const deleteAttachment = useDeleteTaskAttachment(source);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [removing, setRemoving] = useState<TaskAttachmentWithUrl | null>(null);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
      toast.error("File is too large (max 10MB)");
      return;
    }
    upload.mutate({ taskId, file });
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground">
          {t("taskForm.attachments.title")}
          {attachments.length > 0 && ` (${attachments.length})`}
        </p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 text-[11px] gap-1.5 border-border"
          onClick={() => fileInputRef.current?.click()}
          loading={upload.isPending}
        >
          <Paperclip className="w-3 h-3" />
          {t("taskForm.attachments.add")}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="hidden"
          onChange={handleFileChange}
        />
      </div>

      {isLoading ? (
        <div className="h-16 rounded-lg bg-secondary animate-pulse" />
      ) : attachments.length === 0 ? (
        <p className="text-[11px] text-muted-foreground/60">
          {t("taskForm.attachments.empty")}
        </p>
      ) : (
        <div className="flex flex-wrap gap-2">
          {attachments.map((a) => (
            <div key={a.id} className="relative group">
              <a
                href={a.url ?? undefined}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center justify-center overflow-hidden rounded-lg border border-border bg-secondary",
                  isImage(a.file_name)
                    ? "w-16 h-16"
                    : "w-16 h-16 flex-col gap-1",
                )}
                title={a.file_name}
              >
                {isImage(a.file_name) && a.url ? (
                  <img
                    src={a.url}
                    alt={a.file_name}
                    loading="lazy"
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <>
                    <FileText className="w-5 h-5 text-muted-foreground" />
                    <span className="text-[8px] text-muted-foreground px-1 truncate max-w-full">
                      {a.file_name}
                    </span>
                  </>
                )}
              </a>
              {canRemove(a) && (
                <button
                  type="button"
                  onClick={() => setRemoving(a)}
                  title={t("taskForm.attachments.delete")}
                  aria-label={t("taskForm.attachments.delete")}
                  className="absolute -top-1.5 -right-1.5 w-4.5 h-4.5 rounded-full bg-destructive text-white flex items-center justify-center opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      <DeleteConfirmationModal
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={t("taskForm.attachments.deleteTitle")}
        description={t("taskForm.attachments.deleteDesc", { name: removing?.file_name })}
        isPending={deleteAttachment.isPending}
        onConfirm={() =>
          removing &&
          deleteAttachment.mutate(
            { id: removing.id, filePath: removing.file_path, taskId },
            { onSuccess: () => setRemoving(null) },
          )
        }
      />
    </div>
  );
}
