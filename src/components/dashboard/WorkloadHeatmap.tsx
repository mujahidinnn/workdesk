import { useState } from "react";
import { motion } from "framer-motion";
import {
  startOfWeek,
  addDays,
  format,
  isToday,
  eachDayOfInterval,
} from "date-fns";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowRight, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useDailyTasks, useWeeklyWorkload } from "@/hooks/useDailyTasks";
import { useEmployeeAvatarMap } from "@/hooks/useEmployeeAvatars";
import { UserAvatar } from "@/components/ui/UserAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ProgressBar } from "@/components/daily-report/ProgressBar";
import { supabase } from "@/integrations/supabase/client";
import { useHolidays } from "@/hooks/useHolidays";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import { useAuth } from "@/context/auth";
import { isWorkday } from "@/lib/workday";
import type { AttendanceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

/** Whose tasks the dialog lists: one day (a cell) or the whole week (a name). */
interface WorkloadTarget {
  employeeId: number;
  name: string;
  roleTitle?: string | null;
  from: string;
  to: string;
}

function getCellStyle(count: number): {
  bg: string;
  text: string;
  glow: boolean;
} {
  if (count === 0)
    return {
      bg: "bg-secondary/40",
      text: "text-muted-foreground/20",
      glow: false,
    };
  if (count === 1)
    return {
      bg: "bg-emerald-100 dark:bg-emerald-900/60",
      text: "text-emerald-800 dark:text-emerald-300",
      glow: false,
    };
  if (count === 2)
    return {
      bg: "bg-emerald-200 dark:bg-emerald-800/70",
      text: "text-emerald-800 dark:text-emerald-300",
      glow: false,
    };
  if (count === 3)
    return {
      bg: "bg-emerald-400 dark:bg-emerald-700/80",
      text: "text-emerald-950 dark:text-emerald-100",
      glow: true,
    };
  return {
    bg: "bg-emerald-500 dark:bg-emerald-600/90",
    text: "text-white",
    glow: true,
  };
}

export function WorkloadHeatmap() {
  const { data: workload = [], isLoading } = useWeeklyWorkload();
  const avatarMap = useEmployeeAvatarMap();
  const { t } = useTranslation();
  const [target, setTarget] = useState<WorkloadTarget | null>(null);

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const weekDates = DAYS.map((_, i) =>
    format(addDays(weekStart, i), "yyyy-MM-dd"),
  );
  const weekLabels = DAYS.map((d, i) => ({
    day: d,
    date: addDays(weekStart, i),
    dateStr: weekDates[i],
  }));

  return (
    <div className="glass-card rounded-xl p-5 flex flex-col gap-4 h-full">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-lg bg-blue-100 dark:bg-blue-950 flex items-center justify-center">
            <Users className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">
              {t("dashboard.workload.title")}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {t("dashboard.workload.weekOf", {
                date: format(weekStart, "dd MMM yyyy"),
              })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <span className="w-2.5 h-2.5 rounded-sm bg-secondary/40" />
          <span>{t("dashboard.workload.legend.zero")}</span>
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-200 dark:bg-emerald-800/70 mx-1" />
          <span>{t("dashboard.workload.legend.two")}</span>
          <span className="w-2.5 h-2.5 rounded-sm bg-emerald-500 dark:bg-emerald-600/90 mx-1 shadow-[0_0_6px_hsl(152_76%_40%/0.5)]" />
          <span>{t("dashboard.workload.legend.heavy")}</span>
        </div>
      </div>

      {isLoading ? (
        <div className="flex-1 flex flex-col justify-center space-y-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-9 rounded-lg bg-secondary animate-pulse"
            />
          ))}
        </div>
      ) : workload.length === 0 ? (
        <div className="flex-1 flex flex-col justify-center">
          <EmptyState
            size="sm"
            icon={Users}
            title={t("dashboard.workload.noTasks")}
          />
        </div>
      ) : (
        <div>
          <div className="flex items-center gap-1 mb-2 ml-44">
            {weekLabels.map(({ day, date }) => (
              <div
                key={day}
                className={cn(
                  "flex-1 text-center text-[10px] font-semibold py-1 rounded",
                  isToday(date)
                    ? "text-primary bg-primary/10"
                    : "text-muted-foreground",
                )}
              >
                <div>{day}</div>
                <div
                  className={cn(
                    "text-[9px] font-normal",
                    isToday(date)
                      ? "text-primary/70"
                      : "text-muted-foreground/50",
                  )}
                >
                  {format(date, "d")}
                </div>
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            {workload.map((emp, empIdx) => (
              <motion.div
                key={emp.employee_id}
                initial={{ opacity: 0, x: -12 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: empIdx * 0.05 }}
                className="flex items-center gap-1"
              >
                <button
                  type="button"
                  onClick={() =>
                    setTarget({
                      employeeId: emp.employee_id,
                      name: emp.employee_name,
                      roleTitle: emp.role_title,
                      from: weekDates[0],
                      to: weekDates[6],
                    })
                  }
                  title={[emp.employee_name, emp.role_title].filter(Boolean).join(" - ")}
                  className="w-44 flex items-center gap-2 flex-shrink-0 text-left rounded-md pr-1 hover:bg-secondary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary/50"
                >
                  <UserAvatar
                    name={emp.employee_name}
                    avatarUrl={avatarMap[emp.employee_id]?.avatarUrl}
                    colorIndex={empIdx}
                    size="sm"
                  />
                  <div className="min-w-0">
                    <p className="text-[11px] font-medium text-foreground truncate leading-none">
                      {emp.employee_name}
                    </p>
                    <p className="text-[9px] text-muted-foreground mt-0.5 leading-none truncate">
                      {emp.role_title && `${emp.role_title} · `}
                      {t("dashboard.workload.taskCount", { count: emp.totalTasks })}
                    </p>
                  </div>
                </button>

                {weekLabels.map(({ dateStr }) => {
                  const dayData = emp.days.find((d) => d.date === dateStr);
                  const count = dayData?.count ?? 0;
                  const { bg, text, glow } = getCellStyle(count);
                  return (
                    <button
                      type="button"
                      key={dateStr}
                      onClick={() =>
                        setTarget({
                          employeeId: emp.employee_id,
                          name: emp.employee_name,
                          roleTitle: emp.role_title,
                          from: dateStr,
                          to: dateStr,
                        })
                      }
                      className={cn(
                        "flex-1 h-8 rounded flex items-center justify-center text-[11px] font-semibold transition-all",
                        "cursor-pointer hover:ring-1 hover:ring-primary/60 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary",
                        bg,
                        text,
                        glow && "shadow-[0_0_8px_hsl(152_76%_40%/0.5)]",
                      )}
                      title={`${emp.employee_name} - ${count} task${count !== 1 ? "s" : ""} on ${dateStr}`}
                    >
                      {count > 0 ? count : ""}
                    </button>
                  );
                })}
              </motion.div>
            ))}
          </div>
        </div>
      )}

      <Dialog open={!!target} onOpenChange={(v) => !v && setTarget(null)}>
        <DialogContent className="bg-card border-border max-w-lg max-h-[85vh] overflow-y-auto">
          {target && <WorkloadTasks target={target} />}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const ABSENCE_CLASS: Partial<Record<AttendanceStatus, string>> = {
  Izin: "text-amber-700 dark:text-amber-400 bg-amber-500/10",
  Sakit: "text-sky-700 dark:text-sky-400 bg-sky-500/10",
  Cuti: "text-violet-700 dark:text-violet-400 bg-violet-500/10",
  Alpa: "text-rose-700 dark:text-rose-400 bg-rose-500/10",
};

type DayAttendance = {
  date: string;
  status: AttendanceStatus;
  note: string | null;
  clock_in: string | null;
  clock_out: string | null;
};

/** The employee's attendance in the range; heatmap rows are employees, attendance is per auth user. */
function useEmployeeAttendance(employeeId: number, from: string, to: string) {
  return useQuery<DayAttendance[]>({
    queryKey: ["attendance", "employee", employeeId, from, to],
    queryFn: async () => {
      const { data: profile, error: pErr } = await supabase
        .from("profiles")
        .select("id")
        .eq("employee_id", employeeId)
        .maybeSingle();
      if (pErr) throw pErr;
      if (!profile) return [];
      const { data, error } = await supabase
        .from("t_attendance")
        .select("date, status, note, clock_in, clock_out")
        .eq("user_id", profile.id)
        .gte("date", from)
        .lte("date", to);
      if (error) throw error;
      return data as DayAttendance[];
    },
  });
}

/** Mounted only while the dialog is open, so the data is fetched on demand. */
function WorkloadTasks({ target }: { target: WorkloadTarget }) {
  const { t } = useTranslation();
  const { canRead } = useAuth();
  const { data: tasks = [], isLoading } = useDailyTasks({
    employeeId: String(target.employeeId),
    from: target.from,
    to: target.to,
  });
  const { data: attendance = [], isLoading: attLoading } =
    useEmployeeAttendance(target.employeeId, target.from, target.to);
  const { data: holidays = [] } = useHolidays();
  const { data: schedule } = useWorkSchedule();

  const oneDay = target.from === target.to;
  const dayLabel = (d: Date) => format(d, "EEE, dd MMM yyyy");
  const days = eachDayOfInterval({
    start: new Date(`${target.from}T00:00:00`),
    end: new Date(`${target.to}T00:00:00`),
  });

  return (
    <>
      <DialogHeader>
        <DialogTitle className="text-foreground text-base font-semibold">
          {target.name}
          {target.roleTitle && (
            <span className="block text-xs font-normal text-muted-foreground mt-0.5">
              {target.roleTitle}
            </span>
          )}
        </DialogTitle>
        <DialogDescription className="text-xs text-muted-foreground">
          {oneDay
            ? dayLabel(days[0])
            : `${dayLabel(days[0])} - ${dayLabel(days[days.length - 1])}`}
          {!isLoading &&
            ` · ${t("dashboard.workload.taskCount", { count: tasks.length })}`}
        </DialogDescription>
      </DialogHeader>

      {isLoading || attLoading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-lg bg-secondary animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {days.map((d) => {
            const dateStr = format(d, "yyyy-MM-dd");
            const dayTasks = tasks.filter((x) => x.date === dateStr);
            const att = attendance.find((a) => a.date === dateStr);
            const holiday = holidays.find((h) => h.date === dateStr);
            return (
              <section key={dateStr} className="space-y-2">
                <div className="flex items-center gap-2">
                  {!oneDay && (
                    <p className="text-xs font-semibold text-foreground">
                      {dayLabel(d)}
                    </p>
                  )}
                  {att && (
                    <span
                      className={cn(
                        "px-1.5 py-0.5 rounded text-[10px] font-medium",
                        ABSENCE_CLASS[att.status] ??
                          "text-emerald-700 dark:text-emerald-400 bg-emerald-500/10",
                      )}
                    >
                      {t(`attendance.status.${att.status}`)}
                      {att.clock_in &&
                        ` ${att.clock_in.slice(0, 5)}-${att.clock_out?.slice(0, 5) ?? "…"}`}
                    </span>
                  )}
                </div>

                {dayTasks.length > 0 ? (
                  <ul className="space-y-2">
                    {dayTasks.map((task) => (
                      <li
                        key={task.id}
                        className="rounded-lg border border-border bg-secondary/40 p-3 space-y-2"
                      >
                        {task.project && (
                          <span className="inline-block px-1.5 py-0.5 rounded bg-secondary font-mono text-[10px] text-muted-foreground">
                            {task.project.project_code}
                          </span>
                        )}
                        <p className="text-sm text-foreground whitespace-pre-wrap break-words">
                          {task.task_desc}
                        </p>
                        <ProgressBar value={task.progress_pct} size="sm" />
                        {task.problem_desc?.trim() && (
                          <p className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400">
                            <AlertTriangle className="w-3 h-3 mt-0.5 flex-shrink-0" />
                            {task.problem_desc}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="text-xs text-muted-foreground rounded-lg border border-dashed border-border px-3 py-2">
                    {att && ABSENCE_CLASS[att.status]
                      ? t("dashboard.workload.noTaskAbsent", {
                          status: t(`attendance.status.${att.status}`),
                        })
                      : holiday
                        ? t("dashboard.workload.noTaskHoliday", {
                            name: holiday.name,
                          })
                        : !isWorkday(d, holidays, schedule)
                          ? t("dashboard.workload.noTaskDayOff")
                          : !att
                            ? t("dashboard.workload.noTaskNoAttendance")
                            : t("dashboard.workload.noTask")}
                    {att?.note && ABSENCE_CLASS[att.status] && (
                      <span className="block mt-1 text-foreground">
                        “{att.note}”
                      </span>
                    )}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {canRead("daily-report") && (
        <Link
          to={`/daily-report?employee=${target.employeeId}&from=${target.from}&to=${target.to}`}
          className="mt-2 flex items-center justify-center gap-1.5 rounded-md border border-border py-2 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          {t("dashboard.openInDailyReport")}
          <ArrowRight className="w-3.5 h-3.5" />
        </Link>
      )}
    </>
  );
}
