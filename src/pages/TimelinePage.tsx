import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  differenceInDays,
  addDays,
  startOfMonth,
  endOfMonth,
  eachMonthOfInterval,
  format,
  isSameMonth,
} from "date-fns";
import { CalendarDays, Minus, Search } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useProjects } from "@/hooks/useProjects";
import { useDateFnsLocale } from "@/lib/dateLocale";
import { Input } from "@/components/ui/input";
import { EmptyState } from "@/components/ui/EmptyState";
import { PROJECT_BADGE_COLORS as codeBadgeColors } from "@/lib/colorPalettes";
import type { Project } from "@/lib/types";
import { cn } from "@/lib/utils";

type PriorityFilter = "all" | "High" | "Medium" | "Low";

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
  const [view, setView] = useState<"month" | "week">("month");
  const [search, setSearch] = useState("");
  const [priorityFilter, setPriorityFilter] = useState<PriorityFilter>("all");

  const hasActiveFilter = !!search || priorityFilter !== "all";
  const filteredProjects = useMemo(() => {
    const q = search.toLowerCase().trim();
    return projects.filter((p) => {
      const matchSearch =
        !q ||
        p.project_name.toLowerCase().includes(q) ||
        p.project_code.toLowerCase().includes(q);
      const matchPriority =
        priorityFilter === "all" || (p.priority ?? "Low") === priorityFilter;
      return matchSearch && matchPriority;
    });
  }, [projects, search, priorityFilter]);

  const datedProjects = filteredProjects.filter((p) => p.start_date);
  const undatedProjects = filteredProjects.filter((p) => !p.start_date);

  const { rangeStart, rangeEnd, months, totalDays } = useMemo(() => {
    if (datedProjects.length === 0) {
      const now = new Date();
      const s = startOfMonth(now);
      const e = endOfMonth(addDays(now, 90));
      return {
        rangeStart: s,
        rangeEnd: e,
        months: eachMonthOfInterval({ start: s, end: e }),
        totalDays: differenceInDays(e, s) + 1,
      };
    }

    const starts = datedProjects.map((p) => new Date(p.start_date!).getTime());
    const ends = datedProjects.map((p) =>
      p.end_date
        ? new Date(p.end_date).getTime()
        : new Date(p.start_date!).getTime(),
    );

    const minDate = new Date(Math.min(...starts));
    const maxDate = new Date(Math.max(...ends));

    const s = startOfMonth(minDate);
    const e = endOfMonth(maxDate);
    return {
      rangeStart: s,
      rangeEnd: e,
      months: eachMonthOfInterval({ start: s, end: e }),
      totalDays: differenceInDays(e, s) + 1,
    };
  }, [datedProjects]);

  function getBarStyle(project: Project) {
    if (!project.start_date) return null;
    const start = new Date(project.start_date);
    const end = project.end_date ? new Date(project.end_date) : start;
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
    const offset = differenceInDays(today, rangeStart);
    if (offset < 0 || offset > totalDays) return null;
    return { left: `${(offset / totalDays) * 100}%` };
  }

  const todayStyle = getTodayStyle();

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
      </div>

      <div className="flex items-center gap-4 text-[11px] text-muted-foreground">
        {(["High", "Medium", "Low"] as const).map((p) => (
          <div key={p} className="flex items-center gap-1.5">
            <span
              className={cn("w-2.5 h-2.5 rounded-full", priorityConfig[p].dot)}
            />
            <span>{p}</span>
          </div>
        ))}
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
          <div className="min-w-[800px] glass-card rounded-xl overflow-hidden">
            <div className="flex border-b border-border">
              <div className="w-36 sm:w-64 flex-shrink-0 px-3 sm:px-4 py-2.5 border-r border-border">
                <span className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("timeline.projectLabel")}
                </span>
              </div>
              <div className="flex-1 relative flex">
                {months.map((month) => {
                  const daysInMonth =
                    differenceInDays(endOfMonth(month), startOfMonth(month)) +
                    1;
                  const widthPct = (daysInMonth / totalDays) * 100;
                  const isCurrentMonth = isSameMonth(month, new Date());
                  return (
                    <div
                      key={month.toISOString()}
                      style={{ width: `${widthPct}%` }}
                      className={cn(
                        "border-r border-border/60 px-2 py-2.5 flex-shrink-0",
                        isCurrentMonth && "bg-primary/5",
                      )}
                    >
                      <span
                        className={cn(
                          "text-[11px] font-semibold whitespace-nowrap",
                          isCurrentMonth
                            ? "text-primary"
                            : "text-muted-foreground",
                        )}
                      >
                        {format(month, view === "month" ? "MMM yyyy" : "MMM", {
                          locale: dateFnsLocale,
                        })}
                      </span>
                    </div>
                  );
                })}
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
                        new Date(project.end_date),
                        new Date(project.start_date),
                      ) + 1
                    : null;

                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.04 }}
                    className="flex border-b border-border/40 group hover:bg-secondary/20 transition-colors"
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
                      {duration && (
                        <p className="text-[10px] text-muted-foreground">
                          {t("timeline.daysShort", { count: duration })}
                        </p>
                      )}
                    </div>

                    <div className="flex-1 relative py-3 px-1">
                      <div className="absolute inset-0 flex pointer-events-none">
                        {months.map((month) => {
                          const daysInMonth =
                            differenceInDays(
                              endOfMonth(month),
                              startOfMonth(month),
                            ) + 1;
                          return (
                            <div
                              key={month.toISOString()}
                              style={{
                                width: `${(daysInMonth / totalDays) * 100}%`,
                              }}
                              className={cn(
                                "border-r border-border/30 flex-shrink-0",
                                isSameMonth(month, new Date()) &&
                                  "bg-primary/3",
                              )}
                            />
                          );
                        })}
                      </div>

                      {todayStyle && (
                        <div
                          className="absolute top-0 bottom-0 w-px bg-primary/60 z-10 pointer-events-none"
                          style={todayStyle}
                        />
                      )}

                      {barStyle && (
                        <div
                          className="absolute top-1/2 -translate-y-1/2 h-7 rounded-full flex items-center px-2.5 z-20 overflow-hidden cursor-default group/bar"
                          style={{
                            ...barStyle,
                            backgroundImage: pConfig.gradient,
                          }}
                          title={`${project.project_name} · ${project.start_date} → ${project.end_date ?? "-"}`}
                        >
                          <div className="absolute inset-0 bg-gradient-to-r from-white/0 via-white/10 to-white/0 opacity-0 group-hover/bar:opacity-100 transition-opacity" />
                          <p className="text-[10px] text-white font-semibold truncate relative z-10 drop-shadow">
                            {project.project_name}
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
