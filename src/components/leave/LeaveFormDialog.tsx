import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { DatePickerField } from "@/components/ui/date-picker-field";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { LeaveRequest, LeaveType } from "@/lib/types";

export interface LeaveFormValues {
  type: LeaveType;
  start_date: string;
  end_date: string;
  reason: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  request?: LeaveRequest | null;
  isSaving: boolean;
  onSubmit: (values: LeaveFormValues) => void;
}

const TYPES: LeaveType[] = ["Cuti", "Izin", "Sakit"];

export function LeaveFormDialog({
  open,
  onOpenChange,
  request,
  isSaving,
  onSubmit,
}: Props) {
  const { t } = useTranslation();
  const today = format(new Date(), "yyyy-MM-dd");
  const [form, setForm] = useState<LeaveFormValues>({
    type: "Cuti",
    start_date: today,
    end_date: today,
    reason: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm(
      request
        ? {
            type: request.type,
            start_date: request.start_date,
            end_date: request.end_date,
            reason: request.reason,
          }
        : { type: "Cuti", start_date: today, end_date: today, reason: "" },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, request]);

  const set = <K extends keyof LeaveFormValues>(
    key: K,
    val: LeaveFormValues[K],
  ) => setForm((f) => ({ ...f, [key]: val }));

  const rangeInvalid = !!form.start_date && form.end_date < form.start_date;
  const canSubmit =
    !!form.start_date &&
    !!form.end_date &&
    !!form.reason.trim() &&
    !rangeInvalid;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    onSubmit({ ...form, reason: form.reason.trim() });
  }

  return (
    <Dialog open={open} onOpenChange={isSaving ? undefined : onOpenChange}>
      <DialogContent className="max-w-lg bg-card border-border">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold text-foreground">
            {request ? t("leave.form.editTitle") : t("leave.form.title")}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4 pt-1">
          {request?.status === "Rejected" && (
            <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-800/40 dark:bg-amber-950/40">
              <p className="text-[11px] text-amber-700 dark:text-amber-300">
                {t("leave.form.resubmitNote")}
              </p>
              {request.rejection_note && (
                <p className="text-[11px] text-muted-foreground mt-1">
                  ↳ {request.rejection_note}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">
              {t("leave.form.type")}
            </Label>
            <Select
              value={form.type}
              onValueChange={(v) => set("type", v as LeaveType)}
            >
              <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {TYPES.map((tp) => (
                  <SelectItem key={tp} value={tp} className="text-sm">
                    {t(`leave.type.${tp}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <DatePickerField
              label={t("leave.form.startDate")}
              value={form.start_date || null}
              onChange={(v) => set("start_date", v ?? "")}
              required
            />
            <DatePickerField
              label={t("leave.form.endDate")}
              value={form.end_date || null}
              onChange={(v) => set("end_date", v ?? "")}
              required
            />
          </div>
          {rangeInvalid && (
            <p className="text-[11px] text-rose-600 dark:text-rose-400 -mt-2">
              {t("leave.form.rangeError")}
            </p>
          )}

          <div className="flex flex-col gap-1.5">
            <Label className="text-xs font-medium text-foreground">
              {t("leave.form.reason")}
            </Label>
            <Textarea
              value={form.reason}
              onChange={(e) => set("reason", e.target.value)}
              placeholder={t("leave.form.reasonPlaceholder")}
              required
              rows={3}
              className="bg-secondary border-border text-foreground text-sm resize-none"
            />
          </div>

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
              disabled={!canSubmit}
              loading={isSaving}
            >
              {isSaving ? (
                t("leave.form.saving")
              ) : request ? (
                t("leave.form.update")
              ) : (
                t("leave.form.submit")
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
