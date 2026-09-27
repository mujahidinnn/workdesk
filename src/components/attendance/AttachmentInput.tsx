import { Paperclip, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { Label } from "@/components/ui/label";

// Matches the attendance-attachments bucket's file_size_limit / allowed_mime_types.
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ACCEPT =
  "image/jpeg,image/png,image/webp,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

interface AttachmentInputProps {
  file: File | null;
  onChange: (f: File | null) => void;
  /** Name of the file already stored, shown until a new one is picked. */
  currentName?: string | null;
}

export function AttachmentInput({ file, onChange, currentName }: AttachmentInputProps) {
  const { t } = useTranslation();
  const shown = file?.name ?? currentName;

  return (
    <div className="space-y-1.5">
      <Label className="text-xs text-muted-foreground font-medium">
        {t("attendance.dialog.attachment")}
      </Label>
      <div className="flex items-center gap-2">
        <label className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-border bg-secondary text-xs text-muted-foreground hover:text-foreground cursor-pointer shrink-0">
          <Paperclip className="w-3.5 h-3.5" />
          {t("attendance.dialog.attachmentPick")}
          <input
            type="file"
            accept={ACCEPT}
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0] ?? null;
              e.target.value = "";
              if (f && f.size > MAX_FILE_SIZE) {
                toast.error(t("attendance.errors.fileTooLarge"));
                return;
              }
              onChange(f);
            }}
          />
        </label>
        {shown && (
          <span className="text-xs text-foreground truncate">{shown}</span>
        )}
        {file && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="p-1 rounded text-muted-foreground hover:text-destructive"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>
      <p className="text-[11px] text-muted-foreground/70">
        {t("attendance.dialog.attachmentHint")}
      </p>
    </div>
  );
}
