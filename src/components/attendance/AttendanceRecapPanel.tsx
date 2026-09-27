import { useMemo, useState } from "react";
import { format } from "date-fns";
import {
  CalendarOff,
  CheckCircle2,
  Clock,
  FileText,
  Palmtree,
  Stethoscope,
  Timer,
  XCircle,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useJobTitles } from "@/hooks/useJobTitles";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { Pager } from "@/components/ui/Pager";
import { usePagination } from "@/hooks/usePagination";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import { isEarlyLeave, isLateArrival, workHours } from "@/lib/attendance";
import type { AttendanceStatus, AttendanceWithProfile } from "@/lib/types";
import { attendanceDetailFields } from "./detailFields";
import { cn } from "@/lib/utils";

const STATUS_META: Record<
  AttendanceStatus,
  { icon: typeof CheckCircle2; classes: string }
> = {
  Hadir: {
    icon: CheckCircle2,
    classes: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  },
  Izin: {
    icon: FileText,
    classes: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  },
  Sakit: {
    icon: Stethoscope,
    classes: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
  },
  Cuti: {
    icon: Palmtree,
    classes: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  },
  Alpa: {
    icon: XCircle,
    classes: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
  },
};

export function AttendanceRecapPanel({
  records,
  workingDays,
}: {
  records: AttendanceWithProfile[];
  /** Working days in the period up to today; Alpa is derived from it. */
  workingDays: number;
}) {
  const { t } = useTranslation();
  const jobTitles = useJobTitles();
  const { data: schedule } = useWorkSchedule();
  const [viewing, setViewing] = useState<AttendanceWithProfile | null>(null);

  const counts = useMemo(() => {
    const result: Record<AttendanceStatus, number> = {
      Hadir: 0,
      Izin: 0,
      Sakit: 0,
      Cuti: 0,
      Alpa: 0,
    };
    records.forEach((r) => result[r.status]++);
    // A working day with no row at all is an unexcused absence.
    result.Alpa += Math.max(0, workingDays - records.length);
    return result;
  }, [records, workingDays]);

  const lateCount = useMemo(
    () =>
      records.filter((r) => isLateArrival(r.clock_in, schedule, r.status))
        .length,
    [records, schedule],
  );

  const totalHours = useMemo(
    () =>
      records.reduce(
        (sum, r) => sum + (workHours(r.clock_in, r.clock_out) ?? 0),
        0,
      ),
    [records],
  );

  const sorted = useMemo(
    () => [...records].sort((a, b) => b.date.localeCompare(a.date)),
    [records],
  );
  const { paged, page, setPage, pageCount, pageSize, total } =
    usePagination(sorted);

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {(Object.keys(STATUS_META) as AttendanceStatus[]).map((status) => {
          const { icon: Icon, classes } = STATUS_META[status];
          return (
            <div
              key={status}
              className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2"
            >
              <div
                className={cn(
                  "w-7 h-7 sm:w-8 sm:h-8 rounded-lg flex items-center justify-center",
                  classes,
                )}
              >
                <Icon className="w-4 h-4" />
              </div>
              <p className="text-xl sm:text-2xl font-semibold text-foreground leading-none">
                {counts[status]}
              </p>
              <p className="text-xs text-muted-foreground">
                {t(`attendance.status.${status}`)}
              </p>
            </div>
          );
        })}
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-orange-600 dark:text-orange-400 bg-orange-500/10">
            <Clock className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-semibold text-foreground leading-none">
            {lateCount}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("attendance.status.late")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-600 dark:text-slate-300 bg-slate-500/10">
            <CalendarOff className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-semibold text-foreground leading-none">
            {workingDays}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("attendance.recap.workingDays")}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-3 sm:p-4 flex flex-col gap-1.5 sm:gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center text-teal-600 dark:text-teal-400 bg-teal-500/10">
            <Timer className="w-4 h-4" />
          </div>
          <p className="text-xl sm:text-2xl font-semibold text-foreground leading-none">
            {totalHours.toFixed(1)}
          </p>
          <p className="text-xs text-muted-foreground">
            {t("attendance.recap.totalHours")}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-semibold text-foreground">
          {t("attendance.recap.historyTitle")}
        </p>
        {sorted.length === 0 ? (
          <EmptyState
            icon={CheckCircle2}
            title={t("attendance.recap.empty")}
            size="sm"
          />
        ) : (
          <div className="rounded-xl border border-border bg-card overflow-x-auto scrollbar-thin">
            <table className="w-full min-w-[640px] border-collapse">
              <tbody>
                {paged.map((r) => {
                  const { icon: Icon, classes } = STATUS_META[r.status];
                  return (
                    <tr
                      key={r.id}
                      {...detailRowProps(() => setViewing(r))}
                      className="border-b border-border/40 last:border-0 hover:bg-secondary/40 transition-colors cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
                    >
                      <td className="px-4 py-2.5 text-xs text-muted-foreground w-32 whitespace-nowrap">
                        {format(new Date(`${r.date}T00:00:00`), "dd MMM yyyy")}
                      </td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium",
                              classes,
                            )}
                          >
                            <Icon className="w-3 h-3" />
                            {t(`attendance.status.${r.status}`)}
                          </span>
                          {isLateArrival(r.clock_in, schedule, r.status) && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium text-orange-600 dark:text-orange-400 bg-orange-500/10">
                              {t("attendance.status.late")}
                            </span>
                          )}
                          {isEarlyLeave(r.clock_out, schedule, r.status) && (
                            <span className="inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/10">
                              {t("attendance.status.earlyLeave")}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground">
                        {r.clock_in ? r.clock_in.slice(0, 5) : "-"}
                        {" / "}
                        {r.clock_out ? r.clock_out.slice(0, 5) : "-"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground tabular-nums w-16">
                        {workHours(r.clock_in, r.clock_out)?.toFixed(1) ?? "-"}
                      </td>
                      <td className="px-4 py-2.5 text-xs text-muted-foreground truncate max-w-[200px]">
                        {r.note ?? ""}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {sorted.length > 0 && (
          <Pager
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={pageSize}
            onPageChange={setPage}
          />
        )}
      </div>
      <DetailDialog
        title={t("attendance.detail.title")}
        fields={viewing && attendanceDetailFields(viewing, t, jobTitles.byUser(viewing.profile?.id))}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

