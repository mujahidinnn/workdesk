import { useTranslation } from "react-i18next";
import type { OvertimeRecordWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";

const styles: Record<OvertimeRecordWithRelations["status"], string> = {
  Pending:
    "bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800/40",
  Approved:
    "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950/60 dark:text-emerald-400 dark:border-emerald-800/40",
  Rejected:
    "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950/60 dark:text-rose-400 dark:border-rose-800/40",
};

export function StatusBadge({
  status,
}: {
  status: OvertimeRecordWithRelations["status"];
}) {
  const { t } = useTranslation();
  return (
    <span
      className={cn(
        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border",
        styles[status],
      )}
    >
      {t(`overtime.status.${status}`)}
    </span>
  );
}
