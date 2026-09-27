import { useState } from "react";
import { useTranslation } from "react-i18next";
import { format, parseISO } from "date-fns";
import { Pencil, Trash2, Clock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { Toolbar } from "@/components/master-hub/MasterSection";
import { TypeBadge } from "./TypeBadge";
import { StatusBadge } from "./StatusBadge";
import { SortableTh } from "@/components/ui/SortableTh";
import { Pager } from "@/components/ui/Pager";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import {
  formatShiftTime,
  OVERTIME_TYPES,
  useOvertimeRecords,
  type OvertimeFilters,
} from "@/hooks/useOvertimeRecords";
import { useSortableData } from "@/hooks/useSortableData";
import { usePagination } from "@/hooks/usePagination";
import { useJobTitles } from "@/hooks/useJobTitles";
import type { OvertimeRecordWithRelations, Project } from "@/lib/types";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/components/master-hub/DateRangeFilter";

type StatusFilter = "all" | OvertimeRecordWithRelations["status"];
type SortKey = "date" | "status" | "type";

interface Props {
  currentUserId: string;
  projects: Pick<Project, "id" | "project_code" | "project_name">[];
  showEmployee?: boolean;
  onEdit: (r: OvertimeRecordWithRelations) => void;
  onDelete: (r: OvertimeRecordWithRelations) => void;
}

const STATUS_FILTERS: StatusFilter[] = [
  "all",
  "Pending",
  "Approved",
  "Rejected",
];

export function OvertimeTable({
  currentUserId,
  projects,
  showEmployee = false,
  onEdit,
  onDelete,
}: Props) {
  const { t } = useTranslation();
  const jobTitles = useJobTitles();
  const [viewing, setViewing] = useState<OvertimeRecordWithRelations | null>(
    null,
  );
  const [filters, setFilters] = useState<Omit<OvertimeFilters, "userId">>({});
  const setFilter = (patch: Partial<OvertimeFilters>) =>
    setFilters((f) => ({ ...f, ...patch }));
  const hasFilters = Object.values(filters).some(Boolean);

  const { data: filtered = [], isLoading } = useOvertimeRecords({
    userId: currentUserId,
    ...filters,
  });

  const { sorted, sortKey, direction, toggleSort } = useSortableData<
    OvertimeRecordWithRelations,
    SortKey
  >(filtered, (r, key) => r[key]);
  const { paged, page, setPage, pageCount, pageSize, total } =
    usePagination(sorted);

  if (isLoading) {
    return (
      <div className="space-y-3 p-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-10 rounded-lg bg-secondary animate-pulse"
          />
        ))}
      </div>
    );
  }

  if (filtered.length === 0 && !hasFilters) {
    return (
      <EmptyState
        icon={Clock}
        title={t("overtime.table.empty")}
        description={t("overtime.table.emptyHint")}
      />
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <Toolbar>
        <div className="flex gap-0.5 p-0.5 bg-segment rounded-lg border border-border w-fit max-w-full overflow-x-auto scrollbar-thin">
          {STATUS_FILTERS.map((key) => (
            <button
              key={key}
              onClick={() =>
                setFilter({ status: key === "all" ? undefined : key })
              }
              className={cn(
                "px-3 py-1.5 rounded-md text-xs font-medium transition-all whitespace-nowrap",
                (filters.status ?? "all") === key
                  ? "bg-card text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "all"
                ? t("overtime.approval.filterAll")
                : t(`overtime.status.${key}`)}
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

      {filtered.length === 0 ? (
        <EmptyState icon={Clock} title={t("overtime.table.noResults")} />
      ) : (
        <div className="overflow-auto scrollbar-thin">
          <table className="w-full min-w-[700px] text-sm">
            <thead>
              <tr className="border-b border-border">
                {showEmployee && (
                  <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                    {t("overtime.table.employee")}
                  </th>
                )}
                <SortableTh
                  active={sortKey === "type"}
                  direction={direction}
                  onClick={() => toggleSort("type")}
                  className="px-3 py-2.5 w-36"
                >
                  {t("overtime.table.type")}
                </SortableTh>
                <SortableTh
                  active={sortKey === "date"}
                  direction={direction}
                  onClick={() => toggleSort("date")}
                  className="px-3 py-2.5 w-28"
                >
                  {t("overtime.table.date")}
                </SortableTh>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-28">
                  {t("overtime.table.time")}
                </th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                  {t("overtime.table.description")}
                </th>
                <th className="text-left px-3 py-2.5 text-[10px] font-semibold uppercase tracking-widest text-muted-foreground w-24">
                  {t("overtime.table.duration")} /{" "}
                  {t("overtime.table.allowance")}
                </th>
                <SortableTh
                  active={sortKey === "status"}
                  direction={direction}
                  onClick={() => toggleSort("status")}
                  className="px-3 py-2.5 w-24"
                >
                  {t("overtime.table.status")}
                </SortableTh>
                <th className="px-3 py-2.5 w-20" />
              </tr>
            </thead>
            <tbody>
              {paged.map((r, idx) => {
                const isOwn = r.user_id === currentUserId;
                // A rejected request is not a dead end, the owner can fix it and
                // send it back, or withdraw it. Approved rows stay locked.
                const canModify =
                  isOwn && (r.status === "Pending" || r.status === "Rejected");
                const timeStr = formatShiftTime(r);
                const durationDisplay = formatDuration(r);

                return (
                  <tr
                    key={r.id}
                    {...detailRowProps(() => setViewing(r))}
                    className={cn(
                      "border-b border-border/40 transition-colors hover:bg-secondary/20 cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50",
                      idx % 2 !== 0 && "bg-secondary/10",
                    )}
                  >
                    {showEmployee && (
                      <td className="px-3 py-3">
                        <span className="text-xs text-foreground font-medium">
                          {r.submitter?.full_name ?? "-"}
                        </span>
                        {jobTitles.byUser(r.user_id) && (
                          <span className="block max-w-[160px] truncate text-[10px] text-muted-foreground">
                            {jobTitles.byUser(r.user_id)}
                          </span>
                        )}
                      </td>
                    )}
                    <td className="px-3 py-3">
                      <TypeBadge type={r.type} />
                    </td>
                    <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                      {format(parseISO(r.date), "dd MMM yyyy")}
                    </td>
                    <td className="px-3 py-3 text-xs font-mono text-muted-foreground whitespace-nowrap">
                      {timeStr}
                    </td>
                    <td className="px-3 py-3">
                      <div className="max-w-xs">
                        {r.project && (
                          <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 mr-1.5">
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
                      </div>
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
          viewing && detailFields(viewing, t, jobTitles.byUser(viewing.user_id))
        }
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

function formatDuration(r: OvertimeRecordWithRelations) {
  if (r.type === "Overtime") {
    return r.duration_hours != null ? `${r.duration_hours}h` : "-";
  }
  return r.daily_allowance != null
    ? `IDR ${r.daily_allowance.toLocaleString()}`
    : "1d";
}

function detailFields(
  r: OvertimeRecordWithRelations,
  t: (k: string) => string,
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
      label: `${t("overtime.table.duration")} / ${t("overtime.table.allowance")}`,
      value: formatDuration(r),
    },
    { label: t("overtime.table.status"), value: <StatusBadge status={r.status} /> },
    {
      label: t("common.submittedAt"),
      value: format(new Date(r.created_at), "dd MMM yyyy HH:mm"),
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
