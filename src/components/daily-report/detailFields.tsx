import { format } from "date-fns";
import type { DetailField } from "@/components/ui/DetailDialog";
import type { DailyTaskWithRelations } from "@/lib/types";
import { ProgressBar } from "./ProgressBar";

export function taskDetailFields(
  task: DailyTaskWithRelations,
  t: (k: string) => string,
): DetailField[] {
  return [
    {
      label: t("dailyReport.columns.date"),
      value: format(new Date(task.date), "dd MMM yyyy"),
    },
    {
      label: t("dailyReport.columns.employee"),
      value: [task.employee?.full_name, task.employee?.role_title]
        .filter(Boolean)
        .join(" - "),
    },
    {
      label: t("dailyReport.columns.project"),
      value:
        task.project &&
        `${task.project.project_code} - ${task.project.project_name}`,
    },
    {
      label: t("dailyReport.columns.progress"),
      value: <ProgressBar value={task.progress_pct} size="sm" />,
    },
    {
      label: t("dailyReport.columns.taskDescription"),
      value: task.task_desc,
      block: true,
    },
    {
      label: t("dailyReport.columns.problem"),
      value: task.problem_desc?.trim(),
      block: true,
    },
  ];
}
