import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  differenceInDays,
  differenceInCalendarDays,
  addDays,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachMonthOfInterval,
  eachWeekOfInterval,
  format,
  parseISO,
  isSameMonth,
  isSameWeek,
} from "date-fns";
import { AlertTriangle, CalendarDays, Minus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjects } from "@/hooks/useProjects";
import { useTasksPerProject, type ProjectTaskStats } from "@/hooks/useDailyTasks";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PROJECT_BADGE_COLORS as codeBadgeColors } from "@/lib/colorPalettes";
import { CLOSED_PROJECT_STATUSES, type Project } from "@/lib/types";
import { cn } from "@/lib/utils";

type PriorityFilter = "all" | "High" | "Medium" | "Low";

const WEEK = { weekStartsOn: 1 } as const;
const LABEL_WIDTH = 256;
const WEEK_COL_PX = 56;

const isClosed = (p: Project) =>
  CLOSED_PROJECT_STATUSES.includes(p.work_status?.status_name ?? "");

function daysLate(p: Project) {
  if (!p.end_date || isClosed(p)) return 0;
  return Math.max(0, differenceInCalendarDays(new Date(), parseISO(p.end_date)));
}

const priorityConfig = {
  High: {
    gradient: "linear-gradient(90deg, hsl(356 80% 52%), hsl(330 80% 50%))",
    text: "text-rose-600 dark:text-rose-400",
    dot: "bg-rose-500 dark:bg-rose-400",
  },
  Medium: {
    gradient: "linear-gradient(90deg, hsl(217 91% 55%), hsl(239 84% 62%))",
    text: "text-blue-600 dark:text-blue-400",
    dot: "bg-blue-500 dark:bg-blue-400",
  },
  Low: {
    gradient: "linear-gradient(90deg, hsl(240 4% 40%),  hsl(240 4% 50%))",
    text: "text-zinc-600 dark:text-zinc-400",
    dot: "bg-zinc-500 dark:bg-zinc-400",
  },
};

function ViewToggle({
  view,
  onChange,
  monthLabel,
  weekLabel,
}: {
  view: "month" | "week";
  onChange: (v: "month" | "week") => void;
  monthLabel: string;
  weekLabel: string;
}) {
  return (
    <div className="flex items-center gap-0.5 p-0.5 bg-segment rounded-lg border border-border">
      {(["month", "week"] as const).map((v) => (
        <button
          key={v}
          onClick={() => onChange(v)}
          className={cn(
            "px-3 py-1 rounded-md text-xs font-medium transition-all",
            view === v
              ? "bg-card text-foreground border border-border shadow-sm"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {v === "month" ? monthLabel : weekLabel}
        </button>
      ))}
    </div>
  );
}

export default function TimelinePage() {
  const { t } = useTranslation();
  const dateFnsLocale = useDateFnsLocale();
  const { data: projects = [], isLoading } = useProjects();
  const { data: taskStats = [] } = useTasksPerProject();
  const [view, setView] = useState<"month" | "week">("month");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");
  const [activeOnly, setActiveOnly] = useState(true);
  const [viewing, setViewing] = useState<Project | null>(null);
  const todayRef = useRef<HTMLDivElement>(null);

  const statsByCode = useMemo(
    () => new Map(taskStats.map((s) => [s.project_code, s])),
    [taskStats],
  );

  const hasActiveFilter = !!search || priorityFilter !== "all" || activeOnly;
  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      const matchSearch =
        !q ||
        p.project_name.toLowerCase().includes(q) ||
        p.project_code.toLowerCase().includes(q);
      const matchPriority =
        priorityFilter === "all" || (p.priority ?? "Low") === priorityFilter;
      return matchSearch && matchPriority && (!activeOnly || !isClosed(p));
    });
  }, [projects, search, priorityFilter, activeOnly]);

  const datedProjects = filteredProjects.filter((p) => p.start_date);
  const undatedProjects = filteredProjects.filter((p) => !p.start_date);

  const { rangeStart, rangeEnd, columns, totalDays } = useMemo(() => {
    let minDate = new Date();
    let maxDate = addDays(minDate, 90);
    if (datedProjects.length > 0) {
      const starts = datedProjects.map((p) => parseISO(p.start_date!).getTime());
      const ends = datedProjects.map((p) =>
        parseISO(p.end_date ?? p.start_date!).getTime(),
      );
      minDate = new Date(Math.min(...starts));
      maxDate = new Date(Math.max(...ends));
    }

    const today = new Date();
    if (view === "week") {
      const s = startOfWeek(startOfMonth(minDate), WEEK);
      const e = endOfWeek(endOfMonth(maxDate), WEEK);
      return {
        rangeStart: s,
        rangeEnd: e,
        totalDays: differenceInDays(e, s) + 1,
        columns: eachWeekOfInterval({ start: s, end: e }, WEEK).map((w) => ({
          key: w.toISOString(),
          days: 7,
          label: format(w, "d MMM", { locale: dateFnsLocale }),
          current: isSameWeek(w, today, WEEK),
        })),
      };
    }

    const s = startOfMonth(minDate);
    const e = endOfMonth(maxDate);
    return {
      rangeStart: s,
      rangeEnd: e,
      totalDays: differenceInDays(e, s) + 1,
      columns: eachMonthOfInterval({ start: s, end: e }).map((m) => ({
        key: m.toISOString(),
        days: differenceInDays(endOfMonth(m), m) + 1,
        label: format(m, "MMM yyyy", { locale: dateFnsLocale }),
        current: isSameMonth(m, today),
      })),
    };
  }, [datedProjects, view, dateFnsLocale]);

  const minWidth =
    view === "week"
      ? Math.max(800, LABEL_WIDTH + columns.length * WEEK_COL_PX)
      : 800;

  function getBarStyle(project: Project) {
    if (!project.start_date) return null;
    const start = parseISO(project.start_date);
    const end = project.end_date ? parseISO(project.end_date) : start;
    const offsetDays = differenceInDays(start, rangeStart);
    const durationDays = Math.max(1, differenceInDays(end, start) + 1);
    const left = (offsetDays / totalDays) * 100;
    const width = (durationDays / totalDays) * 100;
    return {
      left: `${Math.max(0, left)}%`,
      width: `${Math.min(100 - Math.max(0, left), width)}%`,
    };
  }

  function getTodayStyle() {
    const today = new Date();
    const offset = differenceInCalendarDays(today, rangeStart);
    if (offset < 0 || offset > totalDays) return null;
    return { left: `${(offset / totalDays) * 100}%` };
  }

  const todayStyle = getTodayStyle();

  useEffect(() => {
    todayRef.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [view, isLoading]);

  const priorityOrder = { High: 0, Medium: 1, Low: 2 };
  const sortedDatedProjects = [...datedProjects].sort((a, b) => {
    const pa = priorityOrder[a.priority ?? "Low"] ?? 2;
    const pb = priorityOrder[b.priority ?? "Low"] ?? 2;
    if (pa !== pb) return pa - pb;
    return (a.start_date ?? "").localeCompare(b.start_date ?? "");
  });

  return (
    <div className="flex flex-col gap-5 h-full">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-center justify-between gap-3"
      >
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            {t("timeline.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("timeline.subtitle", { count: datedProjects.length })}
          </p>
        </div>
        <div data-tour="timeline-view">
          <ViewToggle
            view={view}
            onChange={setView}
            monthLabel={t("timeline.monthly")}
            weekLabel={t("timeline.weekly")}
          />
        </div>
      </motion.div>

      <div
        data-tour="timeline-search"
        className="flex items-center gap-3 flex-wrap"
      >
        <div className="relative flex-1 min-w-[200px] max-w-xs">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
          <Input
            placeholder={t("timeline.search")}
            className="pl-8 h-8 bg-secondary border-border text-sm text-foreground placeholder:text-muted-foreground"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="flex gap-0.5 p-0.5 bg-segment rounded-lg border border-border w-fit max-w-full overflow-x-auto scrollbar-thin">
          {(["all", "High", "Medium", "Low"] as const).map((p) => (
            <button
              key={p}
              onClick={() => setPriorityFilter(p)}
              className={cn(
                "px-3 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                priorityFilter === p
                  ? "bg-card text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {p === "all" ? t("timeline.allPriorities") : p}
            </button>
          ))}
        </div>
        <button
          type="button"
          aria-pressed={activeOnly}
          onClick={() => setActiveOnly((v) => !v)}
          className={cn(
            "px-3 py-1 rounded-lg text-xs font-medium border transition-all whitespace-nowrap",
            activeOnly
              ? "bg-primary/10 text-primary border-primary/30"
              : "bg-segment text-muted-foreground border-border hover:text-foreground",
          )}
        >
          {t("timeline.activeOnly")}
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
        {(["High", "Medium", "Low"] as const).map((p) => (
          <div key={p} className="flex items-center gap-1.5">
            <span
              className={cn("w-2.5 h-2.5 rounded-full", priorityConfig[p].dot)}
            />
            <span>{p}</span>
          </div>
        ))}
        <div className="flex items-center gap-1.5">
          <span className="w-2.5 h-2.5 rounded-full ring-2 ring-destructive" />
          <span>{t("timeline.lateLegend")}</span>
        </div>
        {todayStyle && (
          <div className="flex items-center gap-1.5 ml-4">
            <span className="w-px h-3 bg-primary" />
            <span className="text-primary">{t("timeline.today")}</span>
          </div>
        )}
      </div>

      {isLoading ? (
        <div className="flex-1 glass-card rounded-xl p-4 space-y-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <div
              key={i}
              className="h-12 rounded-lg bg-secondary animate-pulse"
            />
          ))}
        </div>
      ) : (
        <div
          data-tour="timeline-gantt"
          className="flex-1 overflow-auto scrollbar-thin"
        >
          <div
            className="glass-card rounded-xl overflow-hidden"
            style={{ minWidth }}
          >
            <div className="flex border-b border-border">
              <div className="w-36 sm:w-64 flex-shrink-0 px-3 sm:px-4 py-2.5 border-r border-border">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("timeline.projectLabel")}
                </span>
              </div>
              <div className="flex-1 relative flex">
                {columns.map((col) => (
                  <div
                    key={col.key}
                    style={{ width: `${(col.days / totalDays) * 100}%` }}
                    className={cn(
                      "border-r border-border/60 px-2 py-2.5 flex-shrink-0",
                      col.current && "bg-primary/5",
                    )}
                  >
                    <span
                      className={cn(
                        "text-[11px] font-semibold whitespace-nowrap",
                        col.current ? "text-primary" : "text-muted-foreground",
                      )}
                    >
                      {col.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            <div>
              {sortedDatedProjects.length === 0 && (
                <EmptyState
                  icon={CalendarDays}
                  title={
                    hasActiveFilter
                      ? t("timeline.noResults")
                      : t("timeline.noProjects")
                  }
                />
              )}

              {sortedDatedProjects.map((project, idx) => {
                const barStyle = getBarStyle(project);
                const prio = project.priority ?? "Low";
                const pConfig =
                  priorityConfig[prio as keyof typeof priorityConfig] ??
                  priorityConfig.Low;
                const duration =
                  project.start_date && project.end_date
                    ? differenceInDays(
                        parseISO(project.end_date),
                        parseISO(project.start_date),
                      ) + 1
                    : null;
                const stats = statsByCode.get(project.project_code);
                const progress = stats?.avgProgress ?? 0;
                const late = daysLate(project);
                const closed = isClosed(project);

                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    {...detailRowProps(() => setViewing(project))}
                    className="flex border-b border-border/40 group hover:bg-secondary/20 transition-colors cursor-pointer outline-none focus-visible:bg-secondary/40 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
                  >
                    <div className="w-36 sm:w-64 flex-shrink-0 px-3 sm:px-4 py-3 border-r border-border/40 flex flex-col justify-center gap-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span
                          className={cn(
                            "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border",
                            codeBadgeColors[idx % codeBadgeColors.length],
                          )}
                        >
                          {project.project_code
                            .split("-")
                            .slice(0, 2)
                            .join("-")}
                        </span>
                        <span
                          className={cn(
                            "flex items-center gap-1 text-[10px] font-semibold",
                            pConfig.text,
                          )}
                        >
                          <span
                            className={cn(
                              "w-1.5 h-1.5 rounded-full",
                              pConfig.dot,
                            )}
                          />
                          {prio}
                        </span>
                      </div>
                      <p className="text-xs font-medium text-foreground truncate leading-tight">
                        {project.project_name}
                      </p>
                      <p className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
                        {duration && t("timeline.daysShort", { count: duration })}
                        {project.work_status && (
                          <span className="truncate">· {project.work_status.status_name}</span>
                        )}
                        {late > 0 && (
                          <span className="flex items-center gap-0.5 font-semibold text-destructive shrink-0">
                            <AlertTriangle className="w-3 h-3" />
                            {t("timeline.late", { count: late })}
                          </span>
                        )}
                      </p>
                    </div>

                    <div className="flex-1 relative py-3 px-1">
                      <div className="absolute inset-0 flex pointer-events-none">
                        {columns.map((col) => (
                          <div
                            key={col.key}
                            style={{ width: `${(col.days / totalDays) * 100}%` }}
                            className={cn(
                              "border-r border-border/30 flex-shrink-0",
                              col.current && "bg-primary/3",
                            )}
                          />
                        ))}
                      </div>

                      {todayStyle && (
                        <div
                          ref={idx === 0 ? todayRef : undefined}
                          className="absolute top-0 bottom-0 w-px bg-primary/60 z-10 pointer-events-none"
                          style={todayStyle}
                        />
                      )}

                      {barStyle && (
                        <div
                          className={cn(
                            "absolute top-1/2 -translate-y-1/2 h-7 rounded-full flex items-center px-2.5 z-20 overflow-hidden group/bar",
                            late > 0 && "ring-2 ring-destructive ring-offset-1 ring-offset-card",
                            closed && "opacity-50 saturate-50",
                          )}
                          style={{
                            ...barStyle,
                            backgroundImage: pConfig.gradient,
                          }}
                          title={`${project.project_name} · ${project.start_date} → ${project.end_date ?? "-"} · ${progress}%`}
                        >
                          <div
                            className="absolute inset-y-0 right-0 bg-black/30"
                            style={{ width: `${100 - progress}%` }}
                          />
                          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover/bar:opacity-100 transition-opacity" />
                          <p className="text-[10px] text-white font-semibold truncate relative z-10 drop-shadow">
                            {project.project_name}
                            {stats && ` · ${progress}%`}
                          </p>
                        </div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>

          {undatedProjects.length > 0 && (
            <div className="mt-4 glass-card rounded-xl overflow-hidden">
              <div className="px-4 py-2.5 border-b border-border">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("timeline.noDates", { count: undatedProjects.length })}
                </span>
              </div>
              {undatedProjects.map((project, idx) => (
                <div
                  key={project.id}
                  className="flex items-center gap-3 px-4 py-3 border-b border-border/40 last:border-0 opacity-50"
                >
                  <Minus className="w-3.5 h-3.5 text-muted-foreground flex-shrink-0" />
                  <span
                    className={cn(
                      "inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-mono font-bold border flex-shrink-0",
                      codeBadgeColors[idx % codeBadgeColors.length],
                    )}
                  >
                    {project.project_code}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {project.project_name}
                  </span>
                  <span className="text-[10px] text-muted-foreground/50 ml-auto">
                    {t("timeline.addDates")}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <DetailDialog
        title={viewing?.project_name ?? ""}
        fields={
          viewing &&
          projectDetailFields(
            viewing,
            statsByCode.get(viewing.project_code),
            t,
            (d) => format(parseISO(d), "dd MMM yyyy", { locale: dateFnsLocale }),
          )
        }
        onClose={() => setViewing(null)}
      />

      {!isLoading && (
        <div className="text-[11px] text-muted-foreground flex items-center gap-2">
          <CalendarDays className="w-3.5 h-3.5" />
          <span>
            {t("timeline.spanLabel", {
              from: format(rangeStart, "dd MMM yyyy", {
                locale: dateFnsLocale,
              }),
              to: format(rangeEnd, "dd MMM yyyy", { locale: dateFnsLocale }),
              days: totalDays,
            })}
          </span>
        </div>
      )}
    </div>
  );
}

function projectDetailFields(
  p: Project,
  stats: ProjectTaskStats | undefined,
  t: (k: string, o?: Record<string, unknown>) => string,
  fmt: (d: string) => string,
): DetailField[] {
  const late = daysLate(p);
  const left =
    p.end_date && !isClosed(p)
      ? differenceInCalendarDays(parseISO(p.end_date), new Date())
      : null;
  return [
    { label: t("master.projects.columns.code"), value: p.project_code },
    { label: t("master.projects.columns.client"), value: p.client },
    { label: t("master.projects.columns.pic"), value: [p.pic_name, p.pic_contact].filter(Boolean).join(" · ") },
    { label: t("master.projects.columns.priority"), value: p.priority },
    { label: t("master.projects.columns.status"), value: p.work_status?.status_name },
    { label: t("master.projects.columns.type"), value: p.project_types?.map((x) => x.type_name).join(", ") },
    {
      label: t("master.projects.columns.period"),
      value: p.start_date && `${fmt(p.start_date)} → ${p.end_date ? fmt(p.end_date) : "-"}`,
    },
    {
      label: t("timeline.detail.deadline"),
      value:
        late > 0 ? (
          <span className="font-semibold text-destructive">{t("timeline.late", { count: late })}</span>
        ) : left !== null ? (
          t("timeline.detail.daysLeft", { count: left })
        ) : null,
    },
    { label: t("timeline.detail.members"), value: p.member_user_ids?.length || null },
    { label: t("timeline.detail.tasks"), value: stats?.count },
    { label: t("timeline.detail.progress"), value: stats && `${stats.avgProgress}%` },
    { label: t("timeline.detail.openProblems"), value: stats?.openProblems || null },
  ];
}
