import { format, parseISO } from "date-fns";
import { NotebookPen, Plus } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/context/auth";
import { useDailyTasksForBoardTask } from "@/hooks/useDailyTasks";
import { useBoardCtx } from "./BoardContext";

export function TaskDailyLogs({ taskId }: { taskId: number }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { profile, canCreate } = useAuth();
  const { data } = useBoardCtx();
  const { data: logs = [] } = useDailyTasksForBoardTask(taskId);

  function logProgress() {
    navigate("/daily-report", {
      state: {
        openAdd: true,
        prefill: {
          board_task_id: taskId,
          project_id: data.board.project_id,
          ...(profile?.employee_id ? { employee_id: profile.employee_id } : {}),
        },
      },
    });
  }

  return (
    <section className="space-y-2 rounded-lg border border-dashed border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <NotebookPen className="h-4 w-4" />
          {t("board.dailyLogs.title")}
          <span className="text-xs font-normal text-muted-foreground">{logs.length}</span>
        </h3>
        {canCreate("daily-report") && (
          <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" onClick={logProgress}>
            <Plus className="h-3.5 w-3.5" />
            {t("board.dailyLogs.log")}
          </Button>
        )}
      </div>
      {logs.length === 0 ? (
        <p className="text-xs text-muted-foreground">{t("board.dailyLogs.empty")}</p>
      ) : (
        <ul className="space-y-1.5">
          {logs.map((l) => (
            <li key={l.id} className="rounded-md bg-muted/50 px-2 py-1.5 text-xs">
              <span className="font-medium">{l.employee?.full_name}</span>
              <span className="ml-2 text-muted-foreground">
                {format(parseISO(l.date), "d MMM yyyy")} · {l.progress_pct}%
              </span>
              <p className="mt-0.5 text-foreground/90">{l.task_desc}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
