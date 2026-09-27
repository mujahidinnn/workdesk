import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { addDays, format, parseISO } from "date-fns";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePickerField } from "@/components/ui/time-picker-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  calcDurationHours,
  useEmployeeRates,
} from "@/hooks/useOvertimeRecords";
import { useAuth } from "@/context/auth";
import type {
  OvertimeRecordWithRelations,
  OvertimeType,
  Project,
} from "@/lib/types";
import { cn } from "@/lib/utils";

// Hours and money are not here: the server computes both on save.
export interface OvertimeFormValues {
  type: OvertimeType;
  date: string;
  /** Day the shift ends. Same as date, date + 1 overnight, null for a trip. */
  end_date: string | null;
  start_time: string;
  end_time: string;
  project_id: number | null;
  activity_description: string;
}

// The switch is easier to fill in than a second date field, and the database
// only allows the next day anyway.
type FormState = Omit<OvertimeFormValues, "end_date"> & { overnight: boolean };

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  record?: OvertimeRecordWithRelations | null;
  projects: Project[];
  isSaving: boolean;
  onSubmit: (values: OvertimeFormValues) => void;
}

const EMPTY: FormState = {
  type: "Overtime",
  date: format(new Date(), "yyyy-MM-dd"),
  overnight: false,
  start_time: "",
  end_time: "",
  project_id: null,
  activity_description: "",
};

const TYPES: OvertimeType[] = [
  "Overtime",
  "BusinessTrip_Local",
  "BusinessTrip_OutOfTown",
];

export function OvertimeFormDialog({
  open,
  onOpenChange,
  record,
  projects,
  isSaving,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [form, setForm] = useState<FormState>(EMPTY);
  const { data: rates = [] } = useEmployeeRates();
  const myRate =
    rates.find((r) => r.profile_id === (record?.user_id ?? user?.id)) ?? null;

  useEffect(() => {
    if (open) {
      if (record) {
        setForm({
          type: record.type,
          date: record.date,
          overnight: Boolean(
            record.end_date && record.end_date !== record.date,
          ),
          start_time: record.start_time ?? "",
          end_time: record.end_time ?? "",
          project_id: record.project_id,
          activity_description: record.activity_description,
        });
      } else {
        setForm(EMPTY);
      }
    }
  }, [open, record]);

  const set = <K extends keyof FormState>(key: K, val: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: val }));

  const isOvertime = form.type === "Overtime";
  const isTrip =
    form.type === "BusinessTrip_Local" ||
    form.type === "BusinessTrip_OutOfTown";

  const overnight = isOvertime && form.overnight;
  const derivedDuration =
    isOvertime && form.start_time && form.end_time
      ? calcDurationHours(form.start_time, form.end_time, overnight)
      : null;

  // Money never comes from the employee. Trips use the flat trip rate, overtime
  // is hours times the hourly rate. Both rates are set by the admin.
  const rateUsed = isOvertime
    ? (myRate?.overtime_rate ?? 0)
    : form.type === "BusinessTrip_Local"
      ? (myRate?.local_trip_rate ?? 0)
      : (myRate?.out_of_town_rate ?? 0);
  const derivedAllowance = isOvertime
    ? Math.round((derivedDuration ?? 0) * rateUsed)
    : rateUsed;

  const today = format(new Date(), "yyyy-MM-dd");
  // Plain string compare is enough, both sides are yyyy-MM-dd.
  const error =
    form.date > today
      ? t("overtime.form.errFutureDate")
      : isOvertime &&
          form.start_time &&
          form.end_time &&
          (derivedDuration ?? 0) <= 0
        ? t("overtime.form.errTimeOrder")
        : (derivedDuration ?? 0) > 24
          ? t("overtime.form.errMaxDuration")
          : null;

  const canSubmit = Boolean(
    form.type &&
    form.date &&
    form.activity_description.trim() &&
    (!isOvertime || (form.start_time && form.end_time && derivedDuration)) &&
    !error,
  );

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    const { overnight: _overnight, ...rest } = form;
    onSubmit({
      ...rest,
      // A trip has no end_date, an overnight shift ends the next day.
      end_date: !isOvertime
        ? null
        : overnight
          ? format(addDays(parseISO(form.date), 1), "yyyy-MM-dd")
          : form.date,
    });
  }

  const typeAccent: Record<OvertimeType, string> = {
    Overtime: "text-amber-600 dark:text-amber-400",
    BusinessTrip_Local: "text-blue-600 dark:text-blue-400",
    BusinessTrip_OutOfTown: "text-violet-600 dark:text-violet-400",
  };

  return (
    <Dialog open={open} onOpenChange={isSaving ? undefined : onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle
            className={cn("text-base font-semibold", typeAccent[form.type])}
          >
            {record ? t("overtime.form.editTitle") : t("overtime.form.title")}
          </DialogTitle>
        </DialogHeader>

        {record?.status === "Rejected" && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-900/30 rounded-lg px-3 py-2">
            {t("overtime.form.resubmitNote")}
          </p>
        )}

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">
              {t("overtime.form.type")}
            </Label>
            <Select
              value={form.type}
              onValueChange={(v) => set("type", v as OvertimeType)}
            >
              <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
                <SelectValue placeholder={t("overtime.form.selectType")} />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {TYPES.map((tp) => (
                  <SelectItem key={tp} value={tp} className="text-sm">
                    {t(`overtime.type.${tp}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <DatePickerField
            label={t("overtime.form.date")}
            value={form.date || null}
            onChange={(v) => set("date", v ?? "")}
            required
          />

          {isOvertime && (
            <div className="grid grid-cols-2 gap-3">
              <TimePickerField
                label={t("overtime.form.startTime")}
                value={form.start_time}
                onChange={(v) => set("start_time", v)}
              />
              <TimePickerField
                label={t("overtime.form.endTime")}
                value={form.end_time}
                onChange={(v) => set("end_time", v)}
              />
            </div>
          )}

          {/* Overnight shift, so 22:00 to 02:00 is four hours and not a typo */}
          {isOvertime && (
            <div className="flex items-center justify-between gap-3 px-3 py-2 rounded-lg bg-secondary border border-border">
              <Label
                htmlFor="overtime-overnight"
                className="text-xs font-medium text-foreground"
              >
                {t("overtime.form.overnight")}
              </Label>
              <Switch
                id="overtime-overnight"
                checked={form.overnight}
                onCheckedChange={(v) => set("overnight", v)}
              />
            </div>
          )}

          {isOvertime && derivedDuration !== null && derivedDuration > 0 && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-900/30">
              <span className="text-[11px] text-muted-foreground">
                {t("overtime.form.duration")}:
              </span>
              <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
                {t("overtime.form.durationValue", { hours: derivedDuration })}
              </span>
            </div>
          )}

          {(isTrip || derivedDuration !== null) && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs font-medium text-foreground">
                {isOvertime
                  ? t("overtime.form.overtimePay")
                  : t("overtime.form.dailyAllowance")}
              </Label>
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary border border-border">
                <span className="text-xs text-muted-foreground font-mono">
                  IDR
                </span>
                <span className="text-sm font-semibold text-foreground">
                  {derivedAllowance.toLocaleString("id-ID")}
                </span>
              </div>
              <p
                className={cn(
                  "text-[11px]",
                  myRate
                    ? "text-muted-foreground"
                    : "text-amber-600 dark:text-amber-400",
                )}
              >
                {myRate
                  ? t("overtime.form.allowanceFromRate")
                  : t("overtime.form.noRateHint")}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {t("overtime.form.serverConfirms")}
              </p>
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">
              {t("overtime.form.project")}{" "}
              <span className="text-muted-foreground">
                {t("overtime.form.projectOptional")}
              </span>
            </Label>
            <Select
              value={form.project_id?.toString() ?? "none"}
              onValueChange={(v) =>
                set("project_id", v === "none" ? null : Number(v))
              }
            >
              <SelectTrigger className="bg-secondary border-border text-sm h-9 text-foreground">
                <SelectValue
                  placeholder={`- ${t("overtime.form.projectOptional")}`}
                />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                <SelectItem
                  value="none"
                  className="text-sm text-muted-foreground"
                >
                  - {t("overtime.form.projectOptional")}
                </SelectItem>
                {projects.map((p) => (
                  <SelectItem
                    key={p.id}
                    value={p.id.toString()}
                    className="text-sm"
                  >
                    <span className="font-mono text-emerald-600 dark:text-emerald-400 text-xs mr-2">
                      {p.project_code}
                    </span>
                    {p.project_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">
              {t("overtime.form.description")}
            </Label>
            <Textarea
              value={form.activity_description}
              onChange={(e) => set("activity_description", e.target.value)}
              placeholder={t("overtime.form.descPlaceholder")}
              required
              rows={3}
              className="bg-secondary border-border text-foreground text-sm resize-none"
            />
          </div>

          {error && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              className="flex-1 border-border text-foreground"
              onClick={() => onOpenChange(false)}
              disabled={isSaving}
            >
              {t("common.cancel")}
            </Button>
            <Button
              type="submit"
              className="flex-1"
              disabled={isSaving || !canSubmit}
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
                  {t("overtime.form.saving")}
                </>
              ) : record ? (
                t("overtime.form.update")
              ) : (
                t("overtime.form.submit")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
