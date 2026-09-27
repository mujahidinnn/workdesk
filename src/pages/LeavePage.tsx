import { useState } from "react";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { AccessControl } from "@/components/auth/AccessControl";
import {
  LeaveFormDialog,
  type LeaveFormValues,
} from "@/components/leave/LeaveFormDialog";
import { LeaveTable } from "@/components/leave/LeaveTable";
import { LeaveApprovalPanel } from "@/components/leave/LeaveApprovalPanel";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { Toolbar } from "@/components/master-hub/MasterSection";
import {
  useLeaveRequests,
  useLeaveBalance,
  useCreateLeaveRequest,
  useUpdateLeaveRequest,
  useDeleteLeaveRequest,
  type LeaveFilters,
} from "@/hooks/useLeaveRequests";
import { useUsers } from "@/hooks/useUsers";
import { useAuth } from "@/context/auth";
import { useTabParam } from "@/hooks/useTabParam";
import type {
  LeaveRequestWithProfile,
  LeaveStatus,
  LeaveType,
} from "@/lib/types";
import { cn } from "@/lib/utils";
import { DateRangeFilter } from "@/components/master-hub/DateRangeFilter";

type Tab = "myRequests" | "approval";

const STATUSES: LeaveStatus[] = ["Pending", "Approved", "Rejected"];
const TYPES: LeaveType[] = ["Cuti", "Izin", "Sakit"];

export default function LeavePage() {
  const { t } = useTranslation();
  const { user, profile, canUpdate } = useAuth();
  const canApprove = canUpdate("leave");
  const year = new Date().getFullYear();

  const [tab, setTab] = useTabParam<Tab>(
    canApprove ? ["myRequests", "approval"] : ["myRequests"],
    "myRequests",
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<LeaveRequestWithProfile | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<LeaveRequestWithProfile | null>(null);

  const [myFilters, setMyFilters] = useState<LeaveFilters>({});
  const [approvalFilters, setApprovalFilters] = useState<LeaveFilters>({});
  const filters = tab === "approval" ? approvalFilters : myFilters;
  const setFilter = (patch: LeaveFilters) =>
    (tab === "approval" ? setApprovalFilters : setMyFilters)((f) => ({
      ...f,
      ...patch,
    }));

  // Own requests are never approvable, the database rejects self-approval.
  const approvalBase: LeaveFilters = {
    status: "Pending",
    excludeUserId: user?.id,
  };
  const { data: myRequests = [], isLoading: myLoading } = useLeaveRequests({
    ...myFilters,
    userId: user?.id,
  });
  const { data: toApprove = [], isLoading: approvalLoading } =
    useLeaveRequests({ ...approvalFilters, ...approvalBase });
  const { data: pending = [] } = useLeaveRequests(approvalBase);
  const { data: allUsers = [] } = useUsers();
  const employeeOptions = allUsers
    .filter((u) => !u.is_superadmin && u.id !== user?.id)
    .map((u) => ({ value: u.id, label: u.full_name ?? u.email }));
  const isLoading = tab === "approval" ? approvalLoading : myLoading;
  const balance = useLeaveBalance(user?.id, profile?.employee_id, year);

  const createRequest = useCreateLeaveRequest();
  const updateRequest = useUpdateLeaveRequest();
  const deleteRequest = useDeleteLeaveRequest();

  function handleFormSubmit(values: LeaveFormValues) {
    if (!user) return;
    if (editing) {
      // Saving requeues the request, so a stale rejection note no longer applies.
      updateRequest.mutate(
        { id: editing.id, ...values, status: "Pending", rejection_note: null },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createRequest.mutate(
        { user_id: user.id, ...values },
        { onSuccess: () => setFormOpen(false) },
      );
    }
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteRequest.mutate(deleteTarget.id, {
      onSettled: () => setDeleteTarget(null),
    });
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "myRequests", label: t("leave.tabs.myRequests") },
    ...(canApprove
      ? [
          {
            key: "approval" as Tab,
            label: `${t("leave.tabs.approval")}${pending.length ? ` (${pending.length})` : ""}`,
          },
        ]
      : []),
  ];

  return (
    <div className="flex flex-col gap-4 sm:gap-6 h-full">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            {t("leave.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("leave.subtitle")}
          </p>
        </div>
        <AccessControl feature="leave" action="create">
          <Button
            size="sm"
            className="gap-1.5"
            onClick={() => {
              setEditing(null);
              setFormOpen(true);
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            {t("leave.newRequest")}
          </Button>
        </AccessControl>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.05 }}
        className="glass-card rounded-xl px-4 py-3 flex items-center justify-between gap-4 w-full sm:w-fit sm:min-w-[320px]"
      >
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground">
            {t("leave.balance.title", { year })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("leave.balance.used", {
              used: balance.used,
              quota: balance.quota,
            })}
          </p>
        </div>
        <div className="text-right">
          <span className="text-xl sm:text-2xl font-bold text-foreground tabular-nums">
            {balance.remaining}
          </span>
          <span className="text-xs text-muted-foreground ml-1">
            {t("leave.balance.days")}
          </span>
        </div>
      </motion.div>

      {canApprove && (
        <div className="flex gap-0.5 p-0.5 bg-segment rounded-lg border border-border w-fit max-w-full overflow-x-auto scrollbar-thin">
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setTab(key)}
              className={cn(
                "px-3 sm:px-4 py-1.5 rounded-md text-xs sm:text-sm font-medium transition-all whitespace-nowrap",
                tab === key
                  ? "bg-card text-foreground border border-border shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="glass-card rounded-xl p-3 sm:p-4 flex-1 flex flex-col gap-3 sm:gap-4"
      >
        <Toolbar>
          {tab === "approval" && canApprove ? (
            <FilterSelect
              value={filters.userId}
              onChange={(userId) => setFilter({ userId })}
              allLabel={t("export.filters.allEmployees")}
              options={employeeOptions}
            />
          ) : (
            <FilterSelect
              value={filters.status}
              onChange={(status) => setFilter({ status })}
              allLabel={t("master.filters.allStatuses")}
              options={STATUSES.map((s) => ({
                value: s,
                label: t(`overtime.status.${s}`),
              }))}
            />
          )}
          <FilterSelect
            value={filters.type}
            onChange={(type) => setFilter({ type })}
            allLabel={t("master.filters.allTypes")}
            options={TYPES.map((v) => ({
              value: v,
              label: t(`leave.type.${v}`),
            }))}
          />
          <DateRangeFilter value={filters} onChange={setFilter} />
        </Toolbar>
        {isLoading ? (
          <div className="space-y-3 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-10 rounded-lg bg-secondary animate-pulse"
              />
            ))}
          </div>
        ) : tab === "approval" && canApprove ? (
          <LeaveApprovalPanel requests={toApprove} />
        ) : (
          <LeaveTable
            requests={myRequests}
            onEdit={(r) => {
              setEditing(r);
              setFormOpen(true);
            }}
            onDelete={setDeleteTarget}
          />
        )}
      </motion.div>

      <LeaveFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        request={editing}
        isSaving={createRequest.isPending || updateRequest.isPending}
        onSubmit={handleFormSubmit}
      />

      <DeleteConfirmationModal
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title={t("leave.delete.title")}
        description={t("leave.delete.desc")}
        onConfirm={handleDeleteConfirm}
        isPending={deleteRequest.isPending}
      />
    </div>
  );
}
