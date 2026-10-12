import { useState } from "react";
import { Check, Pencil, Tag } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { cn } from "@/lib/utils";
import { useCreateLabel, useDeleteLabel, useToggleLabel, useUpdateLabel } from "@/hooks/useBoardTasks";
import { isBoardPic } from "@/lib/taskPermissions";
import type { BoardTaskRow, TaskLabel } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";

const COLORS = ["#ef4444", "#f97316", "#f59e0b", "#84cc16", "#10b981", "#06b6d4", "#3b82f6", "#6366f1", "#8b5cf6", "#ec4899", "#64748b", "#78716c"];

function LabelForm({
  initial,
  submitLabel,
  onSubmit,
  onCancel,
  onDelete,
}: {
  initial?: TaskLabel;
  submitLabel: string;
  onSubmit: (v: { name: string; color: string }) => void;
  onCancel: () => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(initial?.name ?? "");
  const [color, setColor] = useState(initial?.color ?? COLORS[6]);
  const submit = () => name.trim() && onSubmit({ name: name.trim(), color });
  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <span className="h-6 w-6 shrink-0 rounded" style={{ background: color }} />
        <Input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
            if (e.key === "Escape") {
              e.preventDefault();
              onCancel();
            }
          }}
          placeholder={t("board.labels.namePlaceholder")}
          className="h-8 text-xs"
        />
      </div>
      <div className="grid grid-cols-6 gap-1.5" role="radiogroup" aria-label={t("board.labels.color")}>
        {COLORS.map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={c === color}
            aria-label={c}
            onClick={() => setColor(c)}
            className={cn("flex h-6 items-center justify-center rounded", c === color && "ring-2 ring-ring ring-offset-1 ring-offset-background")}
            style={{ background: c }}
          >
            {c === color && <Check className="h-3.5 w-3.5 text-white" />}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <Button size="sm" className="h-7 flex-1 text-xs" disabled={!name.trim()} onClick={submit}>
          {submitLabel}
        </Button>
        <Button size="sm" variant="outline" className="h-7 text-xs" onClick={onCancel}>
          {t("common.cancel")}
        </Button>
        {onDelete && (
          <Button size="sm" variant="ghost" className="h-7 text-xs text-destructive" onClick={onDelete}>
            {t("board.labels.delete")}
          </Button>
        )}
      </div>
    </div>
  );
}

export function LabelPicker({ task, editable }: { task: BoardTaskRow; editable: boolean }) {
  const { t } = useTranslation();
  const { boardId, data, access } = useBoardCtx();
  const toggle = useToggleLabel(boardId);
  const create = useCreateLabel(boardId);
  const update = useUpdateLabel(boardId);
  const remove = useDeleteLabel(boardId);
  const [mode, setMode] = useState<"list" | "new" | TaskLabel>("list");
  const [deleting, setDeleting] = useState<TaskLabel | null>(null);
  const pic = isBoardPic(access);
  const on = (id: number) => task.labels.some((x) => x.label_id === id);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {data.labels.filter((l) => on(l.id)).map((l) => (
        <span key={l.id} className="rounded px-1.5 py-0.5 text-[11px] text-white" style={{ background: l.color }}>
          {l.name}
        </span>
      ))}
      {editable && (
        <Popover onOpenChange={(o) => !o && setMode("list")}>
          <PopoverTrigger asChild>
            <button type="button" className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("board.meta.labels")}>
              <Tag className="h-3.5 w-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-64 p-2">
            {mode === "list" ? (
              <div className="space-y-1">
                {data.labels.map((l) => (
                  <div key={l.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => toggle.mutate({ taskId: task.id, labelId: l.id, on: !on(l.id) })}
                      className="flex h-7 flex-1 items-center gap-2 rounded px-2 text-left text-xs text-white hover:opacity-90"
                      style={{ background: l.color }}
                    >
                      <span className="flex-1 truncate">{l.name}</span>
                      {on(l.id) && <Check className="h-3.5 w-3.5" />}
                    </button>
                    {pic && (
                      <button type="button" onClick={() => setMode(l)} className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("board.labels.edit")}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                ))}
                {pic && (
                  <Button size="sm" variant="secondary" className="mt-1 h-7 w-full text-xs" onClick={() => setMode("new")}>
                    {t("board.labels.create")}
                  </Button>
                )}
              </div>
            ) : mode === "new" ? (
              <LabelForm
                submitLabel={t("board.labels.create")}
                onSubmit={(v) => create.mutate(v, { onSuccess: () => setMode("list") })}
                onCancel={() => setMode("list")}
              />
            ) : (
              <LabelForm
                key={mode.id}
                initial={mode}
                submitLabel={t("board.labels.save")}
                onSubmit={(v) => update.mutate({ id: mode.id, ...v }, { onSuccess: () => setMode("list") })}
                onCancel={() => setMode("list")}
                onDelete={() => setDeleting(mode)}
              />
            )}
          </PopoverContent>
        </Popover>
      )}
      <DeleteConfirmationModal
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={t("board.labels.deleteTitle")}
        description={t("board.labels.deleteDesc", { name: deleting?.name })}
        isPending={remove.isPending}
        onConfirm={() =>
          deleting &&
          remove.mutate(deleting.id, {
            onSuccess: () => {
              setDeleting(null);
              setMode("list");
            },
          })
        }
      />
    </div>
  );
}
