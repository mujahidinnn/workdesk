import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { Loader2, LogIn, LogOut, Plus } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { AttendanceTable } from "@/components/attendance/AttendanceTable";
import { AttendanceRecapPanel } from "@/components/attendance/AttendanceRecapPanel";
import { WorkScheduleSettings } from "@/components/attendance/WorkScheduleSettings";
import { AttendancePeriodFilter } from "@/components/attendance/AttendancePeriodFilter";
import { FilterSelect } from "@/components/master-hub/FilterSelect";
import { Toolbar } from "@/components/master-hub/MasterSection";
import {
  AttendanceFormDialog,
  type AttendanceFormValues,
} from "@/components/attendance/AttendanceFormDialog";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { AttendanceGateModal } from "@/components/attendance/AttendanceGateModal";
import {
  useAttendance,
  useUpdateAttendance,
  useCreateAttendanceForUser,
  useDeleteAttendance,
  useTodayAttendance,
  useCheckOut,
  useToday,
  type AttendanceFilters,
} from "@/hooks/useAttendance";
import { useHolidays } from "@/hooks/useHolidays";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import { useUsers } from "@/hooks/useUsers";
import { useAuth } from "@/context/auth";
import { useTabParam } from "@/hooks/useTabParam";
import { workHours } from "@/lib/attendance";
import { countWorkdays, periodRange } from "@/lib/workday";
import type { AttendanceStatus, AttendanceWithProfile } from "@/lib/types";
import { type PeriodType } from "@/lib/period";
import { cn } from "@/lib/utils";

type Tab = "myRecap" | "all" | "manage";

const STATUSES: AttendanceStatus[] = [
  "Hadir",
  "Izin",
  "Sakit",
  "Cuti",
  "Alpa",
];

export default function AttendancePage() {
  const { t } = useTranslation();
  const { user, isAdmin, isSuperadmin } = useAuth();
  const canManage = isAdmin();

  const [tab, setTab] = useTabParam<Tab>(
    [
      ...(isSuperadmin() ? [] : ["myRecap" as const]),
      "all",
      ...(canManage ? ["manage" as const] : []),
    ],
    isSuperadmin() ? "all" : "myRecap",
  );
  const [periodType, setPeriodType] = useState<PeriodType>("monthly");
  const [periodDate, setPeriodDate] = useState(new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [editingRecord, setEditingRecord] =
    useState<AttendanceWithProfile | null>(null);
  const [deleteTarget, setDeleteTarget] =
    useState<AttendanceWithProfile | null>(null);
  const [checkInOpen, setCheckInOpen] = useState(false);
  const [filters, setFilters] = useState<AttendanceFilters>({});

  const range = useMemo(
    () => periodRange(periodType, periodDate),
    [periodType, periodDate],
  );
  const from = format(range.start, "yyyy-MM-dd");
  const to = format(range.end, "yyyy-MM-dd");
  const { data: periodRecords = [], isLoading } = useAttendance(
    from,
    to,
    filters,
  );
  // Recap needs every status to derive Alpa, so table filters don't apply to it.
  const { data: myRecords = [] } = useAttendance(from, to, {
    userId: user?.id,
  });
  const { data: allUsers = [] } = useUsers();
  const users = allUsers.filter((u) => !u.is_superadmin);
  const { data: holidays = [] } = useHolidays();
  const { data: schedule } = useWorkSchedule();
  const updateAttendance = useUpdateAttendance();
  const createAttendance = useCreateAttendanceForUser();
  const deleteAttendance = useDeleteAttendance();

  const today = useToday();
  const { data: todayRecord } = useTodayAttendance(user?.id, today);
  const checkOut = useCheckOut();

  const workingDays = useMemo(
    () => countWorkdays(range.start, range.end, holidays, schedule),
    [range, holidays, schedule],
  );
  const openCheckIn =
    todayRecord?.status === "Hadir" &&
    !!todayRecord.clock_in &&
    !todayRecord.clock_out;
  const todayHours = todayRecord
    ? workHours(todayRecord.clock_in, todayRecord.clock_out)
    : null;

  const TABS: { key: Tab; label: string }[] = [
    ...(isSuperadmin()
      ? []
      : [{ key: "myRecap" as Tab, label: t("attendance.tabs.myRecap") }]),
    { key: "all", label: t("attendance.tabs.all") },
    ...(canManage
      ? [{ key: "manage" as Tab, label: t("attendance.tabs.manage") }]
      : []),
  ];

  const filterBar = (
    <Toolbar>
      <FilterSelect
        value={filters.userId}
        onChange={(userId) => setFilters((f) => ({ ...f, userId }))}
        allLabel={t("dailyReport.allEmployees")}
        options={users.map((u) => ({
          value: u.id,
          label: u.full_name ?? u.email,
        }))}
      />
      <FilterSelect
        value={filters.status}
        onChange={(status) => setFilters((f) => ({ ...f, status }))}
        allLabel={t("master.filters.allStatuses")}
        options={STATUSES.map((s) => ({
          value: s,
          label: t(`attendance.status.${s}`),
        }))}
      />
    </Toolbar>
  );

  function handleSubmit(values: AttendanceFormValues) {
    if (!user) return;
    if (editingRecord) {
      updateAttendance.mutate(
        {
          id: editingRecord.id,
          status: values.status,
          clock_in: values.clock_in,
          clock_out: values.clock_out,
          note: values.note,
          updated_by: user.id,
          file: values.file,
          old_path: editingRecord.attachment_path,
        },
        { onSuccess: () => setFormOpen(false) },
      );
    } else {
      createAttendance.mutate(
        { ...values, updated_by: user.id },
        { onSuccess: () => setFormOpen(false) },
      );
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6 h-full">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            {t("attendance.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("attendance.subtitle")}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {!todayRecord && !isSuperadmin() && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-border"
              onClick={() => setCheckInOpen(true)}
            >
              <LogIn className="w-3.5 h-3.5" />
              {t("attendance.today.checkIn")}
            </Button>
          )}
          {openCheckIn && (
            <Button
              size="sm"
              variant="outline"
              className="gap-1.5 border-border"
              disabled={checkOut.isPending}
              onClick={() => checkOut.mutate()}
            >
              {checkOut.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <LogOut className="w-3.5 h-3.5" />
              )}
              {t("attendance.today.checkOut")}
            </Button>
          )}
          {todayRecord && !openCheckIn && (
            <p className="text-[11px] text-muted-foreground">
              {t("attendance.today.done", {
                status: t(`attendance.status.${todayRecord.status}`),
              })}
              {todayHours !== null &&
                ` · ${todayHours.toFixed(1)} ${t("attendance.table.hours")}`}
            </p>
          )}
          {canManage && tab === "manage" && (
            <div data-tour="attendance-add">
              <Button
                size="sm"
                className="gap-1.5"
                onClick={() => {
                  setEditingRecord(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                {t("attendance.addRecord")}
              </Button>
            </div>
          )}
        </div>
      </motion.div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          data-tour="attendance-tabs"
          className="flex gap-0.5 p-0.5 bg-segment rounded-lg border border-border w-fit max-w-full overflow-x-auto scrollbar-thin"
        >
          {TABS.map(({ key, label }) => (
            <button
              key={key}
              data-tour={`attendance-tabbtn-${key}`}
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

        <div data-tour="attendance-period">
          <AttendancePeriodFilter
            periodType={periodType}
            onPeriodTypeChange={setPeriodType}
            date={periodDate}
            onDateChange={setPeriodDate}
          />
        </div>
      </div>

      <motion.div
        key={tab}
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.15 }}
        className="flex-1"
      >
        {tab === "myRecap" ? (
          <div data-tour="attendance-content-myRecap">
            <AttendanceRecapPanel
              records={myRecords}
              workingDays={workingDays}
            />
          </div>
        ) : tab === "all" ? (
          <div
            data-tour="attendance-content-all"
            className="flex flex-col gap-3"
          >
            {filterBar}
            <AttendanceTable
              records={periodRecords}
              readOnly
              isLoading={isLoading}
            />
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <div data-tour="attendance-schedule">
              <WorkScheduleSettings />
            </div>
            <div data-tour="attendance-table" className="flex flex-col gap-3">
              {filterBar}
              <AttendanceTable
                records={periodRecords}
                isLoading={isLoading}
                onEdit={(r) => {
                  setEditingRecord(r);
                  setFormOpen(true);
                }}
                onDelete={(r) => setDeleteTarget(r)}
              />
            </div>
          </div>
        )}
      </motion.div>

      <AttendanceGateModal open={checkInOpen} onOpenChange={setCheckInOpen} />

      <AttendanceFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        record={editingRecord}
        users={users}
        onSubmit={handleSubmit}
        loading={updateAttendance.isPending || createAttendance.isPending}
      />

      <DeleteConfirmationModal
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title={t("attendance.delete.title")}
        description={t("attendance.delete.desc")}
        onConfirm={() => {
          if (deleteTarget) deleteAttendance.mutate(deleteTarget);
          setDeleteTarget(null);
        }}
        isPending={deleteAttendance.isPending}
      />
    </div>
  );
}
