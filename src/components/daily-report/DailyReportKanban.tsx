import { motion } from "framer-motion";
import { AlertTriangle, ClipboardList, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import type { DailyTaskWithRelations, Employee, Project } from "@/lib/types";
import { PresenceDot } from "@/components/presence/PresenceDot";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { useEmployeeAvatarMap } from "@/hooks/useEmployeeAvatars";
import { isEmployeeActive } from "@/hooks/useEmployeePresence";
import { PROJECT_BADGE_COLORS as columnBadgeColors } from "@/lib/colorPalettes";
import { cn } from "@/lib/utils";

interface TaskCardProps {
  task: DailyTaskWithRelations;
  employees: Employee[];
  cardIndex: number;
  presenceMap: Record<number, string>;
  avatarMap: Record<number, { avatarUrl: string | null }>;
  onEdit: (t: DailyTaskWithRelations) => void;
  onDelete: (id: number) => void;
}

function TaskCard({
  task,
  employees,
  cardIndex,
  presenceMap,
  avatarMap,
  onEdit,
  onDelete,
}: TaskCardProps) {
  const empIdx = employees.findIndex((e) => e.id === task.employee_id);
  const active = isEmployeeActive(presenceMap[task.employee_id]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{
        delay: cardIndex * 0.04,
        layout: { type: "spring", stiffness: 400, damping: 30 },
      }}
      className="group glass-card rounded-xl p-3 flex flex-col gap-2 border border-border/40 hover:border-border transition-all"
    >
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground tabular-nums">
          {format(new Date(task.date), "dd MMM yyyy")}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          <button
            onClick={() => onEdit(task)}
            className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <Pencil className="w-3 h-3" />
          </button>
          <button
            onClick={() => onDelete(task.id)}
            className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      <p className="text-xs text-foreground/90 leading-snug line-clamp-2">
        {task.task_desc}
      </p>

      <div className="space-y-1">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-muted-foreground">Progress</span>
          <span className="text-[9px] font-semibold text-foreground">
            {task.progress_pct}%
          </span>
        </div>
        <div className="h-1 bg-secondary rounded-full overflow-hidden">
          <motion.div
            className={cn(
              "h-full rounded-full",
              task.progress_pct === 100
                ? "bg-emerald-500"
                : task.progress_pct >= 70
                  ? "bg-blue-500"
                  : "bg-amber-500",
            )}
            initial={{ width: 0 }}
            animate={{ width: `${task.progress_pct}%` }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          />
        </div>
      </div>

      {task.problem_desc && task.problem_desc.trim() && (
        <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/30">
          <AlertTriangle className="w-2.5 h-2.5 text-amber-500 flex-shrink-0 mt-0.5" />
          <p className="text-[9px] text-amber-800/90 dark:text-amber-300/80 leading-snug line-clamp-2">
            {task.problem_desc}
          </p>
        </div>
      )}

      <div className="flex items-center gap-2 pt-0.5 border-t border-border/40">
        <div className="relative flex-shrink-0">
          <UserAvatar
            name={task.employee?.full_name ?? "?"}
            avatarUrl={avatarMap[task.employee_id]?.avatarUrl}
            colorIndex={Math.max(0, empIdx)}
            size="xs"
          />
          <PresenceDot isActive={active} className="w-1.5 h-1.5 border" />
        </div>
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-foreground truncate leading-none">
            {task.employee?.full_name}
          </p>
          {task.employee?.role_title && (
            <p className="text-[9px] text-muted-foreground truncate leading-none mt-0.5">
              {task.employee.role_title}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

interface DailyReportKanbanProps {
  /** Already filtered by the parent toolbar. */
  tasks: DailyTaskWithRelations[];
  /** Whether search or a filter is currently narrowing `tasks` */
  hasActiveFilter?: boolean;
  employees: Employee[];
  projects: Project[];
  presenceMap: Record<number, string>;
  onEdit: (t: DailyTaskWithRelations) => void;
  onDelete: (id: number) => void;
  isLoading?: boolean;
}

export function DailyReportKanban({
  tasks,
  hasActiveFilter,
  employees,
  projects,
  presenceMap,
  onEdit,
  onDelete,
  isLoading,
}: DailyReportKanbanProps) {
  const avatarMap = useEmployeeAvatarMap();
  const { t } = useTranslation();

  const grouped: Record<number, DailyTaskWithRelations[]> = {};
  tasks.forEach((t) => {
    if (!grouped[t.project_id]) grouped[t.project_id] = [];
    grouped[t.project_id].push(t);
  });

  const columns = Object.entries(grouped)
    .map(([projectId, colTasks]) => ({
      project: projects.find((p) => p.id === Number(projectId)),
      projectId: Number(projectId),
      tasks: colTasks.sort((a, b) => b.date.localeCompare(a.date)),
    }))
    .sort((a, b) => b.tasks.length - a.tasks.length);

  if (isLoading) {
    return (
      <div className="flex gap-3 overflow-x-auto pb-2 scrollbar-thin">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-64 flex-shrink-0 space-y-2">
            <div className="h-6 rounded-lg bg-secondary animate-pulse" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div
                key={j}
                className="h-28 rounded-xl bg-secondary animate-pulse"
              />
            ))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between flex-shrink-0">
        <p className="text-xs text-muted-foreground">
          {tasks.length} task{tasks.length !== 1 ? "s" : ""} across{" "}
          {columns.length} project{columns.length !== 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex gap-3 overflow-x-auto pb-3 scrollbar-thin flex-1">
        {columns.length === 0 ? (
          <div className="flex-1 flex items-center justify-center">
            <EmptyState
              icon={ClipboardList}
              title={t("dailyReport.noTasksFound")}
              description={
                hasActiveFilter
                  ? t("dailyReport.adjustFilters")
                  : t("dailyReport.addFirstEntry")
              }
            />
          </div>
        ) : (
          columns.map(({ project, projectId, tasks: colTasks }, colIdx) => {
            const avgProgress =
              colTasks.length > 0
                ? Math.round(
                    colTasks.reduce((s, t) => s + t.progress_pct, 0) /
                      colTasks.length,
                  )
                : 0;
            const code = project?.project_code ?? `Project #${projectId}`;

            return (
              <div
                key={projectId}
                className="flex-shrink-0 w-64 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-secondary border border-border/60">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className={cn(
                        "text-[9px] font-mono font-bold px-1.5 py-0.5 rounded border flex-shrink-0",
                        columnBadgeColors[colIdx % columnBadgeColors.length],
                      )}
                    >
                      {code.split("-").slice(0, 2).join("-")}
                    </span>
                    <span className="text-[10px] font-medium text-foreground truncate">
                      {project?.project_name ?? "Unknown"}
                    </span>
                  </div>
                  <span className="text-[10px] font-bold text-muted-foreground bg-card px-1.5 py-0.5 rounded border border-border flex-shrink-0 ml-1">
                    {colTasks.length}
                  </span>
                </div>

                <div className="px-3 space-y-0.5">
                  <div className="h-0.5 bg-secondary rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        avgProgress === 100 ? "bg-emerald-500" : "bg-primary",
                      )}
                      style={{ width: `${avgProgress}%` }}
                    />
                  </div>
                  <p className="text-[9px] text-muted-foreground text-right">
                    {avgProgress}% avg
                  </p>
                </div>

                <div className="flex flex-col gap-2 overflow-y-auto scrollbar-thin max-h-[calc(100vh-280px)]">
                  {colTasks.map((task, cardIdx) => (
                    <TaskCard
                      key={task.id}
                      task={task}
                      employees={employees}
                      cardIndex={cardIdx}
                      presenceMap={presenceMap}
                      avatarMap={avatarMap}
                      onEdit={onEdit}
                      onDelete={onDelete}
                    />
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
