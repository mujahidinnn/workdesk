import { format } from "date-fns";
import { FileText } from "lucide-react";
import type { DetailField } from "@/components/ui/DetailDialog";
import { workHours } from "@/lib/attendance";
import type { AttendanceWithProfile } from "@/lib/types";

export function attendanceDetailFields(
  r: AttendanceWithProfile,
  t: (k: string) => string,
  jobTitle?: string,
): DetailField[] {
  const url = r.attachment_url;
  const name = r.attachment_name;
  return [
    { label: t("attendance.table.employee"), value: r.profile?.full_name },
    { label: t("common.jobTitle"), value: jobTitle },
    {
      label: t("attendance.table.date"),
      value: format(new Date(`${r.date}T00:00:00`), "dd MMM yyyy"),
    },
    { label: t("attendance.table.status"), value: t(`attendance.status.${r.status}`) },
    {
      label: t("attendance.table.clockInOut"),
      value: `${r.clock_in?.slice(0, 5) ?? "-"} / ${r.clock_out?.slice(0, 5) ?? "-"}`,
    },
    {
      label: t("attendance.table.hours"),
      value: workHours(r.clock_in, r.clock_out)?.toFixed(1),
    },
    { label: t("attendance.table.note"), value: r.note, block: true },
    {
      label: t("attendance.detail.attachment"),
      block: true,
      value: !name ? null : !url ? (
        <span className="text-destructive">
          {t("attendance.detail.attachmentUnavailable")}
        </span>
      ) : (
        <a href={url} target="_blank" rel="noopener noreferrer" className="block">
          {/\.(jpe?g|png|webp)$/i.test(name) ? (
            <img src={url} alt={name} className="max-h-64 rounded-md object-contain" />
          ) : (
            <span className="inline-flex items-center gap-1.5 text-primary hover:underline">
              <FileText className="w-4 h-4" />
              {name}
            </span>
          )}
        </a>
      ),
    },
  ];
}
