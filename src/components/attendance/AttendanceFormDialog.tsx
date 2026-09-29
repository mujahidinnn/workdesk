import { useEffect, useState } from "react";
import { format } from "date-fns";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { DatePickerField } from "@/components/ui/date-picker-field";
import { TimePickerField } from "@/components/ui/time-picker-field";
import { AttachmentInput } from "./AttachmentInput";
import type {
  AttendanceStatus,
  AttendanceWithProfile,
  UserWithEmail,
} from "@/lib/types";

const STATUS_OPTIONS: AttendanceStatus[] = [
  "Hadir",
  "Izin",
  "Sakit",
  "Cuti",
  "Alpa",
];

/** Days with no attendance at all - a time on them is a data entry slip. */
const NO_TIME_STATUSES: AttendanceStatus[] = ["Alpa", "Cuti"];

/** Absences that must carry a reason and may carry a supporting file. */
const NOTE_STATUSES: AttendanceStatus[] = ["Izin", "Sakit"];

export interface AttendanceFormValues {
  user_id: string;
  date: string;
  status: AttendanceStatus;
  clock_in: string | null;
  clock_out: string | null;
  note: string | null;
  file: File | null;
}

interface AttendanceFormDialogProps {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  record?: AttendanceWithProfile | null;
  users: UserWithEmail[];
  onSubmit: (data: AttendanceFormValues) => void;
  loading?: boolean;
}

export function AttendanceFormDialog({
  open,
  onOpenChange,
  record,
  users,
  onSubmit,
  loading,
}: AttendanceFormDialogProps) {
  const { t } = useTranslation();
  const [userId, setUserId] = useState("");
  const [date, setDate] = useState<string | null>(null);
  const [status, setStatus] = useState<AttendanceStatus>("Hadir");
  const [clockIn, setClockIn] = useState("");
  const [clockOut, setClockOut] = useState("");
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  useEffect(() => {
    if (!open) return;
    setFile(null);
    if (record) {
      setUserId(record.user_id);
      setDate(record.date);
      setStatus(record.status);
      setClockIn(record.clock_in?.slice(0, 5) ?? "");
      setClockOut(record.clock_out?.slice(0, 5) ?? "");
      setNote(record.note ?? "");
    } else {
      setUserId("");
      setDate(format(new Date(), "yyyy-MM-dd"));
      setStatus("Hadir");
      setClockIn("");
      setClockOut("");
      setNote("");
    }
  }, [open, record]);

  const noTimes = NO_TIME_STATUSES.includes(status);
  const needsNote = NOTE_STATUSES.includes(status);

  // One reason at a time, shown under the fields instead of a silent disable.
  const error = (() => {
    if (noTimes && (clockIn || clockOut)) return t("attendance.errors.noTimes");
    if (needsNote && !note.trim()) return t("attendance.errors.noteRequired");
    if (status === "Hadir" && !clockIn)
      return t("attendance.errors.clockInRequired");
    if (clockOut && !clockIn) return t("attendance.errors.clockInRequired");
    if (clockIn && clockOut && clockOut <= clockIn)
      return t("attendance.errors.clockOrder");
    return null;
  })();

  const canSave = !!userId && !!date && !error;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border max-w-md">
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {record
              ? t("attendance.dialog.editTitle")
              : t("attendance.dialog.addTitle")}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {!record && (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("attendance.dialog.employee")}
              </Label>
              <Select value={userId} onValueChange={setUserId}>
                <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
                  <SelectValue
                    placeholder={t("attendance.dialog.employeePlaceholder")}
                  />
                </SelectTrigger>
                <SelectContent className="bg-card border-border">
                  {users.map((u) => (
                    <SelectItem key={u.id} value={u.id} className="text-sm">
                      {u.full_name ?? u.email}
                      {u.employee_role_title && (
                        <span className="text-muted-foreground"> · {u.employee_role_title}</span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {!record ? (
            <DatePickerField
              label={t("attendance.dialog.date")}
              value={date}
              onChange={setDate}
              required
            />
          ) : (
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground font-medium">
                {t("attendance.dialog.date")}
              </Label>
              <p className="text-sm text-foreground px-3 py-2 rounded-md bg-secondary border border-border">
                {record.profile?.full_name} - {record.date}
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("attendance.dialog.status")}
            </Label>
            <Select
              value={status}
              onValueChange={(v) => setStatus(v as AttendanceStatus)}
            >
              <SelectTrigger className="bg-secondary border-border text-foreground text-sm h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-card border-border">
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s} className="text-sm">
                    {t(`attendance.status.${s}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <TimePickerField
              label={t("attendance.dialog.clockIn")}
              value={clockIn}
              onChange={setClockIn}
            />
            <TimePickerField
              label={t("attendance.dialog.clockOut")}
              value={clockOut}
              onChange={setClockOut}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground font-medium">
              {t("attendance.dialog.note")}
              {needsNote && <span className="text-destructive"> *</span>}
            </Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t(
                needsNote
                  ? "attendance.dialog.noteRequiredPlaceholder"
                  : "attendance.dialog.notePlaceholder",
              )}
              className="bg-secondary border-border text-foreground text-sm min-h-[70px]"
            />
          </div>

          {needsNote && (
            <AttachmentInput
              file={file}
              onChange={setFile}
              currentName={record?.attachment_name}
            />
          )}
        </div>

        <DialogFooter className="gap-2 pt-2 border-t border-border">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="border-border text-muted-foreground hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            {t("common.cancel")}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!canSave}
            loading={loading}
            onClick={() =>
              date &&
              onSubmit({
                user_id: userId,
                date,
                status,
                clock_in: clockIn ? `${clockIn}:00` : null,
                clock_out: clockOut ? `${clockOut}:00` : null,
                note: note.trim() || null,
                file: needsNote ? file : null,
              })
            }
            className="bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {loading ? t("common.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
