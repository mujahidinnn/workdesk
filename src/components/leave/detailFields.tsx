import { format, parseISO } from "date-fns";
import type { DetailField } from "@/components/ui/DetailDialog";
import { StatusBadge } from "@/components/overtime/StatusBadge";
import type { LeaveRequestWithProfile } from "@/lib/types";

export function leaveDetailFields(
  r: LeaveRequestWithProfile,
  t: (k: string) => string,
  jobTitle?: string,
): DetailField[] {
  return [
    { label: t("leave.table.employee"), value: r.submitter?.full_name },
    { label: t("common.jobTitle"), value: jobTitle },
    { label: t("leave.table.type"), value: t(`leave.type.${r.type}`) },
    {
      label: t("leave.table.period"),
      value:
        format(parseISO(r.start_date), "dd MMM yyyy") +
        (r.end_date !== r.start_date
          ? ` - ${format(parseISO(r.end_date), "dd MMM yyyy")}`
          : ""),
    },
    { label: t("leave.table.status"), value: <StatusBadge status={r.status} /> },
    {
      label: t("common.submittedAt"),
      value: format(new Date(r.created_at), "dd MMM yyyy HH:mm"),
    },
    { label: t("leave.table.reason"), value: r.reason, block: true },
    {
      label: t("leave.approval.rejectNote"),
      value: r.rejection_note,
      block: true,
    },
  ];
}
