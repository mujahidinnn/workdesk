import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { format } from "date-fns";
import { CalendarDays, Plus, RefreshCw, Trash2, Loader2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Calendar } from "@/components/ui/calendar";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AccessControl } from "@/components/auth/AccessControl";
import { EmptyState } from "@/components/ui/EmptyState";
import { DeleteConfirmationModal } from "@/components/ui/DeleteConfirmationModal";
import { HolidayFormDialog } from "@/components/calendar/HolidayFormDialog";
import {
  useHolidays,
  useCreateHoliday,
  useDeleteHoliday,
  useSyncNationalHolidays,
} from "@/hooks/useHolidays";
import { useAuth } from "@/context/auth";
import type { Holiday } from "@/lib/types";

const CURRENT_YEAR = new Date().getFullYear();
// Years past the official dataset are computed estimates (useSyncNationalHolidays).
const SYNC_YEAR_OPTIONS = Array.from(
  { length: 9 },
  (_, i) => CURRENT_YEAR - 3 + i,
);

export default function CalendarPage() {
  const { t } = useTranslation();
  const { canCreate, canDelete } = useAuth();
  const canManage = canCreate("holidays");

  const [syncYear, setSyncYear] = useState<number | null>(null);
  const [displayMonth, setDisplayMonth] = useState(new Date());
  const [formOpen, setFormOpen] = useState(false);
  const [formDate, setFormDate] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Holiday | null>(null);

  const { data: holidays = [], isLoading } = useHolidays();
  const createHoliday = useCreateHoliday();
  const deleteHoliday = useDeleteHoliday();
  const syncHolidays = useSyncNationalHolidays();

  const effectiveSyncYear = syncYear ?? CURRENT_YEAR;

  const holidayDates = useMemo(
    () => holidays.map((h) => new Date(`${h.date}T00:00:00`)),
    [holidays],
  );

  const upcomingSorted = useMemo(
    () => [...holidays].sort((a, b) => a.date.localeCompare(b.date)),
    [holidays],
  );

  function handleYearSelect(value: string) {
    const year = Number(value);
    setSyncYear(year);
    setDisplayMonth((prev) => {
      const next = new Date(prev);
      next.setFullYear(year);
      return next;
    });
  }

  function handleMonthChange(month: Date) {
    setDisplayMonth(month);
    if (SYNC_YEAR_OPTIONS.includes(month.getFullYear())) {
      setSyncYear(month.getFullYear());
    }
  }

  function handleDayClick(day: Date) {
    if (!canManage) return;
    const dateStr = format(day, "yyyy-MM-dd");
    const existing = holidays.find((h) => h.date === dateStr);
    if (existing) {
      setDeleteTarget(existing);
    } else {
      setFormDate(dateStr);
      setFormOpen(true);
    }
  }

  return (
    <div className="flex flex-col gap-4 sm:gap-6">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex flex-wrap items-start justify-between gap-3"
      >
        <div>
          <h2 className="text-lg font-bold text-foreground tracking-tight">
            {t("calendar.title")}
          </h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("calendar.subtitle")}
          </p>
        </div>

        <AccessControl feature="holidays" action="create">
          <div className="flex flex-wrap items-center gap-2">
            <div data-tour="calendar-sync" className="flex items-center gap-2">
              <Select
                value={String(effectiveSyncYear)}
                onValueChange={handleYearSelect}
              >
                <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9 w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {SYNC_YEAR_OPTIONS.map((y) => (
                    <SelectItem key={y} value={String(y)} className="text-sm">
                      {y}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                size="sm"
                variant="outline"
                className="gap-1.5 border-border"
                disabled={syncHolidays.isPending}
                onClick={() => syncHolidays.mutate(effectiveSyncYear)}
              >
                {syncHolidays.isPending ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="w-3.5 h-3.5" />
                )}
                {t("calendar.sync")}
              </Button>
            </div>
            <div data-tour="calendar-add">
              <Button
                size="sm"
                className="gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
                onClick={() => {
                  setFormDate(null);
                  setFormOpen(true);
                }}
              >
                <Plus className="w-3.5 h-3.5" />
                {t("calendar.addHoliday")}
              </Button>
            </div>
          </div>
        </AccessControl>
      </motion.div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div
          data-tour="calendar-grid"
          className="lg:col-span-2 glass-card rounded-xl p-4 flex flex-col"
        >
          <Calendar
            month={displayMonth}
            onMonthChange={handleMonthChange}
            todayClassName="bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 font-semibold"
            modifiers={{
              weekend: { dayOfWeek: [0, 6] },
              holiday: holidayDates,
            }}
            modifiersClassNames={{
              weekend: "text-rose-500/80 dark:text-rose-400/80",
              holiday:
                "bg-rose-500/15 text-rose-600 dark:text-rose-400 font-semibold rounded-md",
            }}
            onDayClick={handleDayClick}
            className="text-foreground w-full p-0"
            classNames={{
              months: "w-full",
              month: "w-full",
              month_caption: "flex justify-center items-center h-10",
              caption_label: "text-base font-semibold",
              weekdays: "flex w-full",
              weekday: "flex-1 text-muted-foreground font-normal text-xs pb-1",
              week: "flex w-full mt-1",
              day: "flex-1 text-center text-sm p-1 relative",
              day_button: "w-full h-11 rounded-lg text-base font-normal",
            }}
          />
          <div className="flex items-center gap-4 mt-2 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500/60" />
              {t("calendar.legend.weekend")}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-rose-500" />
              {t("calendar.legend.holiday")}
            </span>
            {canManage && (
              <span className="text-muted-foreground/70">
                {t("calendar.legend.clickHint")}
              </span>
            )}
          </div>
        </div>

        <div
          data-tour="calendar-list"
          className="glass-card rounded-xl p-4 flex flex-col gap-3"
        >
          <p className="text-sm font-semibold text-foreground">
            {t("calendar.listTitle")}
            <span className="ml-2 text-xs font-normal text-muted-foreground">
              ({holidays.length})
            </span>
          </p>

          <div className="flex flex-col gap-1.5 max-h-[420px] overflow-y-auto scrollbar-thin">
            {isLoading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-12 rounded-lg bg-secondary animate-pulse"
                />
              ))
            ) : upcomingSorted.length === 0 ? (
              <EmptyState
                icon={CalendarDays}
                title={t("calendar.empty")}
                description={t("calendar.emptyHint")}
              />
            ) : (
              upcomingSorted.map((h) => (
                <div
                  key={h.id}
                  className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-secondary/50 border border-border/60 group"
                >
                  <div className="min-w-0">
                    <p className="text-xs font-medium text-foreground truncate">
                      {h.name}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {format(new Date(`${h.date}T00:00:00`), "dd MMM yyyy")}
                      {h.is_national && (
                        <span className="ml-1.5 text-primary">
                          · {t("calendar.legend.national")}
                        </span>
                      )}
                    </p>
                  </div>
                  {canDelete("holidays") && (
                    <button
                      onClick={() => setDeleteTarget(h)}
                      className="p-1.5 rounded-md text-muted-foreground opacity-0 group-hover:opacity-100 hover:text-destructive hover:bg-destructive/10 transition-all flex-shrink-0"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <HolidayFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialDate={formDate}
        onSubmit={(data) =>
          createHoliday.mutate(data, { onSuccess: () => setFormOpen(false) })
        }
        loading={createHoliday.isPending}
      />

      <DeleteConfirmationModal
        open={!!deleteTarget}
        onOpenChange={(v) => {
          if (!v) setDeleteTarget(null);
        }}
        title={t("calendar.deleteTitle")}
        description={t("calendar.deleteDesc", {
          name: deleteTarget?.name ?? "",
        })}
        onConfirm={() => {
          if (deleteTarget) deleteHoliday.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        isPending={deleteHoliday.isPending}
      />
    </div>
  );
}
