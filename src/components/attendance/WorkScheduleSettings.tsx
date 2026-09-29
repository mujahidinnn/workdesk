import { useEffect, useState } from "react";
import { Clock, Pencil } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { TimePickerField } from "@/components/ui/time-picker-field";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { useAuth } from "@/context/auth";
import {
  useWorkSchedule,
  useUpdateWorkSchedule,
} from "@/hooks/useWorkSchedule";
import { cn } from "@/lib/utils";

// ISO weekdays, 1 = Monday .. 7 = Sunday, same order the database stores.
const ISO_DAYS = [1, 2, 3, 4, 5, 6, 7];

export function WorkScheduleSettings() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { data: schedule } = useWorkSchedule();
  const updateSchedule = useUpdateWorkSchedule();

  const [clockIn, setClockIn] = useState("08:00");
  const [clockOut, setClockOut] = useState("17:00");
  const [tolerance, setTolerance] = useState(0);
  const [timezone, setTimezone] = useState("Asia/Jakarta");
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);
  const [lockedUntil, setLockedUntil] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [editing, setEditing] = useState(false);

  function reset() {
    if (schedule) {
      setClockIn(schedule.clock_in_time.slice(0, 5));
      setClockOut(schedule.clock_out_time.slice(0, 5));
      setTolerance(schedule.late_tolerance_minutes);
      setTimezone(schedule.timezone);
      setWorkDays(schedule.work_days ?? [1, 2, 3, 4, 5]);
      setLockedUntil(schedule.locked_until);
      setCompanyName(schedule.company_name);
    }
  }

  useEffect(reset, [schedule]);

  if (!schedule) return null;

  const dirty =
    clockIn !== schedule.clock_in_time.slice(0, 5) ||
    clockOut !== schedule.clock_out_time.slice(0, 5) ||
    tolerance !== schedule.late_tolerance_minutes ||
    timezone !== schedule.timezone ||
    lockedUntil !== schedule.locked_until ||
    companyName !== schedule.company_name ||
    workDays.join() !== [...(schedule.work_days ?? [])].sort().join();

  function toggleDay(day: number) {
    setWorkDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b),
    );
  }

  function handleSave() {
    if (!user) return;
    updateSchedule.mutate({
      id: schedule!.id,
      clock_in_time: `${clockIn}:00`,
      clock_out_time: `${clockOut}:00`,
      late_tolerance_minutes: tolerance,
      timezone: timezone.trim() || "Asia/Jakarta",
      work_days: workDays,
      locked_until: lockedUntil,
      company_name: companyName.trim() || "WorkDesk",
      updated_by: user.id,
    }, { onSuccess: () => setEditing(false) });
  }

  return (
    <div className="rounded-xl border border-border bg-card p-4 flex flex-wrap items-end gap-3">
      <div className="flex items-center gap-2 pr-2">
        <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
          <Clock className="w-4 h-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-sm font-semibold text-foreground">
            {t("attendance.schedule.title")}
          </p>
          <p className="text-[11px] text-muted-foreground">
            {t("attendance.schedule.subtitle")}
          </p>
        </div>
      </div>

      <fieldset disabled={!editing} className="contents">
      <TimePickerField
        label={t("attendance.dialog.clockIn")}
        value={clockIn}
        onChange={setClockIn}
        className="w-28"
      />

      <TimePickerField
        label={t("attendance.dialog.clockOut")}
        value={clockOut}
        onChange={setClockOut}
        className="w-28"
      />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground font-medium">
          {t("attendance.schedule.tolerance")}
        </Label>
        <Input
          type="number"
          min={0}
          value={tolerance}
          onChange={(e) => setTolerance(Math.max(0, Number(e.target.value)))}
          className="bg-secondary border-border text-foreground text-sm h-9 w-20"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground font-medium">
          {t("attendance.schedule.timezone")}
        </Label>
        <Input
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
          placeholder="Asia/Jakarta"
          className="bg-secondary border-border text-foreground text-sm h-9 w-36"
        />
      </div>

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground font-medium">
          {t("attendance.schedule.workDays")}
        </Label>
        <div className="flex gap-1">
          {ISO_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={cn(
                "w-9 h-9 rounded-md border text-[11px] font-medium transition-colors",
                workDays.includes(day)
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-secondary text-muted-foreground hover:text-foreground",
              )}
            >
              {t(`attendance.schedule.days.${day}`)}
            </button>
          ))}
        </div>
      </div>

      <DatePickerField
        label={t("attendance.schedule.lockedUntil")}
        value={lockedUntil}
        onChange={setLockedUntil}
        placeholder={t("attendance.schedule.lockedUntilNone")}
        className="w-40"
      />

      <div className="space-y-1.5">
        <Label className="text-xs text-muted-foreground font-medium">
          {t("attendance.schedule.companyName")}
        </Label>
        <Input
          value={companyName}
          onChange={(e) => setCompanyName(e.target.value)}
          placeholder="WorkDesk"
          className="bg-secondary border-border text-foreground text-sm h-9 w-44"
        />
      </div>
      </fieldset>

      {!editing ? (
        <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
          <Pencil className="w-3.5 h-3.5 mr-1.5" />
          {t("common.edit")}
        </Button>
      ) : (
      <>
      <Button
        size="sm"
        variant="ghost"
        disabled={updateSchedule.isPending}
        onClick={() => {
          reset();
          setEditing(false);
        }}
      >
        {t("common.cancel")}
      </Button>
      <Button
        size="sm"
        disabled={!dirty}
        loading={updateSchedule.isPending}
        onClick={handleSave}
        className="bg-primary text-primary-foreground hover:bg-primary/90"
      >
        {updateSchedule.isPending ? t("common.saving") : t("common.save")}
      </Button>
      </>
      )}
    </div>
  );
}
