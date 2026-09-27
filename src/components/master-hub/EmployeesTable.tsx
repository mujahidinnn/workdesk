import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Pencil,
  Trash2,
  Plus,
  Users,
  Download,
  Upload,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AccessControl } from "@/components/auth/AccessControl";
import { SortableTh } from "@/components/ui/SortableTh";
import { Pager } from "@/components/ui/Pager";
import { ImportDialog } from "./ImportDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { DetailDialog, type DetailField } from "@/components/ui/DetailDialog";
import { detailRowProps } from "@/components/ui/detail-row";
import { useSortableData } from "@/hooks/useSortableData";
import { usePagination } from "@/hooks/usePagination";
import {
  useCreateEmployee,
  type EmployeeFilters,
} from "@/hooks/useEmployees";
import { FilterSelect } from "./FilterSelect";
import { SectionHeader, Toolbar, SearchInput } from "./MasterSection";
import { exportEmployeesExcel } from "@/lib/exportMasterData";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import {
  parseEmployeesExcel,
  type EmployeeImportRow,
} from "@/lib/importMasterData";
import { format } from "date-fns";
import type { Employee, EmploymentType } from "@/lib/types";
import { PresenceDot } from "@/components/presence/PresenceDot";
import { isEmployeeActive } from "@/hooks/useEmployeePresence";
import { AVATAR_CHIP_COLORS as avatarColors } from "@/lib/colorPalettes";
import { cn } from "@/lib/utils";

type SortKey = "full_name" | "role_title" | "status" | "created_at";

function getInitials(name: string) {
  return name
    .split(" ")
    .map((n) => n[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

interface EmployeesTableProps {
  employees: Employee[];
  onAdd: () => void;
  onEdit: (e: Employee) => void;
  onDelete: (id: number) => void;
  isLoading?: boolean;
  presenceMap?: Record<number, string>;
  filters: EmployeeFilters;
  onFiltersChange: (f: EmployeeFilters) => void;
}

const EMPLOYMENT_TYPES: EmploymentType[] = [
  "Permanent",
  "Contract",
  "Probation",
  "Intern",
];

export function EmployeesTable({
  employees,
  onAdd,
  onEdit,
  onDelete,
  isLoading,
  presenceMap = {},
  filters,
  onFiltersChange,
}: EmployeesTableProps) {
  const company = useWorkSchedule().data?.company_name ?? "WorkDesk";
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [viewing, setViewing] = useState<Employee | null>(null);
  const createEmployee = useCreateEmployee();
  const active = employees.filter((e) => e.status === "Active").length;

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    if (!q) return employees;
    return employees.filter(
      (e) =>
        e.full_name.toLowerCase().includes(q) ||
        e.role_title.toLowerCase().includes(q),
    );
  }, [employees, search]);

  const { sorted, sortKey, direction, toggleSort } = useSortableData<
    Employee,
    SortKey
  >(filtered, (e, key) => e[key] ?? "");
  const { paged, page, setPage, pageCount, pageSize, total } =
    usePagination(sorted);

  return (
    <div className="flex flex-col gap-4">
      <SectionHeader
        title={t("master.employees.title")}
        count={employees.length}
        subtitle={
          <>
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {t("master.employees.active", { count: active })}
            </span>
            {" · "}
            {t("master.employees.inactive", {
              count: employees.length - active,
            })}
          </>
        }
        tour="master-employees-toolbar"
        actions={
          <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => exportEmployeesExcel(filtered, company)}
            disabled={filtered.length === 0}
            className="h-8 gap-1.5 border-border text-xs"
          >
            <Download className="w-3.5 h-3.5" />
            {t("common.export")}
          </Button>
          <AccessControl feature="master" action="create">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setImportOpen(true)}
              className="h-8 gap-1.5 border-border text-xs"
            >
              <Upload className="w-3.5 h-3.5" />
              {t("master.import.button")}
            </Button>
          </AccessControl>
          <AccessControl feature="master" action="create">
            <Button
              size="sm"
              onClick={onAdd}
              className="bg-primary text-primary-foreground hover:bg-primary/90 h-8 gap-1.5"
            >
              <Plus className="w-3.5 h-3.5" />
              {t("master.employees.addEmployee")}
            </Button>
          </AccessControl>
          </>
        }
      />

      <Toolbar>
        <SearchInput
          value={search}
          onChange={setSearch}
          placeholder={t("master.employees.search")}
        />
        <FilterSelect
          value={filters.status}
          onChange={(status) => onFiltersChange({ ...filters, status })}
          allLabel={t("master.filters.allStatuses")}
          options={[
            { value: "Active", label: t("master.employees.fields.active") },
            { value: "Inactive", label: t("master.employees.fields.inactive") },
          ]}
        />
        <FilterSelect
          value={filters.employmentType}
          onChange={(employmentType) =>
            onFiltersChange({ ...filters, employmentType })
          }
          allLabel={t("master.filters.allEmploymentTypes")}
          options={EMPLOYMENT_TYPES.map((type) => ({
            value: type,
            label: t(`master.employees.employmentTypes.${type}`),
          }))}
        />
      </Toolbar>

      <div className="rounded-xl border border-border bg-card overflow-x-auto scrollbar-thin">
        <table className="w-full min-w-[680px] border-collapse">
          <thead>
            <tr className="border-b border-border">
              <SortableTh
                active={sortKey === "full_name"}
                direction={direction}
                onClick={() => toggleSort("full_name")}
              >
                {t("master.employees.columns.employee")}
              </SortableTh>
              <SortableTh
                active={sortKey === "role_title"}
                direction={direction}
                onClick={() => toggleSort("role_title")}
              >
                {t("master.employees.columns.role")}
              </SortableTh>
              <SortableTh
                active={sortKey === "status"}
                direction={direction}
                onClick={() => toggleSort("status")}
              >
                {t("master.employees.columns.status")}
              </SortableTh>
              <SortableTh
                active={sortKey === "created_at"}
                direction={direction}
                onClick={() => toggleSort("created_at")}
              >
                {t("master.employees.columns.joined")}
              </SortableTh>
              <th className="px-4 py-3 text-left text-[10px] font-semibold uppercase tracking-widest text-muted-foreground" />
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <tr key={i} className="border-b border-border/50">
                  {Array.from({ length: 5 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <div className="h-4 rounded bg-secondary animate-pulse" />
                    </td>
                  ))}
                </tr>
              ))
            ) : filtered.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4">
                  <EmptyState
                    icon={Users}
                    title={
                      search
                        ? t("master.employees.noResults")
                        : t("master.employees.empty")
                    }
                  />
                </td>
              </tr>
            ) : (
              paged.map((emp, i) => (
                <motion.tr
                  key={emp.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}
                  {...detailRowProps(() => setViewing(emp))}
                  className="border-b border-border/40 group hover:bg-secondary/40 transition-colors cursor-pointer outline-none focus-visible:bg-secondary/60 focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-primary/50"
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2.5">
                      <div className="relative flex-shrink-0">
                        <div
                          className={cn(
                            "w-8 h-8 rounded-lg flex items-center justify-center text-[11px] font-bold",
                            avatarColors[i % avatarColors.length],
                          )}
                        >
                          {getInitials(emp.full_name)}
                        </div>
                        <PresenceDot
                          isActive={isEmployeeActive(presenceMap[emp.id])}
                        />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-foreground">
                          {emp.full_name}
                        </p>
                      </div>
                    </div>
                  </td>

                  <td className="px-4 py-3">
                    <p className="text-xs text-muted-foreground">
                      {emp.role_title}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <span
                      className={cn(
                        "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-semibold",
                        emp.status === "Active"
                          ? "bg-emerald-100 text-emerald-700 border border-emerald-300 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800/40"
                          : "bg-zinc-100 text-zinc-600 border border-zinc-300 dark:bg-zinc-800 dark:text-zinc-400 dark:border-zinc-700/40",
                      )}
                    >
                      <span
                        className={cn(
                          "w-1.5 h-1.5 rounded-full",
                          emp.status === "Active"
                            ? "bg-emerald-500"
                            : "bg-zinc-500",
                        )}
                      />
                      {emp.status === "Active"
                        ? t("common.active")
                        : t("common.inactive")}
                    </span>
                  </td>

                  <td className="px-4 py-3">
                    <p className="text-xs text-muted-foreground tabular-nums">
                      {format(new Date(emp.created_at), "dd MMM yyyy")}
                    </p>
                  </td>

                  <td className="px-4 py-3">
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 [@media(hover:none)]:opacity-100 transition-opacity"
                    >
                      <AccessControl feature="master" action="update">
                        <button
                          onClick={() => onEdit(emp)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </AccessControl>
                      <AccessControl feature="master" action="delete">
                        <button
                          onClick={() => onDelete(emp.id)}
                          className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </AccessControl>
                    </div>
                  </td>
                </motion.tr>
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

      <ImportDialog<EmployeeImportRow>
        open={importOpen}
        onOpenChange={setImportOpen}
        onParse={parseEmployeesExcel}
        onImport={async (rows) => {
          await Promise.all(rows.map((row) => createEmployee.mutateAsync(row)));
        }}
      />

      <DetailDialog
        title={t("common.detail")}
        fields={viewing && detailFields(viewing, t)}
        onClose={() => setViewing(null)}
      />
    </div>
  );
}

const fmtDate = (d: string | null) =>
  d ? format(new Date(`${d.slice(0, 10)}T00:00:00`), "dd MMM yyyy") : null;

function detailFields(
  emp: Employee,
  t: (k: string) => string,
): DetailField[] {
  return [
    { label: t("master.employees.fields.fullName"), value: emp.full_name },
    {
      label: t("master.employees.fields.employeeNumber"),
      value: emp.employee_number,
    },
    { label: t("master.employees.columns.role"), value: emp.role_title },
    { label: t("master.employees.fields.department"), value: emp.department },
    {
      label: t("master.employees.fields.employmentType"),
      value: t(`master.employees.employmentTypes.${emp.employment_type}`),
    },
    {
      label: t("master.employees.columns.status"),
      value:
        emp.status === "Active" ? t("common.active") : t("common.inactive"),
    },
    { label: t("master.employees.fields.joinDate"), value: fmtDate(emp.join_date) },
    {
      label: t("master.employees.fields.resignDate"),
      value: fmtDate(emp.resign_date),
    },
    {
      label: t("master.employees.fields.leaveQuota"),
      value: emp.annual_leave_quota,
    },
    {
      label: t("master.employees.columns.joined"),
      value: format(new Date(emp.created_at), "dd MMM yyyy"),
    },
  ];
}
