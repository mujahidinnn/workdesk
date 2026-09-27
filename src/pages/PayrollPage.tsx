import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { FileDown, Lock, RefreshCw, Trash2, Wallet } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { PayrollLinesTable } from "@/components/payroll/PayrollLinesTable";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { SearchInput, Toolbar } from "@/components/master-hub/MasterSection";
import {
  useDeletePayrollRun,
  useFinalizePayrollRun,
  useGeneratePayrollRun,
  usePayrollLines,
  usePayrollRuns,
  useSetPaymentStatus,
  useUpdatePayrollDeductions,
  type PayrollLineFilters,
} from "@/hooks/usePayroll";
import { useUsers } from "@/hooks/useUsers";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import { downloadPayslips } from "@/lib/payslip";
import { useAuth } from "@/context/auth";
import type { EmploymentType, PayrollLineWithName } from "@/lib/types";
import { cn } from "@/lib/utils";

const money = (n: number) => Math.round(n).toLocaleString("id-ID");

const EMPLOYMENT_TYPES: EmploymentType[] = [
  "Permanent",
  "Contract",
  "Probation",
  "Intern",
];

export default function PayrollPage() {
  const { t } = useTranslation();
  const { canUpdate } = useAuth();
  const canManage = canUpdate("payroll");

  // Any day works: the server truncates to the first of the month.
  const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM-01"));
  const [selectedRunId, setSelectedRunId] = useState<number | null>(null);
  const [confirmFinalize, setConfirmFinalize] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [filters, setFilters] = useState<PayrollLineFilters>({});
  const [search, setSearch] = useState("");

  const { data: runs = [], isLoading } = usePayrollRuns();
  const { data: users = [] } = useUsers();
  const companyName = useWorkSchedule().data?.company_name ?? "WorkDesk";

  // Default to the newest run, the one being worked on.
  const activeRun = runs.find((r) => r.id === selectedRunId) ?? runs[0] ?? null;
  const { data: lines = [] } = usePayrollLines(
    activeRun?.id ?? null,
    filters,
  );

  const generateRun = useGeneratePayrollRun();
  const finalizeRun = useFinalizePayrollRun();
  const deleteRun = useDeletePayrollRun();
  const updateDeductions = useUpdatePayrollDeductions();
  const setPaymentStatus = useSetPaymentStatus();

  const namedLines: PayrollLineWithName[] = useMemo(
    () =>
      lines
        .map((line) => {
          const user = users.find((u) => u.id === line.user_id);
          return {
            ...line,
            name: user?.full_name ?? t("payroll.unknownEmployee"),
            job_title: user?.employee_role_title,
          };
        })
        // Names are joined client-side from useUsers, so search can't be server-side.
        .filter((line) =>
          line.name.toLowerCase().includes(search.trim().toLowerCase()),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [lines, users, t, search],
  );

  const totals = useMemo(
    () =>
      namedLines.reduce(
        (acc, l) => ({
          gross: acc.gross + l.gross,
          net: acc.net + l.net,
          paid: acc.paid + (l.payment_status === "Paid" ? 1 : 0),
        }),
        { gross: 0, net: 0, paid: 0 },
      ),
    [namedLines],
  );

  const isDraft = activeRun?.status === "Draft";

  return (
    <div className="flex flex-col gap-4 sm:gap-6 h-full">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex items-start justify-between gap-4 flex-wrap"
      >
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            {t("payroll.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("payroll.subtitle")}
          </p>
        </div>

        {canManage && (
          <div className="flex items-end gap-2">
            <DatePickerField
              label={t("payroll.period")}
              value={month}
              onChange={(d) => d && setMonth(d)}
              className="w-40"
            />
            <Button
              size="sm"
              className="gap-1.5"
              disabled={generateRun.isPending}
              onClick={() =>
                generateRun.mutate(
                  format(parseISO(month), "yyyy-MM-01"),
                  { onSuccess: (runId) => setSelectedRunId(runId) },
                )
              }
            >
              <RefreshCw
                className={cn(
                  "w-3.5 h-3.5",
                  generateRun.isPending && "animate-spin",
                )}
              />
              {t("payroll.generate")}
            </Button>
          </div>
        )}
      </motion.div>

      {runs.length > 0 && (
        <div className="flex gap-1.5 flex-wrap">
          {runs.map((run) => (
            <button
              key={run.id}
              onClick={() => setSelectedRunId(run.id)}
              className={cn(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                run.id === activeRun?.id
                  ? "bg-secondary text-foreground border-border"
                  : "text-muted-foreground border-transparent hover:text-foreground",
              )}
            >
              {format(parseISO(run.period), "MMM yyyy")}
              {run.status === "Finalized" && (
                <Lock className="w-2.5 h-2.5 inline ml-1.5 -mt-0.5" />
              )}
            </button>
          ))}
        </div>
      )}

      {activeRun && (
        <div className="flex items-center justify-between gap-4 flex-wrap glass-card rounded-xl px-4 py-3">
          <div className="flex gap-4 sm:gap-6">
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("payroll.table.gross")}
              </p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {money(totals.gross)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("payroll.table.net")}
              </p>
              <p className="text-lg font-bold text-emerald-600 dark:text-emerald-500 tabular-nums">
                {money(totals.net)}
              </p>
            </div>
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
                {t("payroll.paidCount")}
              </p>
              <p className="text-lg font-bold text-foreground tabular-nums">
                {totals.paid}/{namedLines.length}
              </p>
            </div>
          </div>

          {/* One action group on the right; the primary action stays last. */}
          <div className="flex items-center gap-2 flex-wrap ml-auto">
            {!isDraft && (
              <p className="text-[11px] text-muted-foreground mr-1">
                {t("payroll.finalizedOn", {
                  date: activeRun.finalized_at
                    ? format(parseISO(activeRun.finalized_at), "dd MMM yyyy")
                    : "-",
                })}
              </p>
            )}
            {canManage && namedLines.length > 1 && (
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5"
                onClick={() =>
                  downloadPayslips(namedLines, activeRun.period, companyName)
                }
              >
                <FileDown className="w-3.5 h-3.5" />
                {t("payroll.slipAll")}
              </Button>
            )}
            {canManage && isDraft && (
              <>
                <Button
                  size="sm"
                  variant="ghost"
                  className="gap-1.5 text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  {t("common.delete")}
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => setConfirmFinalize(true)}
                >
                  <Lock className="w-3.5 h-3.5" />
                  {t("payroll.finalize")}
                </Button>
              </>
            )}
          </div>
        </div>
      )}

      {!isLoading && !activeRun ? (
        <EmptyState
          icon={Wallet}
          title={t("payroll.noRuns")}
          description={
            canManage ? t("payroll.noRunsHint") : t("payroll.noRunsEmployee")
          }
        />
      ) : (
        activeRun && (
          <>
            <Toolbar>
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder={t("payroll.search")}
              />
              <FilterSelect
                value={filters.paymentStatus}
                onChange={(paymentStatus) =>
                  setFilters({ ...filters, paymentStatus })
                }
                allLabel={t("master.filters.allStatuses")}
                options={(["Unpaid", "Paid"] as const).map((status) => ({
                  value: status,
                  label: t(`payroll.payment.${status}`),
                }))}
              />
              <FilterSelect
                value={filters.employmentType}
                onChange={(employmentType) =>
                  setFilters({ ...filters, employmentType })
                }
                allLabel={t("master.filters.allEmploymentTypes")}
                options={EMPLOYMENT_TYPES.map((type) => ({
                  value: type,
                  label: t(`master.employees.employmentTypes.${type}`),
                }))}
              />
            </Toolbar>
            <PayrollLinesTable
              lines={namedLines}
              period={activeRun.period}
              companyName={companyName}
              isDraft={isDraft}
              canManage={canManage}
              onSaveDeductions={(payload) => updateDeductions.mutate(payload)}
              onTogglePaid={(payload) => setPaymentStatus.mutate(payload)}
              isSaving={updateDeductions.isPending}
            />
          </>
        )
      )}

      <DeleteConfirmationModal
        open={confirmFinalize}
        onOpenChange={setConfirmFinalize}
        onConfirm={() => {
          if (activeRun) finalizeRun.mutate(activeRun.id);
          setConfirmFinalize(false);
        }}
        title={t("payroll.finalizeConfirm.title")}
        description={t("payroll.finalizeConfirm.body")}
      />

      <DeleteConfirmationModal
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        onConfirm={() => {
          if (activeRun) deleteRun.mutate(activeRun.id);
          setConfirmDelete(false);
          setSelectedRunId(null);
        }}
        title={t("payroll.deleteConfirm.title")}
        description={t("payroll.deleteConfirm.body")}
      />
    </div>
  );
}
