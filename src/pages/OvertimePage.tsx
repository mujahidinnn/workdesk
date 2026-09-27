import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import {
  OvertimeFormDialog,
  type OvertimeFormValues,
} from "@/components/overtime/OvertimeFormDialog";
import { OvertimeTable } from "@/components/overtime/OvertimeTable";
import { AdminApprovalPanel } from "@/components/overtime/AdminApprovalPanel";
import { MonthlySummaryChart } from "@/components/overtime/MonthlySummaryChart";
import { EmployeeRatesPanel } from "@/components/overtime/EmployeeRatesPanel";
import {
  useOvertimeRecords,
  useCreateOvertimeRecord,
  useUpdateOvertimeRecord,
  useDeleteOvertimeRecord,
} from "@/hooks/useOvertimeRecords";
import { useProjects } from "@/hooks/useProjects";
import { useUsers } from "@/hooks/useUsers";
import { useAuth } from "@/context/auth";
import { useTabParam } from "@/hooks/useTabParam";
import type { OvertimeRecordWithRelations } from "@/lib/types";
import { cn } from "@/lib/utils";

type Tab = "myRequests" | "approval" | "rates";

export default function OvertimePage() {
  const { t } = useTranslation();
  const { user, profile, isAdmin } = useAuth();
  const canApprove = isAdmin() || profile?.role?.role_name === "Manager";

  const [tab, setTab] = useTabParam<Tab>(
    canApprove ? ["myRequests", "approval", "rates"] : ["myRequests"],
    "myRequests",
  );
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] =
    useState<OvertimeRecordWithRelations | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<OvertimeRecordWithRelations | null>(null);
  const location = useLocation();
  const navigate = useNavigate();

  const { data: allRecords = [], isLoading } = useOvertimeRecords();
  const { data: projects = [] } = useProjects();
  const { data: users = [] } = useUsers();

  useEffect(() => {
    if ((location.state as { openAdd?: boolean } | null)?.openAdd) {
      setFormOpen(true);
      navigate(location.pathname + location.search, {
        replace: true,
        state: null,
      });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const createRecord = useCreateOvertimeRecord();
  const updateRecord = useUpdateOvertimeRecord();
  const deleteRecord = useDeleteOvertimeRecord();

  const profilesList = users.map((u) => ({ id: u.id, full_name: u.full_name }));

  function handleAdd() {
    setEditingRecord(null);
    setFormOpen(true);
  }

  function handleEdit(r: OvertimeRecordWithRelations) {
    setEditingRecord(r);
    setFormOpen(true);
  }

  function handleDelete(r: OvertimeRecordWithRelations) {
    setDeleteTarget(r);
  }

  function handleDeleteConfirm() {
    if (!deleteTarget) return;
    deleteRecord.mutate(deleteTarget.id, {
      onSettled: () => setDeleteTarget(null),
    });
  }

  function handleFormSubmit(values: OvertimeFormValues) {
    if (!user) return;
    const isOvertime = values.type === "Overtime";
    const payload = {
      user_id: user.id,
      type: values.type,
      date: values.date,
      // Only an overtime shift can end on another day.
      end_date: isOvertime ? values.end_date : null,
      start_time: isOvertime ? values.start_time || null : null,
      end_time: isOvertime ? values.end_time || null : null,
      project_id: values.project_id,
      activity_description: values.activity_description.trim(),
      // duration_hours and daily_allowance are computed by the database.
      status: "Pending" as const,
    };
    if (editingRecord) {
      // One write so the resubmit resets status and clears the rejection note together.
      updateRecord.mutate(
        { id: editingRecord.id, ...payload, rejection_note: null },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createRecord.mutate(payload, { onSuccess: () => setFormOpen(false) });
    }
  }

  const TABS: { key: Tab; label: string }[] = [
    { key: "myRequests", label: t("overtime.tabs.myRequests") },
    ...(canApprove
      ? [
          { key: "approval" as Tab, label: t("overtime.tabs.approval") },
          { key: "rates" as Tab, label: t("overtime.rates.title") },
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
            {t("overtime.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("overtime.subtitle")}
          </p>
        </div>
        <Button
          data-tour="overtime-new"
          size="sm"
          onClick={handleAdd}
          className="gap-1.5"
        >
          <Plus className="w-3.5 h-3.5" />
          {t("overtime.newRequest")}
        </Button>
      </motion.div>

      {!isLoading && (
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
        >
          <MonthlySummaryChart
            records={allRecords}
            currentUserId={user?.id ?? ""}
            isAdmin={canApprove}
          />
        </motion.div>
      )}

      {canApprove && (
        <div
          data-tour="overtime-tabs"
          className="flex gap-0.5 p-0.5 bg-segment rounded-lg border border-border w-fit max-w-full overflow-x-auto scrollbar-thin"
        >
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              data-tour={`overtime-tabbtn-${key}`}
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
        data-tour={`overtime-content-${tab}`}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="glass-card rounded-xl p-4 flex-1"
      >
        {tab === "myRequests" || !canApprove ? (
          <OvertimeTable
            currentUserId={user?.id ?? ""}
            projects={projects}
            showEmployee={false}
            onEdit={handleEdit}
            onDelete={handleDelete}
          />
        ) : tab === "approval" ? (
          <AdminApprovalPanel
            currentUserId={user?.id ?? ""}
            projects={projects}
            profiles={profilesList}
          />
        ) : (
          <EmployeeRatesPanel
            profiles={profilesList}
            currentUserId={user?.id ?? ""}
          />
        )}
      </motion.div>

      <OvertimeFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        record={editingRecord}
        projects={projects}
        isSaving={createRecord.isPending || updateRecord.isPending}
        onSubmit={handleFormSubmit}
      />

      <DeleteConfirmationModal
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title={t("overtime.delete.title")}
        description={t("overtime.delete.desc")}
        onConfirm={handleDeleteConfirm}
        isPending={deleteRecord.isPending}
      />
    </div>
  );
}
