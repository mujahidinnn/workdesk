import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { Check, X, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { Toolbar, SearchInput } from "@/components/master-hub/MasterSection";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { TypeBadge } from "./TypeBadge";
import { StatusBadge } from "./StatusBadge";
import { SortableTh } from "@/components/ui/SortableTh";
import { Pager } from "@/components/ui/Pager";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { useSortableData } from "@/hooks/useSortableData";
import { usePagination } from "@/hooks/usePagination";
import { useJobTitles } from "@/hooks/useJobTitles";
import {
  formatShiftTime,
  OVERTIME_TYPES,
  useOvertimeRecords,
  useApproveOvertimeRecord,
  useRejectOvertimeRecord,
  type OvertimeFilters,
} from "@/hooks/useOvertimeRecords";
import type {
  OvertimeRecordWithRelations,
  Profile,
  Project,
} from "@/lib/types";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/components/master-hub/DateRangeFilter";

type StatusFilter = "all" | OvertimeRecordWithRelations["status"];
type SortKey = "date" | "status" | "type";

interface Props {
  currentUserId: string;
  projects: Pick<Project, "id" | "project_code" | "project_name">[];
  profiles: Pick<Profile, "id" | "full_name">[];
}

interface RejectTarget {
  record: OvertimeRecordWithRelations;
  note: string;
}

export function AdminApprovalPanel({
  currentUserId,
  projects,
  profiles,
}: Props) {
  const { t } = useTranslation();
  const jobTitles = useJobTitles();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("Pending");
  const [filters, setFilters] = useState<
    Pick<OvertimeFilters, "type" | "projectId" | "userId" | "from" | "to">
  >({});
  const setFilter = (patch: Partial<OvertimeFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));
  const [search, setSearch] = useState("");
  const [rejectTarget, setRejectTarget] = useState<RejectTarget | null>(null);
  const [viewing, setViewing] = useState<OvertimeRecordWithRelations | null>(
    null,
  );

  const approve = useApproveOvertimeRecord();
  const reject = useRejectOvertimeRecord();

  // The database refuses self-approval; hide the button that would fail.
  const { data: records = [], isLoading } = useOvertimeRecords({
    excludeUserId: currentUserId,
    status: statusFilter === "all" ? undefined : statusFilter,
    ...filters,
  });
  const { data: pendingRecords = [] } = useOvertimeRecords({
    excludeUserId: currentUserId,
    status: "Pending",
  });
  const pendingCount = pendingRecords.length;
  const isDefaultView =
    statusFilter === "Pending" &&
    !search.trim() &&
    !Object.values(filters).some(Boolean);

  const filteredRecords = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return records;
    return records.filter(
      (r) =>
        r.submitter?.full_name.toLowerCase().includes(q) ||
        r.activity_description.toLowerCase().includes(q),
    );
  }, [records, search]);

  const { sorted, sortKey, direction, toggleSort } = useSortableData<
    OvertimeRecordWithRelations,
    SortKey
  >(filteredRecords, (r, key) => r[key]);
  const { paged, page, setPage, pageCount, pageSize, total } =
    usePagination(sorted);

  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selectablePending = paged.filter((r) => r.status === "Pending");

  // Clear selection so a bulk approve never hits rows no longer on screen.
  const visibleKey = paged.map((r) => r.id).join(",");
  useEffect(() => {
    setSelected(new Set());
  }, [visibleKey]);
  const allPendingSelected =
    selectablePending.length > 0 &&
    selectablePending.every((r) => selected.has(r.id));

  function toggleSelectAll() {
    setSelected(
      allPendingSelected
        ? new Set()
        : new Set(selectablePending.map((r) => r.id)),
    );
  }

  function toggleSelectOne(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleBulkApprove() {
    const ids = Array.from(selected);
    await Promise.all(
      ids.map((id) => approve.mutateAsync({ id, approvedBy: currentUserId })),
    );
    setSelected(new Set());
  }

  function handleApprove(r: OvertimeRecordWithRelations) {
    approve.mutate({ id: r.id, approvedBy: currentUserId });
  }

  function handleRejectConfirm() {
    if (!rejectTarget) return;
    reject.mutate(
      {
        id: rejectTarget.record.id,
        approvedBy: currentUserId,
        note: rejectTarget.note,
      },
      { onSettled: () => setRejectTarget(null) },
    );
  }

  const STATUS_FILTERS: { key: StatusFilter; label: string }[] = [
    {
      key: "Pending",
      label: `${t("overtime.status.Pending")} (${pendingCount})`,
    },
    { key: "Approved", label: t("overtime.status.Approved") },
    { key: "Rejected", label: t("overtime.status.Rejected") },
    { key: "all", label: t("overtime.approval.filterAll") },
  ];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold text-foreground">
            {t("overtime.approval.title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("overtime.approval.subtitle")}
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="flex items-center gap-1.5 text-xs font-semibold text-amber-700 bg-amber-100 border border-amber-300 dark:text-amber-400 dark:bg-amber-950/40 dark:border-amber-800/30 px-2.5 py-1 rounded-full">
            <ShieldCheck className="w-3.5 h-3.5" />
            {pendingCount} {t("overtime.stats.pending")}
          </span>
        )}
      </div>

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("overtime.approval.search")}
        />
        <div className="flex gap-0.5 p-0.5 bg-segment rounded-lg border border-border w-fit max-w-full overflow-x-auto scrollbar-thin">
          {STATUS_FILTERS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setStatusFilter(key)}
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                statusFilter === key
                  ? "bg-card text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <FilterSelect
          value={filters.type}
          onChange={(type) => setFilter({ type })}
          allLabel={t("overtime.table.allTypes")}
          options={OVERTIME_TYPES.map((v) => ({
            value: v,
            label: t(`overtime.type.${v}`),
          }))}
        />
        <FilterSelect
          value={filters.userId}
          onChange={(userId) => setFilter({ userId })}
          allLabel={t("dailyReport.allEmployees")}
          options={profiles
            .filter((p) => p.id !== currentUserId)
            .map((p) => ({ value: p.id, label: p.full_name ?? p.id }))}
        />
        <FilterSelect
          value={filters.projectId}
          onChange={(projectId) => setFilter({ projectId })}
          allLabel={t("dailyReport.allProjects")}
          options={projects.map((p) => ({
            value: String(p.id),
            label: `${p.project_code} - ${p.project_name}`,
          }))}
        />
        <DateRangeFilter value={filters} onChange={setFilter} />
      </Toolbar>

      {selected.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-primary/10 border border-primary/30">
          <span className="text-xs font-medium text-foreground">
            {t("overtime.approval.selected", { count: selected.size })}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs"
              onClick={() => setSelected(new Set())}
            >
              {t("common.cancel")}
            </Button>
            <Button
              size="sm"
              onClick={handleBulkApprove}
              disabled={approve.isPending}
              className="h-7 text-xs gap-1.5 bg-emerald-700 hover:bg-emerald-600 text-white"
            >
              <Check className="w-3 h-3" />
              {t("overtime.approval.approveSelected")}
            </Button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="space-y-3 p-2">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-10 rounded-lg bg-secondary animate-pulse"
            />
          ))}
        </div>
      ) : filteredRecords.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title={t(
            isDefaultView
              ? "overtime.approval.empty"
              : "overtime.approval.noResults",
          )}
        />
      ) : (
        <div className="overflow-auto scrollbar-thin">
          <table className="w-full min-w-[820px] text-sm">
            <thead>
              <tr className="border-b border-border">
                <th className="px-3 py-2.5 w-8">
                  <Checkbox
                    checked={allPendingSelected}
                    onCheckedChange={toggleSelectAll}
                    disabled={selectablePending.length === 0}
                  />
                </th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("overtime.table.employee")}
                </th>
                <SortableTh
                  active={sortKey === "type"}
                  direction={direction}
                  onClick={() => toggleSort("type")}
                  className="px-3 py-2.5"
                >
                  {t("overtime.table.type")}
                </SortableTh>
                <SortableTh
                  active={sortKey === "date"}
                  direction={direction}
                  onClick={() => toggleSort("date")}
                  className="px-3 py-2.5"
                >
                  {t("overtime.table.date")}
                </SortableTh>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("overtime.table.time")}
                </th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("overtime.table.description")}
                </th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("overtime.table.duration")} /{" "}
                  {t("overtime.table.allowance")}
                </th>
                <SortableTh
                  active={sortKey === "status"}
                  direction={direction}
                  onClick={() => toggleSort("status")}
                  className="px-3 py-2.5"
                >
                  {t("overtime.table.status")}
                </SortableTh>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("overtime.table.actions")}
                </th>
              </tr>
            </thead>
            <tbody>
              {paged.map((r, idx) => {
                const timeStr = formatShiftTime(r);
                const isPending = r.status === "Pending";
                const isOvertime = r.type === "Overtime";
                const durationDisplay = isOvertime
                  ? r.duration_hours != null
                    ? `${r.duration_hours}h`
                    : "-"
                  : r.daily_allowance != null
                    ? `IDR ${r.daily_allowance.toLocaleString()}`
                    : "1d";

                return (
                  <tr
                    key={r.id}
                    {...detailRowProps(() => setViewing(r))}
                    className={cn(
                      "border-b border-border/40 transition-colors hover:bg-secondary/20 cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50",
                      idx % 2 !== 0 && "bg-secondary/10",
                    )}
                  >
                    <td
                      className="px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Checkbox
                        checked={selected.has(r.id)}
                        onCheckedChange={() => toggleSelectOne(r.id)}
                        disabled={!isPending}
                      />
                    </td>
                    <td className="px-3 py-3">
                      <span className="text-xs font-medium text-foreground">
                        {r.submitter?.full_name ?? "-"}
                      </span>
                      {jobTitles.byUser(r.user_id) && (
                        <span className="block max-w-[160px] truncate text-[10px] text-muted-foreground">
                          {jobTitles.byUser(r.user_id)}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <TypeBadge type={r.type} />
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {format(parseISO(r.date), "dd MMM yyyy")}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {timeStr}
                    </td>
                    <td className="px-3 py-3 max-w-[200px]">
                      {r.project && (
                        <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 mr-1">
                          [{r.project.project_code}]
                        </span>
                      )}
                      <span className="text-xs text-foreground line-clamp-2">
                        {r.activity_description}
                      </span>
                      {r.rejection_note && (
                        <p className="text-[10px] text-rose-600 dark:text-rose-400 mt-0.5">
                          ↳ {r.rejection_note}
                        </p>
                      )}
                    </td>
                    <td className="px-3 py-3 text-xs font-semibold text-foreground whitespace-nowrap">
                      {durationDisplay}
                    </td>
                    <td className="px-3 py-3">
                      <StatusBadge status={r.status} />
                    </td>
                    <td
                      className="px-3 py-3"
                      onClick={(e) => e.stopPropagation()}
                    >
                      {isPending && (
                        <div className="flex items-center gap-1.5">
                          <Button
                            size="sm"
                            className="h-7 px-2.5 bg-emerald-700 hover:bg-emerald-600 text-white text-xs gap-1"
                            onClick={() => handleApprove(r)}
                            disabled={approve.isPending}
                          >
                            <Check className="w-3 h-3" />
                            {t("overtime.approval.approve")}
                          </Button>
                          <Button
                            size="sm"
                            className="h-7 px-2.5 bg-rose-100 hover:bg-rose-200 text-rose-700 border border-rose-300 dark:bg-rose-800/60 dark:hover:bg-rose-700 dark:text-rose-300 dark:hover:text-white dark:border-rose-800/50 text-xs gap-1"
                            onClick={() =>
                              setRejectTarget({ record: r, note: "" })
                            }
                            disabled={reject.isPending}
                          >
                            <X className="w-3 h-3" />
                            {t("overtime.approval.reject")}
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
      )}

      <Pager
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={pageSize}
        onPageChange={setPage}
      />

      <DetailDialog
        title={t("common.detail")}
        fields={
          viewing &&
          detailFields(
            viewing,
            t,
            [
              profiles.find((p) => p.id === viewing.approved_by)?.full_name,
              jobTitles.byUser(viewing.approved_by),
            ]
              .filter(Boolean)
              .join(" · "),
            jobTitles.byUser(viewing.user_id),
          )
        }
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
                {t("overtime.approval.rejectTitle")}
              </DialogTitle>
              <DialogDescription className="text-sm text-muted-foreground mt-1.5">
                {t("overtime.approval.rejectDesc", {
                  name: rejectTarget?.record.submitter?.full_name ?? "-",
                })}
              </DialogDescription>
            </div>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 px-1">
            <Label className="text-xs font-medium text-foreground">
              {t("overtime.approval.rejectNote")}
            </Label>
            <Textarea
              value={rejectTarget?.note ?? ""}
              onChange={(e) =>
                setRejectTarget((p) =>
                  p ? { ...p, note: e.target.value } : null,
                )
              }
              placeholder={t("overtime.approval.rejectNotePlaceholder")}
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
              {t("deleteModal.cancel")}
            </Button>
            <Button
              className="flex-1 bg-rose-600 hover:bg-rose-700 text-white"
              onClick={handleRejectConfirm}
              disabled={reject.isPending}
            >
              {t("overtime.approval.confirmReject")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function detailFields(
  r: OvertimeRecordWithRelations,
  t: (k: string) => string,
  reviewer: string | null | undefined,
  jobTitle: string | undefined,
): DetailField[] {
  return [
    { label: t("overtime.table.employee"), value: r.submitter?.full_name },
    { label: t("master.employees.fields.roleTitle"), value: jobTitle },
    { label: t("overtime.table.type"), value: <TypeBadge type={r.type} /> },
    {
      label: t("overtime.table.date"),
      value: format(parseISO(r.date), "dd MMM yyyy"),
    },
    { label: t("overtime.table.time"), value: formatShiftTime(r) },
    {
      label: t("overtime.table.project"),
      value: r.project && `${r.project.project_code} - ${r.project.project_name}`,
    },
    {
      label: t("overtime.table.duration"),
      value: r.duration_hours != null && `${r.duration_hours}h`,
    },
    {
      label: t("overtime.table.allowance"),
      value:
        r.daily_allowance != null &&
        `IDR ${r.daily_allowance.toLocaleString()}`,
    },
    { label: t("overtime.table.status"), value: <StatusBadge status={r.status} /> },
    { label: t("overtime.detail.reviewedBy"), value: reviewer },
    {
      label: t("overtime.detail.submittedAt"),
      value: format(parseISO(r.created_at), "dd MMM yyyy HH:mm"),
    },
    {
      label: t("overtime.table.description"),
      value: r.activity_description,
      block: true,
    },
    {
      label: t("overtime.approval.rejectNote"),
      value: r.rejection_note,
      block: true,
    },
  ];
}
