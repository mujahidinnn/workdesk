import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { format, parseISO } from "date-fns";
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  MessageSquare,
  ChevronDown,
  Loader2,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { Toolbar, SearchInput } from "@/components/master-hub/MasterSection";
import {
  useProblemsLog,
  useToggleResolved,
  type ProblemsLogFilters,
  type ProblemTask,
} from "@/hooks/useDailyTasks";
import { useEmployees } from "@/hooks/useEmployees";
import { useProjects } from "@/hooks/useProjects";
import { useEmployeeAvatarMap } from "@/hooks/useEmployeeAvatars";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { TaskComments } from "@/components/daily-report/TaskComments";
import { PROJECT_BADGE_COLORS as projectBadgeColors } from "@/lib/colorPalettes";
import { cn } from "@/lib/utils";
import { useDateFnsLocale } from "@/lib/dateLocale";

function ProblemCard({
  task,
  projectIdx,
  onToggle,
  isToggling,
  avatarUrl,
}: {
  task: ProblemTask;
  projectIdx: number;
  onToggle: () => void;
  isToggling: boolean;
  avatarUrl?: string | null;
}) {
  const { t } = useTranslation();
  const empName = task.employee?.full_name || "?";
  const dateLocale = useDateFnsLocale();
  const [showComments, setShowComments] = useState(false);
  const commentCount = task.comments[0]?.count ?? 0;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: task.is_resolved ? 0.45 : 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      transition={{
        layout: { type: "spring", stiffness: 400, damping: 30 },
        duration: 0.2,
      }}
      className={cn(
        "glass-card rounded-xl p-3 sm:p-4 flex gap-3 sm:gap-4 transition-all",
        task.is_resolved && "grayscale-[40%]",
      )}
    >
      <UserAvatar
        name={empName}
        avatarUrl={avatarUrl}
        colorIndex={task.employee_id}
        size="lg"
        className="w-8 h-8 sm:w-9 sm:h-9"
      />

      <div className="flex-1 min-w-0 space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            {task.project && (
              <span
                className={cn(
                  "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border",
                  projectBadgeColors[
                    Math.max(projectIdx, 0) % projectBadgeColors.length
                  ],
                )}
              >
                {task.project.project_code}
              </span>
            )}
            <span className="text-xs font-medium text-foreground">
              {empName}
            </span>
            {task.employee?.role_title && (
              <span className="text-[10px] text-muted-foreground truncate max-w-[160px]">
                · {task.employee.role_title}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground whitespace-nowrap flex-shrink-0">
            {format(parseISO(task.date), "dd MMM yyyy", { locale: dateLocale })}
          </span>
        </div>

        <p className="text-[11px] text-muted-foreground leading-snug line-clamp-1">
          {t("issues.task")}: {task.task_desc}
        </p>

        <div
          className={cn(
            "flex items-start gap-2 px-3 py-2.5 rounded-lg border transition-all",
            task.is_resolved
              ? "bg-secondary/30 border-border/40"
              : "bg-amber-50 border-amber-200 dark:bg-amber-950/30 dark:border-amber-800/30",
          )}
        >
          <AlertTriangle
            className={cn(
              "w-3.5 h-3.5 flex-shrink-0 mt-0.5",
              task.is_resolved ? "text-muted-foreground" : "text-amber-500",
            )}
          />
          <p
            className={cn(
              "text-xs leading-snug",
              task.is_resolved
                ? "text-muted-foreground line-through decoration-muted-foreground/40"
                : "text-amber-800/90 dark:text-amber-300/90",
            )}
          >
            {task.problem_desc}
          </p>
        </div>

        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
            <div className="h-1 w-20 bg-secondary rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-500 rounded-full transition-all"
                style={{ width: `${task.progress_pct}%` }}
              />
            </div>
            <span>{task.progress_pct}%</span>
          </div>

          <button
            onClick={onToggle}
            disabled={isToggling}
            className={cn(
              "flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-[11px] font-medium transition-all",
              task.is_resolved
                ? "text-muted-foreground hover:text-foreground hover:bg-secondary"
                : "text-emerald-700 hover:bg-emerald-100 bg-emerald-50 border border-emerald-300 dark:text-emerald-400 dark:hover:bg-emerald-950/50 dark:bg-emerald-950/30 dark:border-emerald-900/40",
            )}
          >
            {isToggling ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : task.is_resolved ? (
              <Circle className="w-3.5 h-3.5" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5" />
            )}
            {task.is_resolved ? (
              <>
                {t("issues.reopen")}
              </>
            ) : (
              <>
                {t("issues.resolve")}
              </>
            )}
          </button>
        </div>

        <button
          onClick={() => setShowComments((s) => !s)}
          className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors pt-1"
        >
          <MessageSquare className="w-3 h-3" />
          {t("issues.comments", { count: commentCount })}
          <ChevronDown
            className={cn(
              "w-3 h-3 transition-transform",
              showComments && "rotate-180",
            )}
          />
        </button>
        <AnimatePresence>
          {showComments && (
            <motion.div
              // Clip only while animating: once open, the focus ring and @mention dropdown must overflow.
              initial={{ opacity: 0, height: 0, overflow: "hidden" }}
              animate={{
                opacity: 1,
                height: "auto",
                transitionEnd: { overflow: "visible" },
              }}
              exit={{ opacity: 0, height: 0, overflow: "hidden" }}
            >
              <TaskComments taskId={task.id} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

export default function IssuesPage() {
  const { t } = useTranslation();
  const [filters, setFilters] = useState<ProblemsLogFilters>({});
  const { data: problems = [], isLoading } = useProblemsLog(filters);
  const { data: employees = [] } = useEmployees();
  const { data: projects = [] } = useProjects();
  const avatarMap = useEmployeeAvatarMap();
  const toggleResolved = useToggleResolved();

  const [search, setSearch] = useState("");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "resolved">(
    "all",
  );
  const hasServerFilter = Object.values(filters).some(Boolean);

  // Status filters locally: the chips need open and resolved counts loaded together.
  const filtered = problems.filter((task) => {
    const matchSearch =
      !search ||
      task.problem_desc?.toLowerCase().includes(search.toLowerCase()) ||
      task.employee?.full_name.toLowerCase().includes(search.toLowerCase()) ||
      task.project?.project_code.toLowerCase().includes(search.toLowerCase());
    const matchStatus =
      filterStatus === "all" ||
      (filterStatus === "open" && !task.is_resolved) ||
      (filterStatus === "resolved" && task.is_resolved);
    return matchSearch && matchStatus;
  });

  const openCount = problems.filter((t) => !t.is_resolved).length;
  const resolvedCount = problems.filter((t) => t.is_resolved).length;

  const statusChips = [
    {
      label: t("issues.allIssues"),
      count: problems.length,
      filter: "all" as const,
      color: "text-foreground bg-secondary",
    },
    {
      label: t("issues.open"),
      count: openCount,
      filter: "open" as const,
      color:
        "text-amber-700 bg-amber-100 border border-amber-300 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-900/40",
    },
    {
      label: t("issues.resolved"),
      count: resolvedCount,
      filter: "resolved" as const,
      color:
        "text-emerald-700 bg-emerald-100 border border-emerald-300 dark:text-emerald-400 dark:bg-emerald-950/40 dark:border-emerald-900/40",
    },
  ];

  return (
    <div className="flex flex-col gap-5 h-full">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <h2 className="text-lg font-bold text-foreground tracking-tight">
          {t("issues.title")}
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          {t("issues.subtitle")}
        </p>
      </motion.div>

      <div data-tour="issues-chips" className="flex flex-wrap items-center gap-2 sm:gap-3">
        {statusChips.map(({ label, count, filter, color }) => (
          <button
            key={filter}
            onClick={() => setFilterStatus(filter)}
            className={cn(
              "flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-all",
              color,
              filterStatus === filter
                ? "ring-1 ring-border"
                : "opacity-70 hover:opacity-100",
            )}
          >
            {label}
            <span className="font-bold">{count}</span>
          </button>
        ))}
      </div>

      <div data-tour="issues-toolbar">
        <Toolbar>
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("issues.search")}
          />
          <FilterSelect
            value={filters.employeeId}
            onChange={(employeeId) => setFilters((f) => ({ ...f, employeeId }))}
            allLabel={t("dailyReport.allEmployees")}
            options={employees.map((e) => ({
              value: e.id.toString(),
              label: e.full_name,
            }))}
          />
          <FilterSelect
            value={filters.projectId}
            onChange={(projectId) => setFilters((f) => ({ ...f, projectId }))}
            allLabel={t("dailyReport.allProjects")}
            options={projects.map((p) => ({
              value: p.id.toString(),
              label: p.project_code,
            }))}
          />
        </Toolbar>
      </div>

      <div
        data-tour="issues-list"
        className="flex-1 overflow-y-auto scrollbar-thin space-y-3 pb-4"
      >
        {isLoading ? (
          Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 rounded-xl bg-secondary animate-pulse"
            />
          ))
        ) : filtered.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="py-16 text-center"
          >
            <CheckCircle2 className="w-10 h-10 text-emerald-500/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-foreground">
              {problems.length === 0 && !hasServerFilter
                ? t("issues.noIssuesYet")
                : t("issues.noMatchingIssues")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              {problems.length === 0 && !hasServerFilter
                ? t("issues.issuesAppearHere")
                : t("issues.adjustFilters")}
            </p>
          </motion.div>
        ) : (
          <AnimatePresence initial={false}>
            {filtered.map((task) => {
              const projIdx = projects.findIndex(
                (p) => p.id === task.project_id,
              );
              return (
                <ProblemCard
                  key={task.id}
                  task={task}
                  projectIdx={projIdx}
                  avatarUrl={avatarMap[task.employee_id]?.avatarUrl}
                  onToggle={() =>
                    toggleResolved.mutate({
                      id: task.id,
                      is_resolved: !task.is_resolved,
                    })
                  }
                  isToggling={
                    toggleResolved.isPending &&
                    toggleResolved.variables?.id === task.id
                  }
                />
              );
            })}
          </AnimatePresence>
        )}
      </div>
    </div>
  );
}
