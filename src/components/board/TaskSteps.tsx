import { useState } from "react";
import { DndContext, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { SortableContext, arrayMove, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { GripVertical, ListChecks, Trash2, UserPlus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { useTaskSteps, useTaskStepWrites } from "@/hooks/useTaskSteps";
import { neighbourIds } from "@/lib/position";
import { canTickStep } from "@/lib/taskPermissions";
import { lineageAssigneeIds } from "@/lib/taskTree";
import { cn } from "@/lib/utils";
import type { TaskStep } from "@/lib/types";
import { useBoardCtx } from "./BoardContext";
import { EditableText } from "./EditableText";
import { AvatarStack } from "./AvatarStack";
import { PeoplePicker } from "./PeoplePicker";

function StepRow({
  step,
  canWork,
  canTick,
  writes,
}: {
  step: TaskStep;
  canWork: boolean;
  canTick: boolean;
  writes: ReturnType<typeof useTaskStepWrites>;
}) {
  const { t } = useTranslation();
  const { people } = useBoardCtx();
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: step.id, disabled: !canWork });
  const doneBy = step.done_by ? people.get(step.done_by)?.profile?.full_name : null;
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className="group flex items-start gap-2 rounded-md py-1 hover:bg-muted/50">
      {canWork && (
        <button type="button" className="mt-1.5 cursor-grab text-muted-foreground opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" aria-label={t("board.steps.reorder")} {...attributes} {...listeners}>
          <GripVertical className="h-3.5 w-3.5" />
        </button>
      )}
      <Checkbox
        className="mt-2"
        checked={step.is_done}
        disabled={!canTick}
        onCheckedChange={(v) => writes.update.mutate({ id: step.id, is_done: v === true })}
        aria-label={step.title}
      />
      <div className="min-w-0 flex-1">
        <EditableText
          value={step.title}
          multiline={false}
          disabled={!canWork}
          placeholder={t("board.steps.titlePlaceholder")}
          onSave={(v) => v && writes.update.mutate({ id: step.id, title: v })}
          className={step.is_done ? "line-through text-muted-foreground" : undefined}
        />
        <EditableText
          value={step.note}
          disabled={!canWork}
          placeholder={canWork ? t("board.steps.notePlaceholder") : ""}
          onSave={(v) => writes.update.mutate({ id: step.id, note: v })}
          className="text-xs text-muted-foreground"
        />
        {step.is_done && step.done_at && (
          <p className="px-2 text-[11px] text-emerald-600 dark:text-emerald-400">
            {t("board.steps.doneBy", { name: doneBy ?? "?", at: format(parseISO(step.done_at), "d MMM yyyy HH:mm") })}
          </p>
        )}
      </div>
      <div className="mt-1 flex shrink-0 items-center gap-1">
        {step.assignee_id && <AvatarStack userIds={[step.assignee_id]} />}
        {canWork && (
          <PeoplePicker
            selected={step.assignee_id ? [step.assignee_id] : []}
            onToggle={(userId, on) => writes.update.mutate({ id: step.id, assignee_id: on ? userId : null })}
            trigger={
              <button
                type="button"
                className={cn(
                  "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground",
                  !step.assignee_id && "opacity-0 group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100",
                )}
                aria-label={t("board.steps.assign")}
                title={t("board.steps.assign")}
              >
                <UserPlus className="h-3.5 w-3.5" />
              </button>
            }
          />
        )}
      </div>
      {canWork && (
        <button type="button" onClick={() => writes.remove.mutate(step.id)} className="mt-1.5 text-muted-foreground opacity-0 hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 [@media(hover:none)]:opacity-100" aria-label={t("board.steps.delete")}>
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}

export function TaskSteps({ taskId }: { taskId: number }) {
  const { t } = useTranslation();
  const { boardId, byId, access, canWork: canWorkTask } = useBoardCtx();
  const canWork = canWorkTask(taskId);
  const lineageIds = lineageAssigneeIds(byId, taskId);
  const { data: steps = [] } = useTaskSteps(taskId);
  const writes = useTaskStepWrites(boardId, taskId);
  const [order, setOrder] = useState<number[] | null>(null);
  const ids = order ?? steps.map((s) => s.id);
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const done = steps.filter((s) => s.is_done).length;

  function onDragEnd({ active, over }: DragEndEvent) {
    if (!over || active.id === over.id) return;
    const next = arrayMove(ids, ids.indexOf(Number(active.id)), ids.indexOf(Number(over.id)));
    setOrder(next);
    writes.move.mutate(
      { stepId: Number(active.id), ...neighbourIds(next, next.indexOf(Number(active.id))) },
      { onSettled: () => setOrder(null) },
    );
  }

  return (
    <section className="space-y-2">
      <h3 className="flex items-center gap-2 text-sm font-semibold">
        <ListChecks className="h-4 w-4" />
        {t("board.steps.title")}
        <span className="text-xs font-normal text-muted-foreground">{done}/{steps.length}</span>
      </h3>
      {steps.length > 0 && <Progress value={(done / steps.length) * 100} className="h-1.5" />}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
        <SortableContext items={ids} strategy={verticalListSortingStrategy}>
          {ids.map((id) => {
            const step = steps.find((s) => s.id === id);
            return step ? (
              <StepRow key={id} step={step} canWork={canWork} canTick={canTickStep(access, step, lineageIds)} writes={writes} />
            ) : null;
          })}
        </SortableContext>
      </DndContext>
      {canWork && (
        <Input
          placeholder={t("board.steps.addPlaceholder")}
          className="h-8 text-sm"
          onKeyDown={(e) => {
            const title = e.currentTarget.value.trim();
            if (e.key !== "Enter" || !title) return;
            const last = steps.reduce((m, s) => Math.max(m, s.position), 0);
            writes.add.mutate({ title, position: last + 1024 });
            e.currentTarget.value = "";
          }}
        />
      )}
    </section>
  );
}
