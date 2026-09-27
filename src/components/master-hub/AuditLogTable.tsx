import { useMemo, useState } from "react";
import { format } from "date-fns";
import { History } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Pager } from "@/components/ui/Pager";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { useAuditLog, type AuditLogFilters } from "@/hooks/useAuditLog";
import { FilterSelect } from "./FilterSelect";
import { SectionHeader, Toolbar, SearchInput } from "./MasterSection";
import { usePagination } from "@/hooks/usePagination";
import { useJobTitles } from "@/hooks/useJobTitles";
import { cn } from "@/lib/utils";
import type { AuditLogEntryWithActor } from "@/lib/types";
import { DateRangeFilter } from "@/components/master-hub/DateRangeFilter";

const CREATE_COLOR =
  "bg-emerald-100 text-emerald-700 border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800/40";

const ACTION_COLORS: Record<string, string> = {
  // Row triggers log "insert", the client logs "create".
  create: CREATE_COLOR,
  insert: CREATE_COLOR,
  update:
    "bg-blue-100 text-blue-700 border-blue-300 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800/40",
  delete:
    "bg-rose-100 text-rose-700 border-rose-300 dark:bg-rose-950 dark:text-rose-400 dark:border-rose-800/40",
};

// Client-side logAudit() calls plus the audit_row_change() trigger tables.
const ENTITY_TYPES = [
  "project",
  "employee",
  "user",
  "user_role",
  "profile",
  "daily_task",
  "attendance",
  "leave",
  "overtime",
  "holiday",
  "work_schedule",
  "payroll_run",
  "payroll_line",
  "role_permission",
  "access_override",
];

type Obj = Record<string, unknown>;
const NOISE = new Set(["id", "created_at", "updated_at"]);
const MAX_ITEMS = 4;

function show(v: unknown, max = 24): string {
  if (v === null || v === undefined) return "-";
  const s = typeof v === "object" ? JSON.stringify(v) : String(v);
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Row-trigger entries carry before/after snapshots: an update shows only
 *  the fields that changed, an insert or delete the row's own values.
 *  Client-logged entries are already a flat summary. */
function describe(detail: unknown, max?: number): string[] {
  if (!detail || typeof detail !== "object") return [];
  const d = detail as { before?: Obj; after?: Obj };
  if (d.before && d.after) {
    return Object.keys(d.after)
      .filter(
        (k) =>
          !NOISE.has(k) &&
          JSON.stringify(d.before![k]) !== JSON.stringify(d.after![k]),
      )
      .map(
        (k) => `${k}: ${show(d.before![k], max)} → ${show(d.after![k], max)}`,
      );
  }
  const row = d.after ?? d.before ?? (detail as Obj);
  return Object.entries(row)
    .filter(([k, v]) => !NOISE.has(k) && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${show(v, max)}`);
}

function Detail({ detail }: { detail: unknown }) {
  const [open, setOpen] = useState(false);
  const items = describe(detail);
  if (!items.length) return <span className="text-muted-foreground">-</span>;
  const extra = items.length - MAX_ITEMS;
  return (
    <div className="flex flex-wrap gap-1">
      {(open ? items : items.slice(0, MAX_ITEMS)).map((item) => (
        <span
          key={item}
          className="px-1.5 py-0.5 rounded bg-secondary text-[11px] text-muted-foreground whitespace-nowrap"
        >
          {item}
        </span>
      ))}
      {extra > 0 && (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="px-1.5 py-0.5 rounded text-[11px] font-medium text-primary hover:bg-primary/10"
        >
          {open ? "less" : `+${extra} more`}
        </button>
      )}
    </div>
  );
}

export function AuditLogTable() {
  const { t } = useTranslation();
  const jobTitles = useJobTitles();
  const [filters, setFilters] = useState<AuditLogFilters>({});
  const { data: entries = [], isLoading } = useAuditLog(200, filters);
  const [search, setSearch] = useState("");
  const [viewing, setViewing] = useState<AuditLogEntryWithActor | null>(null);
  const setFilter = (patch: AuditLogFilters) =>
    setFilters((f) => ({ ...f, ...patch }));

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return entries;
    return entries.filter(
      (e) =>
        (e.actor?.full_name ?? "").toLowerCase().includes(q) ||
        e.action.toLowerCase().includes(q) ||
        e.entity_type.toLowerCase().includes(q) ||
        e.entity_id.toLowerCase().includes(q),
    );
  }, [entries, search]);

  const { paged, page, setPage, pageCount, pageSize, total } = usePagination(
    filtered,
    30,
  );

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("master.auditLog.title")}
        count={entries.length}
        subtitle={t("master.auditLog.subtitle")}
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("master.auditLog.search")}
          tour="master-audit-log-search"
        />
        <FilterSelect
          value={filters.action}
          onChange={(action) => setFilter({ action })}
          allLabel={t("master.filters.allActions")}
          options={["create", "update", "delete"].map((a) => ({
            value: a,
            label: a,
          }))}
        />
        <FilterSelect
          value={filters.entityType}
          onChange={(entityType) => setFilter({ entityType })}
          allLabel={t("master.filters.allEntities")}
          options={ENTITY_TYPES.map((e) => ({ value: e, label: e }))}
        />
        <DateRangeFilter value={filters} onChange={setFilter} />
      </Toolbar>

      <div className="rounded-xl border border-border bg-card overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[820px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              {[
                t("master.auditLog.columns.time"),
                t("master.auditLog.columns.actor"),
                t("master.auditLog.columns.action"),
                t("master.auditLog.columns.entity"),
                t("master.auditLog.columns.detail"),
              ].map((h) => (
                <th
                  key={h}
                  className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground whitespace-nowrap"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-secondary animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : entries.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4">
                  <EmptyState
                    icon={History}
                    title={t("master.auditLog.empty")}
                  />
                </td>
              </tr>
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4">
                  <EmptyState
                    icon={History}
                    title={t("master.auditLog.noResults")}
                  />
                </td>
              </tr>
            ) : (
              paged.map((e) => (
                <tr
                  key={e.id}
                  {...detailRowProps(() => setViewing(e))}
                  className="border-b border-border/40 hover:bg-secondary/40 transition-colors cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
                >
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-[11px] text-muted-foreground tabular-nums">
                      {format(new Date(e.created_at), "dd MMM yyyy HH:mm")}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs text-foreground">
                      {e.actor?.full_name ?? t("master.auditLog.systemActor")}
                    </span>
                    {jobTitles.byUser(e.actor?.id) && (
                      <span className="block text-[10px] text-muted-foreground truncate max-w-[160px]">
                        {jobTitles.byUser(e.actor?.id)}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border",
                        ACTION_COLORS[e.action] ??
                          "bg-secondary text-muted-foreground border-border",
                      )}
                    >
                      {e.action}
                    </span>
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">
                    <span className="text-xs font-mono text-muted-foreground">
                      {e.entity_type}#{e.entity_id}
                    </span>
                  </td>
                  <td
                    className="px-4 py-3"
                    onClick={(ev) => ev.stopPropagation()}
                  >
                    <Detail detail={e.detail} />
                  </td>
                </tr>
              ))
            )}
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
        fields={
          viewing &&
          detailFields(viewing, t, jobTitles.byUser(viewing.actor?.id))
        }
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

function detailFields(
  e: AuditLogEntryWithActor,
  t: (k: string) => string,
  jobTitle: string | undefined,
): DetailField[] {
  const items = describe(e.detail, Infinity);
  return [
    {
      label: t("master.auditLog.columns.time"),
      value: format(new Date(e.created_at), "dd MMM yyyy HH:mm:ss"),
    },
    {
      label: t("master.auditLog.columns.actor"),
      value: e.actor?.full_name ?? t("master.auditLog.systemActor"),
    },
    ...(e.actor ? [{ label: t("common.jobTitle"), value: jobTitle }] : []),
    {
      label: t("master.auditLog.columns.action"),
      value: (
        <span
          className={cn(
            "inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border",
            ACTION_COLORS[e.action] ??
              "bg-secondary text-muted-foreground border-border",
          )}
        >
          {e.action}
        </span>
      ),
    },
    {
      label: t("master.auditLog.columns.entity"),
      value: (
        <span className="font-mono text-xs">
          {e.entity_type}#{e.entity_id}
        </span>
      ),
    },
    {
      label: t("master.auditLog.columns.detail"),
      block: true,
      value: items.length > 0 && (
        <ul className="space-y-1 text-xs font-mono text-muted-foreground break-all">
          {items.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ),
    },
  ];
}
