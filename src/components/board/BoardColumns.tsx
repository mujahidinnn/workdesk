import { useEffect, useMemo, useRef, useState } from "react";
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type UniqueIdentifier,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  horizontalListSortingStrategy,
  sortableKeyboardCoordinates,
} from "@dnd-kit/sortable";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { toast } from "sonner";
import { useMoveTask } from "@/hooks/useBoardTasks";
import { useAddColumn, useUpdateColumn } from "@/hooks/useBoardColumns";
import { groupRootsByColumn } from "@/lib/taskTree";
import { neighbourIds, positionBetween } from "@/lib/position";
import { PromptDialog } from "@/components/ui/PromptDialog";
import { useBoardCtx } from "./BoardContext";
import { BoardColumn } from "./BoardColumn";
import { colKey, parseKey } from "./dndKeys";
import { TaskCardBody } from "./TaskCard";
import { TopScrollbar } from "./TopScrollbar";

export function BoardColumns({
  visible,
  onOpen,
}: {
  visible: Set<number>;
  onOpen: (taskNo: number) => void;
}) {
  const { t } = useTranslation();
  const { boardId, data, roots, byId, access } = useBoardCtx();
  const moveTask = useMoveTask(boardId);
  const updateColumn = useUpdateColumn(boardId);
  const addColumn = useAddColumn(boardId);
  const canManage = access.isAdmin || access.memberRole === "pic";

  const serverCards = useMemo(() => groupRootsByColumn(roots, data.columns), [roots, data.columns]);
  const serverCols = useMemo(() => data.columns.map((c) => c.id), [data.columns]);
  const [cards, setCards] = useState(serverCards);
  const [cols, setCols] = useState(serverCols);
  const [active, setActive] = useState<UniqueIdentifier | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const dragging = useRef(false);

  // Resync only when the server data changes, and never mid-drag: resyncing on
  // drop would show the pre-move cache for a frame before the optimistic write.
  useEffect(() => {
    if (dragging.current) return;
    setCards(serverCards);
    setCols(serverCols);
  }, [serverCards, serverCols]);

  function reset() {
    setCards(serverCards);
    setCols(serverCols);
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 6 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
      keyboardCodes: { start: ["Space"], cancel: ["Escape"], end: ["Space"] },
    }),
  );

  const columnOf = (key: UniqueIdentifier): number | null => {
    const { kind, id } = parseKey(key);
    if (kind === "col") return id;
    const found = Object.entries(cards).find(([, ids]) => ids.includes(id));
    return found ? Number(found[0]) : null;
  };

  function onDragOver({ active: a, over }: DragOverEvent) {
    if (!over || parseKey(a.id).kind !== "task") return;
    const id = parseKey(a.id).id;
    const from = columnOf(a.id);
    const to = columnOf(over.id);
    if (from == null || to == null || from === to) return;
    setCards((prev) => {
      const target = [...prev[to]];
      const overIdx = parseKey(over.id).kind === "task" ? target.indexOf(parseKey(over.id).id) : -1;
      target.splice(overIdx < 0 ? target.length : overIdx, 0, id);
      return { ...prev, [from]: prev[from].filter((x) => x !== id), [to]: target };
    });
  }

  function onDragEnd({ active: a, over }: DragEndEvent) {
    dragging.current = false;
    setActive(null);
    if (!over) return reset();
    const { kind, id } = parseKey(a.id);

    if (kind === "col") {
      const to = columnOf(over.id);
      if (to == null || to === id) return reset();
      const next = arrayMove(cols, cols.indexOf(id), cols.indexOf(to));
      setCols(next);
      const { beforeId, afterId } = neighbourIds(next, next.indexOf(id));
      const pos = (cid: number | null) => data.columns.find((c) => c.id === cid)?.position ?? null;
      updateColumn.mutate({ id, position: positionBetween(pos(beforeId), pos(afterId)) });
      return;
    }

    const col = columnOf(a.id);
    if (col == null) return reset();
    let list = cards[col];
    const overId = parseKey(over.id);
    if (overId.kind === "task" && overId.id !== id && list.includes(overId.id)) {
      list = arrayMove(list, list.indexOf(id), list.indexOf(overId.id));
      setCards({ ...cards, [col]: list });
    }
    const index = list.indexOf(id);
    if (serverCards[col]?.indexOf(id) === index) return reset();

    const column = data.columns.find((c) => c.id === col);
    if (column?.is_done_column && byId.get(id)?.task.status !== "done") {
      reset();
      toast.error(t("board.errors.doneNeedsApproval"));
      return;
    }
    moveTask.mutate({ taskId: id, columnId: col, ...neighbourIds(list, index) });
  }

  const activeNode = active != null && parseKey(active).kind === "task" ? byId.get(parseKey(active).id) : undefined;

  function newColumn(name: string) {
    const last = data.columns.reduce((m, c) => Math.max(m, c.position), 0);
    addColumn.mutate({ name, position: last + 1024 });
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={({ active: a }) => {
        dragging.current = true;
        setActive(a.id);
      }}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDragCancel={() => {
        dragging.current = false;
        setActive(null);
        reset();
      }}
    >
      <TopScrollbar className="flex items-start gap-3 pb-3">
        <SortableContext items={cols.map(colKey)} strategy={horizontalListSortingStrategy}>
          {cols.map((cid) => {
            const column = data.columns.find((c) => c.id === cid);
            return column ? (
              <BoardColumn
                key={cid}
                column={column}
                cardIds={(cards[cid] ?? []).filter((id) => visible.has(id))}
                onOpen={onOpen}
              />
            ) : null;
          })}
        </SortableContext>
        {canManage && (
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            className="flex w-72 shrink-0 items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-2.5 text-sm text-muted-foreground hover:bg-muted/50"
          >
            <Plus className="h-4 w-4" />
            {t("board.column.add")}
          </button>
        )}
      </TopScrollbar>
      <DragOverlay>{activeNode ? <TaskCardBody node={activeNode} /> : null}</DragOverlay>
      <PromptDialog
        open={addOpen}
        onOpenChange={setAddOpen}
        title={t("board.column.namePrompt")}
        onSubmit={newColumn}
      />
    </DndContext>
  );
}
