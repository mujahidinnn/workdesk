import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useJobTitles } from "@/hooks/useJobTitles";
import { format, parseISO } from "date-fns";
import { Check, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Pager } from "@/components/ui/Pager";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { leaveDetailFields } from "./detailFields";
import { usePagination } from "@/hooks/usePagination";
import {
  useApproveLeaveRequest,
  useRejectLeaveRequest,
} from "@/hooks/useLeaveRequests";
import type { LeaveRequestWithProfile } from "@/lib/types";
import { cn } from "@/lib/utils";

interface Props {
  /** Pending requests from other people. Self-approval is blocked by the database. */
  requests: LeaveRequestWithProfile[];
}

interface RejectTarget {
  request: LeaveRequestWithProfile;
  note: string;
}

export function LeaveApprovalPanel({ requests }: Props) {
  const { t } = useTranslation();
  const jobTitles = useJobTitles();
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [viewing, setViewing] = useState<LeaveRequestWithProfile | null>(null);
  const approve = useApproveLeaveRequest();
  const reject = useRejectLeaveRequest();
  const { paged, page, setPage, pageCount, pageSize, total } =
    usePagination(requests);

  function handleRejectConfirm() {
    if (!rejectTarget || !rejectTarget.note.trim()) return;
    reject.mutate(
      { id: rejectTarget.request.id, note: rejectTarget.note.trim() },
      { onSettled: () => setRejectTarget(null) },
    );
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon={ShieldCheck}
        title={t("leave.approval.empty")}
        description={t("leave.approval.emptyHint")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="overflow-auto scrollbar-thin">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-border">
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-40">
                {t("leave.table.employee")}
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-24">
                {t("leave.table.type")}
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-52">
                {t("leave.table.period")}
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("leave.table.reason")}
              </th>
              <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-44">
                {t("leave.table.actions")}
              </th>
            </tr>
          </thead>
          <tbody>
            {paged.map((r, idx) => (
              <tr
                key={r.id}
                {...detailRowProps(() => setViewing(r))}
                className={cn(
                  "border-b border-border/40 transition-colors hover:bg-secondary/20 cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50",
                  idx % 2 !== 0 && "bg-secondary/10",
                )}
              >
                <td className="px-3 py-3 text-xs font-medium text-foreground">
                  {r.submitter?.full_name ?? "-"}
                  {jobTitles.byUser(r.submitter?.id) && (
                    <span className="block text-[10px] font-normal text-muted-foreground truncate max-w-[160px]">
                      {jobTitles.byUser(r.submitter?.id)}
                    </span>
                  )}
                </td>
                <td className="px-3 py-3 text-xs text-foreground">
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
                </td>
                <td
                  className="px-3 py-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1.5">
                    <Button
                      size="sm"
                      className="h-7 px-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs gap-1"
                      onClick={() => approve.mutate({ id: r.id })}
                      disabled={approve.isPending}
                      loading={approve.isPending && approve.variables?.id === r.id}
                    >
                      <Check className="w-3 h-3" />
                      {t("leave.approval.approve")}
                    </Button>
                    <Button
                      size="sm"
                      className="h-7 px-2.5 bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300 dark:bg-rose-800/60 dark:hover:bg-rose-700 dark:text-rose-300 dark:hover:text-white dark:border-rose-800/50 text-xs gap-1"
                      onClick={() => setRejectTarget({ request: r, note: "" })}
                      disabled={reject.isPending}
                    >
                      <X className="w-3 h-3" />
                      {t("leave.approval.reject")}
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
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

      <Dialog
        open={!!rejectTarget}
        onOpenChange={(v) => {
          if (!v && !reject.isPending) setRejectTarget(null);
        }}
      >
        <DialogContent className="max-w-sm bg-card border-border">
          <DialogHeader className="flex flex-col items-center text-center gap-3 pt-2">
            <div className="w-12 h-12 rounded-full bg-rose-100 border border-rose-300 dark:bg-rose-950/60 dark:border-rose-900/40 flex items-center justify-center">
              <X className="w-6 h-6 text-rose-600 dark:text-rose-400" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                {t("leave.approval.rejectTitle")}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1.5">
                {t("leave.approval.rejectDesc", {
                  name: rejectTarget?.request.submitter?.full_name ?? "-",
                })}
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 px-1">
            <Label className="text-xs font-medium text-foreground">
              {t("leave.approval.rejectNote")}
            </Label>
            <Textarea
              value={rejectTarget?.note ?? ""}
              onChange={(e) =>
                setRejectTarget((p) =>
                  p ? { ...p, note: e.target.value } : null,
                )
              }
              placeholder={t("leave.approval.rejectNotePlaceholder")}
              rows={3}
              className="bg-secondary border-border text-sm resize-none"
            />
          </div>
          <DialogFooter className="flex gap-2 pt-1">
            <Button
              variant="outline"
              className="flex-1 border-border text-foreground"
              onClick={() => setRejectTarget(null)}
              disabled={reject.isPending}
            >
              {t("common.cancel")}
            </Button>
            <Button
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
              onClick={handleRejectConfirm}
              disabled={!rejectTarget?.note.trim()}
              loading={reject.isPending}
            >
              {t("leave.approval.confirmReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

