import { Fragment } from "react";
import { format, parseISO } from "date-fns";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { computeProgress, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { AvatarStack } from "./AvatarStack";
import { STATUS_STYLE } from "./taskStyles";

function Rows({ node, depth, onOpen }: { node: TaskNode; depth: number; onOpen: (taskNo: number) => void }) {
  const { t } = useTranslation();
  const { divisions, data } = useBoardCtx();
  const task = node.task;
  const progress = computeProgress(node);
  return (
    <Fragment>
      <tr
        className="border-b border-border hover:bg-muted/40 cursor-pointer focus-visible:bg-muted/40 outline-none"
        tabIndex={0}
        onClick={() => onOpen(task.task_no)}
        onKeyDown={(e) => e.key === "Enter" && onOpen(task.task_no)}
      >
        <td className="px-3 py-2 text-sm" style={{ paddingLeft: 12 + depth * 18 }}>
          <span className="mr-1.5 font-mono text-[11px] text-muted-foreground">#{task.task_no}</span>
          {task.title}
        </td>
        <td className="px-3 py-2 text-xs text-muted-foreground">
          {depth === 0 ? data.columns.find((c) => c.id === task.column_id)?.name : ""}
        </td>
        <td className="px-3 py-2 text-xs">{divisions.find((d) => d.id === task.division_id)?.name}</td>
        <td className="px-3 py-2"><AvatarStack userIds={task.assignees.map((a) => a.user_id)} /></td>
        <td className="px-3 py-2">
          <span className={cn("rounded px-1.5 py-0.5 text-[11px]", STATUS_STYLE[task.status])}>{t(`board.status.${task.status}`)}</span>
        </td>
        <td className="px-3 py-2 text-xs tabular-nums">{progress.total ? `${progress.pct}%` : ""}</td>
        <td className="px-3 py-2 text-xs">{task.due_date ? format(parseISO(task.due_date), "d MMM yyyy") : ""}</td>
      </tr>
      {node.children.map((c) => <Rows key={c.task.id} node={c} depth={depth + 1} onOpen={onOpen} />)}
    </Fragment>
  );
}

export function BoardListView({ visible, onOpen }: { visible: Set<number>; onOpen: (taskNo: number) => void }) {
  const { t } = useTranslation();
  const { roots, data } = useBoardCtx();
  const colOrder = new Map(data.columns.map((c, i) => [c.id, i]));
  const shown = roots
    .filter((r) => visible.has(r.task.id))
    .sort((a, b) => (colOrder.get(a.task.column_id!) ?? 0) - (colOrder.get(b.task.column_id!) ?? 0) || a.task.position - b.task.position);
  return (
    <div className="overflow-x-auto rounded-xl border border-border bg-card">
      <table className="w-full min-w-[760px]">
        <thead>
          <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-muted-foreground">
            {["task", "column", "division", "assignees", "status", "progress", "due"].map((h) => (
              <th key={h} className="px-3 py-2 font-medium">{t(`board.list.${h}`)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shown.map((r) => <Rows key={r.task.id} node={r} depth={0} onOpen={onOpen} />)}
        </tbody>
      </table>
    </div>
  );
}
