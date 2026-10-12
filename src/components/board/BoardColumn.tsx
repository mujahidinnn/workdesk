import { useState } from "react";
import { SortableContext, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useCreateTask } from "@/hooks/useBoardTasks";
import { useAuth } from "@/context/auth";
import type { BoardColumn as Column } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";
import { ColumnHeader } from "./ColumnHeader";
import { SortableTaskCard } from "./TaskCard";
import { cardKey, colKey } from "./dndKeys";

export function BoardColumn({
  column,
  cardIds,
  onOpen,
}: {
  column: Column;
  cardIds: number[];
  onOpen: (taskNo: number) => void;
}) {
  const { t } = useTranslation();
  const { boardId, byId, data } = useBoardCtx();
  const create = useCreateTask(boardId);
  const { canCreate } = useAuth();
  const canAdd = canCreate("board") && !column.is_done_column;
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState("");
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: colKey(column.id),
  });

  function add() {
    const value = title.trim();
    if (!value) return setAdding(false);
    const last = data.tasks
      .filter((x) => x.column_id === column.id)
      .reduce((m, x) => Math.max(m, x.position), 0);
    create.mutate(
      { title: value, column_id: column.id, position: last + 1024 },
      {
        onSuccess: (created) => {
          setTitle("");
          setAdding(false);
          onOpen(created.task_no);
        },
      },
    );
  }

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        borderTopColor: column.color ?? undefined,
      }}
      className={cn(
        "flex max-h-full w-72 shrink-0 flex-col gap-2 rounded-xl bg-muted/60 p-2",
        column.color && "border-t-4",
        isDragging && "opacity-50",
      )}
    >
      <ColumnHeader
        column={column}
        count={data.tasks.filter((x) => x.column_id === column.id).length}
        dragHandle={{ ...attributes, ...listeners }}
      />
      <SortableContext items={cardIds.map(cardKey)} strategy={verticalListSortingStrategy}>
        <div className="flex min-h-8 flex-col gap-2 overflow-y-auto scrollbar-thin">
          {cardIds.map((id) => {
            const node = byId.get(id);
            return node ? (
              <SortableTaskCard key={id} node={node} onOpen={() => onOpen(node.task.task_no)} />
            ) : null;
          })}
        </div>
      </SortableContext>
      {adding ? (
        <div className="space-y-2">
          <Textarea
            autoFocus
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder={t("board.card.titlePlaceholder")}
            className="min-h-[60px] text-sm"
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                add();
              }
              if (e.key === "Escape") setAdding(false);
            }}
          />
          <div className="flex gap-2">
            <Button size="sm" onClick={add} loading={create.isPending}>
              {t("board.card.add")}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAdding(false)}>
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      ) : canAdd ? (
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-muted"
        >
          <Plus className="h-4 w-4" />
          {t("board.card.add")}
        </button>
      ) : null}
    </div>
  );
}
