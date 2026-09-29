import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format } from "date-fns";
import { AlertTriangle, ClipboardList, Pencil, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { ProgressBar } from "./ProgressBar";
import { PresenceDot } from "@/components/presence/PresenceDot";
import { AccessControl } from "@/components/auth/AccessControl";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog } from "@/components/ui/DetailDialog";
import { taskDetailFields } from "./detailFields";
import { detailRowProps } from "@/components/ui/detail-row";
import { useEmployeeAvatarMap } from "@/hooks/useEmployeeAvatars";
import { isEmployeeActive } from "@/hooks/useEmployeePresence";
import type { DailyTaskWithRelations, Project } from "@/lib/types";
import { PROJECT_BADGE_COLORS as projectBadgeColors } from "@/lib/colorPalettes";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";

interface DailyReportTableProps {
  /** Already filtered by the parent's shared search/filter toolbar */
  tasks: DailyTaskWithRelations[];
  /** Used only for stable badge-color assignment per project */
  projects: Project[];
  /** Whether search or a filter is currently narrowing `tasks` */
  hasActiveFilter?: boolean;
  onEdit: (task: DailyTaskWithRelations) => void;
  onDelete: (id: number) => void;
  onBulkDelete: (ids: number[]) => void;
  isLoading?: boolean;
  presenceMap?: Record<number, string>;
}

export function DailyReportTable({
  tasks,
  projects,
  hasActiveFilter,
  onEdit,
  onDelete,
  onBulkDelete,
  isLoading,
  presenceMap = {},
}: DailyReportTableProps) {
  const avatarMap = useEmployeeAvatarMap();
  const { t } = useTranslation();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [viewing, setViewing] = useState<DailyTaskWithRelations | null>(null);

  const grouped: Record<string, DailyTaskWithRelations[]> = {};
  tasks.forEach((task) => {
    if (!grouped[task.date]) grouped[task.date] = [];
    grouped[task.date].push(task);
  });
  const sortedDates = Object.keys(grouped).sort((a, b) => b.localeCompare(a));

  const allSelected =
    tasks.length > 0 && tasks.every((t) => selected.has(t.id));
  function toggleSelectAll() {
    setSelected(allSelected ? new Set() : new Set(tasks.map((t) => t.id)));
  }
  function toggleSelectOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const COLUMNS = [
    t("dailyReport.columns.date"),
    t("dailyReport.columns.employee"),
    t("dailyReport.columns.project"),
    t("dailyReport.columns.taskDescription"),
    t("dailyReport.columns.progress"),
    t("dailyReport.columns.problem"),
  ];

  return (
    <div className="flex flex-col h-full gap-4">
      {selected.size > 0 && (
        <AccessControl feature="daily-report" action="delete">
          <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30 flex-shrink-0">
            <span className="text-xs font-medium text-foreground">
              {t("taskForm.selected", { count: selected.size })}
            </span>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 text-xs"
                onClick={() => setSelected(new Set())}
              >
                {t("common.cancel")}
              </Button>
              <Button
                size="sm"
                variant="destructive"
                className="h-7 text-xs gap-1.5"
                onClick={() => {
                  onBulkDelete(Array.from(selected));
                  setSelected(new Set());
                }}
              >
                <Trash2 className="w-3 h-3" />
                {t("taskForm.deleteSelected")}
              </Button>
            </div>
          </div>
        </AccessControl>
      )}

      {!isLoading && sortedDates.length === 0 && (
        <EmptyState
          icon={ClipboardList}
          title={t("dailyReport.noTasksFound")}
          description={
            hasActiveFilter
              ? t("dailyReport.adjustFilters")
              : t("dailyReport.addFirstEntry")
          }
          className="flex-1 md:hidden"
        />
      )}
      <div
        className={cn(
          "flex-1 overflow-auto scrollbar-thin rounded-xl border border-border bg-card",
          !isLoading && sortedDates.length === 0 && "max-md:hidden",
        )}
      >
        <table className="w-full min-w-[860px] border-collapse">
          <thead className="sticky top-0 z-10">
            <tr className="bg-card border-b border-border">
              <th className="px-4 py-3 w-8">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={toggleSelectAll}
                  disabled={tasks.length === 0}
                />
              </th>
              {COLUMNS.map((col) => (
                <th
                  key={col}
                  className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap"
                >
                  {col}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("dailyReport.columns.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 8 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-secondary animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : sortedDates.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-4">
                  <EmptyState
                    icon={ClipboardList}
                    title={t("dailyReport.noTasksFound")}
                    description={
                      hasActiveFilter
                        ? t("dailyReport.adjustFilters")
                        : t("dailyReport.addFirstEntry")
                    }
                  />
                </td>
              </tr>
            ) : (
              <AnimatePresence>
                {sortedDates.map((date) => (
                  <>
                    <tr key={`group-${date}`} className="bg-secondary/30">
                      <td colSpan={8} className="px-4 py-1.5">
                        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                          {format(new Date(date), "EEEE, dd MMMM yyyy")}
                          <span className="ml-2 text-muted-foreground/50 normal-case tracking-normal">
                            - {grouped[date].length}{" "}
                            {grouped[date].length !== 1
                              ? t("common.task_other")
                              : t("common.task_one")}
                          </span>
                        </span>
                      </td>
                    </tr>

                    {grouped[date].map((task, i) => {
                      const projectIdx = projects.findIndex(
                        (p) => p.id === task.project_id,
                      );
                      const empIdx = task.employee_id;
                      return (
                        <motion.tr
                          key={task.id}
                          initial={{ opacity: 0, x: -8 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 8 }}
                          transition={{ delay: i * 0.04 }}
                          {...detailRowProps(() => setViewing(task))}
                          className="border-b border-border/40 group transition-colors hover:bg-secondary/40 cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
                        >
                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <Checkbox
                              checked={selected.has(task.id)}
                              onCheckedChange={() => toggleSelectOne(task.id)}
                            />
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <span className="text-xs text-muted-foreground tabular-nums">
                              {format(new Date(task.date), "dd MMM")}
                            </span>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <div className="relative flex-shrink-0">
                                <UserAvatar
                                  name={task.employee?.full_name || "?"}
                                  avatarUrl={
                                    avatarMap[task.employee_id]?.avatarUrl
                                  }
                                  colorIndex={empIdx}
                                  size="sm"
                                />
                                <PresenceDot
                                  isActive={isEmployeeActive(
                                    presenceMap[task.employee_id],
                                  )}
                                  className="w-1.5 h-1.5 border"
                                />
                              </div>
                              <div>
                                <p className="text-xs font-medium text-foreground leading-none">
                                  {task.employee?.full_name}
                                </p>
                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-none">
                                  {task.employee?.role_title}
                                </p>
                              </div>
                            </div>
                          </td>

                          <td className="px-4 py-3 whitespace-nowrap">
                            <span
                              className={cn(
                                "inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-mono font-semibold border",
                                projectBadgeColors[
                                  projectIdx % projectBadgeColors.length
                                ],
                              )}
                            >
                              {task.project?.project_code
                                ?.split("-")
                                .slice(0, 2)
                                .join("-")}
                            </span>
                          </td>

                          <td className="px-4 py-3 max-w-[260px]">
                            <p className="text-xs text-foreground/90 line-clamp-2 leading-snug">
                              {task.task_desc}
                            </p>
                          </td>

                          <td className="px-4 py-3 min-w-[130px]">
                            <ProgressBar value={task.progress_pct} size="sm" />
                          </td>

                          <td className="px-4 py-3 max-w-[200px]">
                            {task.problem_desc && task.problem_desc.trim() ? (
                              <div className="flex items-start gap-1.5 px-2 py-1.5 rounded-md bg-amber-50 border border-amber-200 dark:bg-amber-950/50 dark:border-amber-800/30">
                                <AlertTriangle className="w-3 h-3 text-amber-500 flex-shrink-0 mt-0.5" />
                                <p className="text-[10px] text-amber-800/90 dark:text-amber-300/80 leading-snug line-clamp-2">
                                  {task.problem_desc}
                                </p>
                              </div>
                            ) : (
                              <span className="text-[10px] text-muted-foreground/40">
                                -
                              </span>
                            )}
                          </td>

                          <td
                            className="px-4 py-3"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity">
                              <AccessControl
                                feature="daily-report"
                                action="update"
                              >
                                <button
                                  onClick={() => onEdit(task)}
                                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              </AccessControl>
                              <AccessControl
                                feature="daily-report"
                                action="delete"
                              >
                                <button
                                  onClick={() => onDelete(task.id)}
                                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </AccessControl>
                            </div>
                          </td>
                        </motion.tr>
                      );
                    })}
                  </>
                ))}
              </AnimatePresence>
            )}
          </tbody>
        </table>
      </div>

      {tasks.length > 0 && (
        <div className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>
            {tasks.length}{" "}
            {tasks.length !== 1 ? t("common.task_other") : t("common.task_one")}
          </span>
          <span className="w-px h-3 bg-border" />
          <span>
            {t("dailyReport.avgProgress")}:{" "}
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              {Math.round(
                tasks.reduce((s, task) => s + task.progress_pct, 0) /
                  tasks.length,
              )}
              %
            </span>
          </span>
          <span className="w-px h-3 bg-border" />
          <span>
            {t("dailyReport.notes")}:{" "}
            <span className="text-amber-600 dark:text-amber-400 font-semibold">
              {tasks.filter((task) => task.problem_desc?.trim()).length}
            </span>
          </span>
        </div>
      )}

      <DetailDialog
        title={t("common.detail")}
        fields={viewing && taskDetailFields(viewing, t)}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
