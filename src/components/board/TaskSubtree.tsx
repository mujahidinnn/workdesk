import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { ChevronRight, GitBranch, GripVertical, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { useAssign, useCreateTask, useReparentTask, useUnassign } from "@/hooks/useBoardTasks";
import { canUnassign } from "@/lib/taskPermissions";
import { neighbourIds } from "@/lib/position";
import { computeProgress, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";
import { PeoplePicker } from "./PeoplePicker";
import { STATUS_STYLE } from "./taskStyles";

function SubtaskRow({ node, depth, onOpen, sortable }: { node: TaskNode; depth: number; onOpen: (taskNo: number) => void; sortable: boolean }) {
  const { t } = useTranslation();
  const { boardId, divisions, access, canWork } = useBoardCtx();
  const assign = useAssign(boardId);
  const unassign = useUnassign(boardId);
  const [expanded, setExpanded] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({
    id: node.task.id,
    disabled: !sortable || !canWork(node.task.id) || (node.task.parent_id != null && !canWork(node.task.parent_id)),
  });
  const task = node.task;
  const progress = computeProgress(node);
  const division = divisions.find((d) => d.id === task.division_id);

  return (
    <div ref={sortable ? setNodeRef : undefined} style={sortable ? { transform: CSS.Transform.toString(transform), transition } : undefined}>
      <div className="group flex items-center gap-1.5 rounded-md py-1 pr-1 hover:bg-muted/50" style={{ paddingLeft: depth * 16 }}>
        {sortable && canWork(task.id) && (task.parent_id == null || canWork(task.parent_id)) ? (
          <button type="button" className="cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" aria-label={t("board.subtasks.reorder")} {...attributes} {...listeners}>
            <GripVertical className="h-3.5 w-3.5" />
          </button>
        ) : (
          <span className="w-3.5" />
        )}
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className={cn("text-muted-foreground", node.children.length === 0 && "invisible")}
          aria-label={t("board.subtasks.expand")}
        >
          <ChevronRight className={cn("h-3.5 w-3.5 transition-transform", expanded && "rotate-90")} />
        </button>
        <button type="button" onClick={() => onOpen(task.task_no)} className="min-w-0 flex-1 truncate text-left text-sm hover:underline">
          <span className="mr-1 font-mono text-[11px] text-muted-foreground">#{task.task_no}</span>
          {task.title}
        </button>
        {division && (
          <span className="rounded px-1.5 text-[10px] text-white" style={{ background: division.color ?? "#64748b" }}>{division.name}</span>
        )}
        {progress.total > 0 && <span className="text-[11px] tabular-nums text-muted-foreground">{progress.done}/{progress.total}</span>}
        <span className={cn("rounded px-1.5 text-[10px]", STATUS_STYLE[task.status])}>{t(`board.status.${task.status}`)}</span>
        {canWork(task.id) ? (
          <PeoplePicker
            selected={task.assignees.map((a) => a.user_id)}
            isLocked={(uid) => !canUnassign(access, task.assignees.find((a) => a.user_id === uid)?.assigned_by ?? null)}
            onToggle={(userId, on) => (on ? assign : unassign).mutate({ taskId: task.id, userId })}
            trigger={
              <button
                type="button"
                className="flex min-h-6 items-center gap-1 rounded px-1 hover:bg-muted"
                aria-label={t("board.subtasks.assign")}
                title={t("board.subtasks.assign")}
              >
                {task.assignees.length > 0 ? (
                  <AvatarStack userIds={task.assignees.map((a) => a.user_id)} max={3} />
                ) : (
                  <UserPlus className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </button>
            }
          />
        ) : (
          <AvatarStack userIds={task.assignees.map((a) => a.user_id)} max={3} />
        )}
      </div>
      {expanded && node.children.map((c) => <SubtaskRow key={c.task.id} node={c} depth={depth + 1} onOpen={onOpen} sortable={false} />)}
    </div>
  );
}

export function TaskSubtree({ node, onOpen }: { node: TaskNode; onOpen: (taskNo: number) => void }) {
  const { t } = useTranslation();
  const { boardId, canWork } = useBoardCtx();
  const create = useCreateTask(boardId);
  const reparent = useReparentTask(boardId);
  const [order, setOrder] = useState<number[] | null>(null);
  const ids = order ?? node.children.map((c) => c.task.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)));
    setOrder(next);
    reparent.mutate(
      { taskId: Number(active.id), parentId: node.task.id, ...neighbourIds(next, next.indexOf(Number(active.id))) },
      { onSettled: () => setOrder(null) },
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <GitBranch className="h-4 w-4" />
        {t("board.subtasks.title")}
        <span className="text-xs font-normal text-muted-foreground">{node.children.length}</span>
      </h3>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const child = node.children.find((c) => c.task.id === id);
            return child ? <SubtaskRow key={id} node={child} depth={0} onOpen={onOpen} sortable /> : null;
          })}
        </SortableContext>
      </DndContext>
      {canWork(node.task.id) && (
        <Input
          placeholder={t("board.subtasks.addPlaceholder")}
          className="h-8 text-sm"
          onKeyDown={(e) => {
            const title = e.currentTarget.value.trim();
            if (e.key !== "Enter" || !title) return;
            const last = node.children.reduce((m, c) => Math.max(m, c.task.position), 0);
            create.mutate({ title, parent_id: node.task.id, position: last + 1024, division_id: node.task.division_id });
            e.currentTarget.value = "";
          }}
        />
      )}
    </section>
  );
}
