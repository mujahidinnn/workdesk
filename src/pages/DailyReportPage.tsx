import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { startOfWeek, endOfWeek, format } from "date-fns";
import { DailyReportTable } from "@/components/daily-report/DailyReportTable";
import { DailyReportKanban } from "@/components/daily-report/DailyReportKanban";
import {
  TaskFormDialog,
  type TaskFormValues,
} from "@/components/daily-report/TaskFormDialog";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { ViewSwitcher, type ViewMode } from "@/components/ViewSwitcher";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { Toolbar, SearchInput } from "@/components/master-hub/MasterSection";
import { AccessControl } from "@/components/auth/AccessControl";
import {
  useDailyTasks,
  useCreateDailyTask,
  useUpdateDailyTask,
  useDeleteDailyTask,
  type DailyTaskFilters,
} from "@/hooks/useDailyTasks";
import { useEmployeePresence } from "@/hooks/useEmployeePresence";
import { useProjects } from "@/hooks/useProjects";
import { useEmployees } from "@/hooks/useEmployees";
import type { DailyTaskWithRelations } from "@/lib/types";
import { DateRangeFilter } from "@/components/master-hub/DateRangeFilter";

// ponytail: computed once per page load; stale if the tab stays open past Sunday.
const now = new Date();
const THIS_WEEK = {
  from: format(startOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
  to: format(endOfWeek(now, { weekStartsOn: 1 }), "yyyy-MM-dd"),
};

export default function DailyReportPage() {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<DailyTaskWithRelations | null>(
    null,
  );
  const [view, setView] = useState<ViewMode>("table");
  const [deleteTargetIds, setDeleteTargetIds] = useState<number[] | null>(null);
  const [search, setSearch] = useState("");
  const { t } = useTranslation();
  const location = useLocation();
  // Deep links from the dashboard: ?employee=<id>&from=<date>&to=<date>
  const [filters, setFilters] = useState<DailyTaskFilters>(() => {
    const p = new URLSearchParams(location.search);
    const deepLinked = p.has("from") || p.has("to");
    return {
      employeeId: p.get("employee") ?? undefined,
      ...(deepLinked
        ? { from: p.get("from") ?? undefined, to: p.get("to") ?? undefined }
        : THIS_WEEK),
    };
  });
  const navigate = useNavigate();

  const { data: tasks = [], isLoading } = useDailyTasks(filters);
  const { data: projects = [] } = useProjects();
  const { data: employees = [] } = useEmployees();
  const { data: presenceMap = {} } = useEmployeePresence();

  useEffect(() => {
    if ((location.state as { openAdd?: boolean } | null)?.openAdd) {
      setDialogOpen(true);
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lifted above the view switcher so search/filter state survives switching views.
  const hasActiveFilter = !!search || Object.values(filters).some(Boolean);
  const setFilter = (patch: Partial<DailyTaskFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));

  // Employee/project/date filters run in the query; free-text stays local.
  const filteredTasks = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return tasks;
    return tasks.filter(
      (task) =>
        task.task_desc.toLowerCase().includes(q) ||
        task.employee?.full_name.toLowerCase().includes(q) ||
        task.project?.project_code.toLowerCase().includes(q),
    );
  }, [tasks, search]);

  const createTask = useCreateDailyTask();
  const updateTask = useUpdateDailyTask();
  const deleteTask = useDeleteDailyTask();

  const handleAdd = () => {
    setEditingTask(null);
    setDialogOpen(true);
  };
  const handleEdit = (task: DailyTaskWithRelations) => {
    setEditingTask(task);
    setDialogOpen(true);
  };
  const handleDelete = (id: number) => setDeleteTargetIds([id]);
  const handleBulkDelete = (ids: number[]) => setDeleteTargetIds(ids);

  const handleDeleteConfirm = async () => {
    if (!deleteTargetIds) return;
    await Promise.all(deleteTargetIds.map((id) => deleteTask.mutateAsync(id)));
    setDeleteTargetIds(null);
  };

  const handleSubmit = (data: TaskFormValues) => {
    const payload = {
      date: data.date,
      employee_id: data.employee_id,
      project_id: data.project_id,
      task_desc: data.task_desc,
      progress_pct: data.progress_pct,
      problem_desc: data.problem_desc || null,
    };
    if (editingTask) {
      updateTask.mutate(
        { id: editingTask.id, ...payload },
        { onSuccess: () => setDialogOpen(false) },
      );
    } else {
      // is_resolved is only flipped later via the Issue Log's resolve toggle.
      createTask.mutate(
        { ...payload, is_resolved: false },
        { onSuccess: () => setDialogOpen(false) },
      );
    }
  };

  return (
    <div className="flex flex-col h-full gap-4">
      <div className="flex items-center justify-between gap-3 flex-wrap flex-shrink-0">
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t("dailyReport.title")}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("dailyReport.taskLogged", { count: tasks.length })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <ViewSwitcher view={view} onChange={setView} />
          <AccessControl feature="daily-report" action="create">
            <Button
              data-tour="daily-report-add"
              size="sm"
              onClick={handleAdd}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 gap-1.5 flex-shrink-0"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("dailyReport.logTask")}
            </Button>
          </AccessControl>
        </div>
      </div>

      <div className="flex-shrink-0">
        <Toolbar>
          <SearchInput
            tour="daily-report-search"
            value={search}
            onChange={setSearch}
            placeholder={t("dailyReport.search")}
          />
          <div
            data-tour="daily-report-filter"
            className="flex items-center gap-2 flex-wrap"
          >
            <FilterSelect
              value={filters.employeeId}
              onChange={(employeeId) => setFilter({ employeeId })}
              allLabel={t("dailyReport.allEmployees")}
              options={employees.map((e) => ({
                value: e.id.toString(),
                label: e.full_name,
              }))}
            />
            <FilterSelect
              value={filters.projectId}
              onChange={(projectId) => setFilter({ projectId })}
              allLabel={t("dailyReport.allProjects")}
              options={projects.map((p) => ({
                value: p.id.toString(),
                label: p.project_code,
              }))}
            />
            <DateRangeFilter
              value={filters}
              onChange={setFilter}
              defaultValue={THIS_WEEK}
            />
          </div>
        </Toolbar>
      </div>

      <div data-tour="daily-report-view" className="flex-1 min-h-0">
        <AnimatePresence mode="wait">
          <motion.div
            key={view}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.15 }}
            className="h-full"
          >
            {view === "table" ? (
              <DailyReportTable
                tasks={filteredTasks}
                projects={projects}
                hasActiveFilter={hasActiveFilter}
                onEdit={handleEdit}
                onDelete={handleDelete}
                onBulkDelete={handleBulkDelete}
                isLoading={isLoading}
                presenceMap={presenceMap}
              />
            ) : (
              <DailyReportKanban
                tasks={filteredTasks}
                hasActiveFilter={hasActiveFilter}
                employees={employees}
                projects={projects}
                presenceMap={presenceMap}
                onEdit={handleEdit}
                onDelete={handleDelete}
                isLoading={isLoading}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>

      <TaskFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        task={editingTask}
        employees={employees}
        projects={projects}
        onSubmit={handleSubmit}
        loading={createTask.isPending || updateTask.isPending}
      />

      <DeleteConfirmationModal
        open={deleteTargetIds !== null}
        onOpenChange={(v) => {
          if (!v) setDeleteTargetIds(null);
        }}
        title={
          (deleteTargetIds?.length ?? 0) > 1
            ? t("taskForm.deleteBulkTitle")
            : t("taskForm.deleteTitle")
        }
        description={
          (deleteTargetIds?.length ?? 0) > 1
            ? t("taskForm.deleteBulkDesc", { count: deleteTargetIds!.length })
            : t("taskForm.deleteDesc")
        }
        onConfirm={handleDeleteConfirm}
        isPending={deleteTask.isPending}
      />
    </div>
  );
}
