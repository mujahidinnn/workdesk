import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useJobTitles } from "@/hooks/useJobTitles";
import { format, parseISO } from "date-fns";
import { CalendarOff, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Pager } from "@/components/ui/Pager";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog } from "@/components/ui/DetailDialog";
import { leaveDetailFields } from "./detailFields";
import { detailRowProps } from "@/components/ui/detail-row";
import { StatusBadge } from "@/components/overtime/StatusBadge";
import { usePagination } from "@/hooks/usePagination";
import type { LeaveRequestWithProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  requests: LeaveRequestWithProfile[];
  onEdit: (r: LeaveRequestWithProfile) => void;
  onDelete: (r: LeaveRequestWithProfile) => void;
}

export function LeaveTable({ requests, onEdit, onDelete }: Props) {
  const { t } = useTranslation();
  const jobTitles = useJobTitles();
  const [viewing, setViewing] = useState<LeaveRequestWithProfile | null>(null);
  const { paged, page, setPage, pageCount, pageSize, total } =
    usePagination(requests);

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={CalendarOff}
        title={t("leave.table.empty")}
        description={t("leave.table.emptyHint")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-auto scrollbar-thin">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-24">
                {t("leave.table.type")}
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-52">
                {t("leave.table.period")}
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("leave.table.reason")}
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-24">
                {t("leave.table.status")}
              </th>
              <th className="px-3 py-2.5 w-20" />
            </tr>
          </thead>
          <tbody>
            {paged.map((r, idx) => {
              const canModify =
                r.status === "Pending" || r.status === "Rejected";
              return (
                <tr
                  key={r.id}
                  {...detailRowProps(() => setViewing(r))}
                  className={cn(
                    "border-b border-border/40 transition-colors hover:bg-secondary/20 cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50",
                    idx % 2 !== 0 && "bg-secondary/10",
                  )}
                >
                  <td className="px-3 py-3 text-xs font-medium text-foreground">
                    {t(`leave.type.${r.type}`)}
                  </td>
                  <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                    {format(parseISO(r.start_date), "dd MMM yyyy")}
                    {r.end_date !== r.start_date &&
                      ` - ${format(parseISO(r.end_date), "dd MMM yyyy")}`}
                  </td>
                  <td className="px-3 py-3">
                    <p className="text-xs text-foreground line-clamp-2 max-w-xs">
                      {r.reason}
                    </p>
                    {r.rejection_note && (
                      <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                        ↳ {r.rejection_note}
                      </p>
                    )}
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={r.status} />
                  </td>
                  <td
                    className="px-3 py-3"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {canModify && (
                      <div className="flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
                          onClick={() => onEdit(r)}
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 w-7 p-0 text-muted-foreground hover:text-rose-600 dark:hover:text-rose-400"
                          onClick={() => onDelete(r)}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <Pager
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      />

      <DetailDialog
        title={t("common.detail")}
        fields={viewing && leaveDetailFields(viewing, t, jobTitles.byUser(viewing.submitter?.id))}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}
