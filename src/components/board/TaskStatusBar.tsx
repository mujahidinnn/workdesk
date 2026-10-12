import { useState } from "react";
import { Check, Play, Send, Undo2, Undo, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useSubmitReview, useUpdateTask, useWithdrawReview } from "@/hooks/useBoardTasks";
import { canReviewTask, isBoardPic, submitBlocker } from "@/lib/taskPermissions";
import { isSentBack, lineageAssigneeIds, type TaskNode } from "@/lib/taskTree";
import { useBoardCtx } from "./BoardContext";
import { ReviewDialog } from "./ReviewDialog";
import { STATUS_STYLE } from "./taskStyles";

export function TaskStatusBar({ node }: { node: TaskNode }) {
  const { t } = useTranslation();
  const { boardId, byId, access, canWork } = useBoardCtx();
  const update = useUpdateTask(boardId);
  const submit = useSubmitReview(boardId);
  const withdraw = useWithdrawReview(boardId);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const task = node.task;
  const blocker = submitBlocker(access, node, lineageAssigneeIds(byId, task.id));
  const open = task.status === "todo" || task.status === "in_progress";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={cn("rounded px-2 py-1 text-xs font-medium", STATUS_STYLE[task.status])}>
        {t(`board.status.${task.status}`)}
      </span>
      {isSentBack(task) && (
        <span className="rounded bg-red-500/15 px-2 py-1 text-xs text-red-600 dark:text-red-400">{t("board.sentBack")}</span>
      )}
      {open && canWork(task.id) && (
        <Button
          size="sm"
          variant="outline"
          onClick={() => update.mutate({ id: task.id, status: task.status === "todo" ? "in_progress" : "todo" })}
        >
          {task.status === "todo" ? <Play className="mr-1 h-3.5 w-3.5" /> : <Undo2 className="mr-1 h-3.5 w-3.5" />}
          {task.status === "todo" ? t("board.actions.start") : t("board.actions.backToTodo")}
        </Button>
      )}
      {open && blocker !== "not_assignee" && (
        <Button
          size="sm"
          disabled={blocker != null}
          loading={submit.isPending}
          onClick={() => submit.mutate(task.id)}
          title={blocker ? t(`board.blockers.${blocker}`) : undefined}
        >
          <Send className="mr-1 h-3.5 w-3.5" />
          {t("board.actions.submit")}
        </Button>
      )}
      {open && blocker && blocker !== "not_assignee" && (
        <span className="basis-full text-xs text-muted-foreground">{t(`board.blockers.${blocker}`)}</span>
      )}
      {task.status === "in_review" &&
        (task.submitted_by === access.userId || lineageAssigneeIds(byId, task.id).has(access.userId) || isBoardPic(access)) && (
          <Button size="sm" variant="outline" loading={withdraw.isPending} onClick={() => withdraw.mutate(task.id)}>
            <Undo className="mr-1 h-3.5 w-3.5" />
            {t("board.actions.withdraw")}
          </Button>
        )}
      {canReviewTask(access, task) && (
        <>
          <Button size="sm" onClick={() => setDecision("approved")}>
            <Check className="mr-1 h-3.5 w-3.5" />
            {t("board.review.approve")}
          </Button>
          <Button size="sm" variant="destructive" onClick={() => setDecision("rejected")}>
            <X className="mr-1 h-3.5 w-3.5" />
            {t("board.review.reject")}
          </Button>
        </>
      )}
      <ReviewDialog taskId={task.id} decision={decision} onClose={() => setDecision(null)} />
    </div>
  );
}
