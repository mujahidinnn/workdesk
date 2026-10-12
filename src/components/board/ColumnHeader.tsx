import { useState } from "react";
import { CheckCircle2, MoreHorizontal } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { PromptDialog } from "@/components/ui/PromptDialog";
import { cn } from "@/lib/utils";
import { useDeleteColumn, useUpdateColumn } from "@/hooks/useBoardColumns";
import type { BoardColumn } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";

const COLUMN_COLORS: (string | null)[] = [null, "#ef4444", "#f59e0b", "#10b981", "#06b6d4", "#3b82f6", "#8b5cf6", "#ec4899", "#64748b", "#78716c"];

export function ColumnHeader({
  column,
  count,
  dragHandle,
}: {
  column: BoardColumn;
  count: number;
  dragHandle: Record<string, unknown>;
}) {
  const { t } = useTranslation();
  const { boardId, access } = useBoardCtx();
  const update = useUpdateColumn(boardId);
  const remove = useDeleteColumn(boardId);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [wipOpen, setWipOpen] = useState(false);
  const canManage = access.isAdmin || access.memberRole === "pic";
  const overWip = column.wip_limit != null && count > column.wip_limit;

  function rename(name: string) {
    setEditing(false);
    if (name.trim() && name.trim() !== column.name) update.mutate({ id: column.id, name: name.trim() });
  }

  function saveWip(v: string) {
    const n = Number(v);
    update.mutate({ id: column.id, wip_limit: v && n > 0 ? Math.floor(n) : null });
  }

  return (
    <div className="flex items-center gap-2 px-1" {...(canManage ? dragHandle : {})}>
      {editing ? (
        <Input
          autoFocus
          defaultValue={column.name}
          className="h-7 text-sm"
          onBlur={(e) => rename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") rename(e.currentTarget.value);
            if (e.key === "Escape") setEditing(false);
          }}
        />
      ) : (
        <p className="flex-1 truncate text-sm font-semibold text-foreground">
          {column.is_done_column && <CheckCircle2 className="mr-1 inline h-3.5 w-3.5 text-emerald-500" />}
          {column.name}
        </p>
      )}
      <span className={cn("text-xs tabular-nums", overWip ? "font-semibold text-red-500" : "text-muted-foreground")}>
        {count}
        {column.wip_limit != null && `/${column.wip_limit}`}
      </span>
      {canManage && (
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded p-1 text-muted-foreground hover:bg-muted" aria-label={t("board.column.menu")}>
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => setEditing(true)}>{t("board.column.rename")}</DropdownMenuItem>
            <DropdownMenuItem onClick={() => setWipOpen(true)}>{t("board.column.wip")}</DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>{t("board.column.color")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="grid grid-cols-5 gap-1.5 p-2">
                {COLUMN_COLORS.map((c) => (
                  <button
                    key={c ?? "none"}
                    type="button"
                    onClick={() => update.mutate({ id: column.id, color: c })}
                    className={cn(
                      "h-6 w-6 rounded border border-border",
                      column.color === c && "ring-2 ring-ring ring-offset-1 ring-offset-background",
                    )}
                    style={{ background: c ?? "transparent" }}
                    aria-label={c ?? t("board.column.noColor")}
                    title={c ?? t("board.column.noColor")}
                  />
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onClick={() => update.mutate({ id: column.id, is_done_column: !column.is_done_column })}>
              {column.is_done_column ? t("board.column.unmarkDone") : t("board.column.markDone")}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive"
              disabled={count > 0}
              onClick={() => setConfirmDelete(true)}
            >
              {count > 0 ? t("board.column.deleteNonEmpty") : t("board.column.delete")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <PromptDialog
        open={wipOpen}
        onOpenChange={setWipOpen}
        title={t("board.column.wip")}
        description={t("board.column.wipPrompt")}
        placeholder={t("board.column.wipPlaceholder")}
        clearLabel={t("board.column.wipClear")}
        type="number"
        allowEmpty
        defaultValue={column.wip_limit?.toString() ?? ""}
        onSubmit={saveWip}
      />
      <DeleteConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={t("board.column.deleteTitle")}
        description={t("board.column.deleteDesc", { name: column.name })}
        isPending={remove.isPending}
        onConfirm={() => remove.mutate(column.id, { onSettled: () => setConfirmDelete(false) })}
      />
    </div>
  );
}
