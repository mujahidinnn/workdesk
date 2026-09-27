import { useState } from "react";
import { format } from "date-fns";
import {
  Pencil,
  Trash2,
  CalendarCheck,
  Paperclip,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { useJobTitles } from "@/hooks/useJobTitles";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog } from "@/components/ui/DetailDialog";
import { attendanceDetailFields } from "./detailFields";
import { detailRowProps } from "@/components/ui/detail-row";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import { isEarlyLeave, isLateArrival, workHours } from "@/lib/attendance";
import type { AttendanceWithProfile, AttendanceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

const STATUS_BADGE: Record<AttendanceStatus, string> = {
  Hadir: "text-emerald-600 dark:text-emerald-400 bg-emerald-500/10",
  Izin: "text-amber-600 dark:text-amber-400 bg-amber-500/10",
  Sakit: "text-sky-600 dark:text-sky-400 bg-sky-500/10",
  Cuti: "text-violet-600 dark:text-violet-400 bg-violet-500/10",
  Alpa: "text-rose-600 dark:text-rose-400 bg-rose-500/10",
};

interface AttendanceTableProps {
  records: AttendanceWithProfile[];
  readOnly?: boolean;
  isLoading?: boolean;
  onEdit?: (record: AttendanceWithProfile) => void;
  onDelete?: (record: AttendanceWithProfile) => void;
}

export function AttendanceTable({
  records,
  readOnly = false,
  isLoading,
  onEdit,
  onDelete,
}: AttendanceTableProps) {
  const { t } = useTranslation();
  const jobTitles = useJobTitles();
  const { data: schedule } = useWorkSchedule();
  const [viewing, setViewing] = useState<AttendanceWithProfile | null>(null);

  return (
    <>
    <div className="rounded-xl border border-border bg-card overflow-x-auto scrollbar-thin">
      <table className="w-full min-w-[760px] border-collapse">
        <thead>
          <tr className="border-b border-border">
            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("attendance.table.employee")}
            </th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("attendance.table.date")}
            </th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("attendance.table.status")}
            </th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("attendance.table.clockInOut")}
            </th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("attendance.table.hours")}
            </th>
            <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
              {t("attendance.table.note")}
            </th>
            {!readOnly && (
              <th className="px-4 py-3 text-right text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-20">
                {t("master.masterList.columnActions")}
              </th>
            )}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <tr key={i} className="border-b border-border/50">
                <td className="px-4 py-3" colSpan={readOnly ? 6 : 7}>
                  <div className="h-4 rounded bg-secondary animate-pulse" />
                </td>
              </tr>
            ))
          ) : records.length === 0 ? (
            <tr>
              <td colSpan={readOnly ? 6 : 7} className="px-4">
                <EmptyState
                  icon={CalendarCheck}
                  title={t("attendance.table.empty")}
                />
              </td>
            </tr>
          ) : (
            records.map((r) => (
              <tr
                key={r.id}
                {...detailRowProps(() => setViewing(r))}
                className="border-b border-border/40 group hover:bg-secondary/40 transition-colors cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
              >
                <td className="px-4 py-3 text-sm text-foreground">
                  {r.profile?.full_name ?? "-"}
                  {jobTitles.byUser(r.profile?.id) && (
                    <span className="block text-[10px] text-muted-foreground truncate max-w-[180px]">
                      {jobTitles.byUser(r.profile?.id)}
                    </span>
                  )}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground whitespace-nowrap">
                  {format(new Date(`${r.date}T00:00:00`), "dd MMM yyyy")}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1.5">
                    <span
                      className={cn(
                        "inline-flex px-2 py-0.5 rounded-full text-[11px] font-medium",
                        STATUS_BADGE[r.status],
                      )}
                    >
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
                <td className="px-4 py-3 text-xs text-muted-foreground">
                  {r.clock_in ? r.clock_in.slice(0, 5) : "-"}
                  {" / "}
                  {r.clock_out ? r.clock_out.slice(0, 5) : "-"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground tabular-nums">
                  {workHours(r.clock_in, r.clock_out)?.toFixed(1) ?? "-"}
                </td>
                <td className="px-4 py-3 text-xs text-muted-foreground truncate max-w-[220px]">
                  {r.note ?? ""}
                  {r.attachment_url && (
                    <a
                      href={r.attachment_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      title={r.attachment_name ?? undefined}
                      onClick={(e) => e.stopPropagation()}
                      className="ml-1.5 inline-flex align-middle text-primary hover:underline"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                    </a>
                  )}
                </td>
                {!readOnly && (
                  <td className="px-4 py-3">
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                    >
                      <button
                        onClick={() => onEdit?.(r)}
                        aria-label={t("common.edit")}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDelete?.(r)}
                        aria-label={t("common.delete")}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                )}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
      <DetailDialog
        title={t("attendance.detail.title")}
        fields={viewing && attendanceDetailFields(viewing, t, jobTitles.byUser(viewing.profile?.id))}
        onClose={() => setViewing(null)}
      />
    </>
  );
}
