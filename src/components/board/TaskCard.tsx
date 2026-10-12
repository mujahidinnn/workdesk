import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { CalendarClock, CheckSquare, GitBranch, ListChecks, RotateCcw } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { cn } from "@/lib/utils";
import { computeProgress, countDescendants, isSentBack, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";
import { STATUS_STYLE } from "./taskStyles";
import { cardKey } from "./dndKeys";

export function TaskCardBody({ node }: { node: TaskNode }) {
  const { t } = useTranslation();
  const { data, divisions, access } = useBoardCtx();
  const task = node.task;
  const progress = computeProgress(node);
  const subtasks = countDescendants(node);
  const division = divisions.find((d) => d.id === task.division_id);
  const labels = data.labels.filter((l) => task.labels.some((x) => x.label_id === l.id));
  const today = format(new Date(), "yyyy-MM-dd");
  const overdue = task.status !== "done" && !!task.due_date && task.due_date < today;
  const mySteps = task.steps.filter((s) => !s.is_done && s.assignee_id === access.userId).length;

  return (
    <div
      className="w-full text-left rounded-lg border border-border bg-card p-2.5 shadow-sm hover:border-primary/40 space-y-2"
    >
      {labels.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {labels.map((l) => (
            <span key={l.id} className="h-1.5 w-8 rounded-full" style={{ background: l.color }} title={l.name} />
          ))}
        </div>
      )}
      <p className="text-[13px] leading-snug text-foreground">
        <span className="mr-1 font-mono text-[11px] text-muted-foreground">#{task.task_no}</span>
        {task.title}
      </p>
      <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
        {division && (
          <span className="rounded px-1.5 py-0.5 text-white" style={{ background: division.color ?? "#64748b" }}>
            {division.name}
          </span>
        )}
        {task.status !== "todo" && (
          <span className={cn("rounded px-1.5 py-0.5", STATUS_STYLE[task.status])}>
            {t(`board.status.${task.status}`)}
          </span>
        )}
        {isSentBack(task) && (
          <span className="inline-flex items-center gap-1 rounded bg-red-500/15 px-1.5 py-0.5 text-red-600 dark:text-red-400">
            <RotateCcw className="h-3 w-3" />
            {t("board.sentBack")}
          </span>
        )}
        {task.due_date && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
              task.status === "done"
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : overdue
                  ? "bg-red-500/15 text-red-600 dark:text-red-400"
                  : "bg-muted text-muted-foreground",
            )}
          >
            <CalendarClock className="h-3 w-3" />
            {format(parseISO(task.due_date), "d MMM")}
          </span>
        )}
        {progress.total > 0 && (
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5",
              progress.done === progress.total
                ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                : "bg-muted text-muted-foreground",
            )}
          >
            <CheckSquare className="h-3 w-3" />
            {progress.done}/{progress.total}
          </span>
        )}
        {mySteps > 0 && (
          <span
            className="inline-flex items-center gap-1 rounded bg-primary/15 px-1.5 py-0.5 text-primary"
            title={t("board.card.myStepsHint", { count: mySteps })}
          >
            <ListChecks className="h-3 w-3" />
            {t("board.card.mySteps", { count: mySteps })}
          </span>
        )}
        {subtasks > 0 && (
          <span className="inline-flex items-center gap-1 text-muted-foreground">
            <GitBranch className="h-3 w-3" />
            {subtasks}
          </span>
        )}
      </div>
      {task.assignees.length > 0 && (
        <div className="flex justify-end">
          <AvatarStack userIds={task.assignees.map((a) => a.user_id)} />
        </div>
      )}
    </div>
  );
}

export function SortableTaskCard({ node, onOpen }: { node: TaskNode; onOpen: () => void }) {
  const { canWork } = useBoardCtx();
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardKey(node.task.id),
    disabled: !canWork(node.task.id),
  });
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn("rounded-lg cursor-pointer focus-visible:ring-2 focus-visible:ring-ring outline-none", isDragging && "opacity-40")}
      {...attributes}
      {...listeners}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen();
        else listeners?.onKeyDown?.(e);
      }}
    >
      <TaskCardBody node={node} />
    </div>
  );
}
