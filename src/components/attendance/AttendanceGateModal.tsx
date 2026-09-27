import { useState } from "react";
import { format } from "date-fns";
import { CheckCircle2, FileText, Loader2, Stethoscope } from "lucide-react";
import { useTranslation } from "react-i18next";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useAuth } from "@/context/auth";
import { useHolidays } from "@/hooks/useHolidays";
import {
  useTodayAttendance,
  useCheckIn,
  useToday,
} from "@/hooks/useAttendance";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import { isWorkday } from "@/lib/workday";
import { SELF_CHECK_IN_STATUSES, type AttendanceStatus } from "@/lib/types";
import { cn } from "@/lib/utils";
import { AttachmentInput } from "./AttachmentInput";

const ICONS: Record<string, typeof CheckCircle2> = {
  Hadir: CheckCircle2,
  Izin: FileText,
  Sakit: Stethoscope,
};

interface AttendanceGateModalProps {
  /** Controlled mode: the employee opened it themselves, so it stays
   *  dismissible and works on a weekend or holiday too. */
  open?: boolean;
  onOpenChange?: (v: boolean) => void;
}

export function AttendanceGateModal({
  open,
  onOpenChange,
}: AttendanceGateModalProps = {}) {
  const { t } = useTranslation();
  const { user, isSuperadmin } = useAuth();
  const [selected, setSelected] = useState<AttendanceStatus | null>(null);
  const [note, setNote] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const manual = open !== undefined;
  const today = useToday();
  const {
    data: holidays = [],
    isLoading: holidaysLoading,
    isError: holidaysError,
  } = useHolidays();
  const { data: todayRecord, isLoading: attendanceLoading } =
    useTodayAttendance(user?.id, today);
  const checkIn = useCheckIn();
  const { data: schedule } = useWorkSchedule();

  // Never nag on a day we cannot prove is a working day: a failed holiday
  // fetch would otherwise make a public holiday look like an ordinary day.
  const workday = isWorkday(new Date(`${today}T00:00:00`), holidays, schedule);
  const shouldShow = manual
    ? open
    : !!user &&
      !isSuperadmin() &&
      workday &&
      !holidaysError &&
      !holidaysLoading &&
      !attendanceLoading &&
      !todayRecord;

  const needsNote = selected === "Izin" || selected === "Sakit";

  function submit() {
    if (!user || !selected || (needsNote && !note.trim())) return;
    checkIn.mutate(
      {
        user_id: user.id,
        date: today,
        status: selected,
        note: needsNote ? note.trim() : null,
        file: needsNote ? file : null,
      },
      {
        onSuccess: () => {
          setSelected(null);
          setNote("");
          setFile(null);
          onOpenChange?.(false);
        },
      },
    );
  }

  return (
    <Dialog open={shouldShow} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton={!manual}
        className="bg-card border-border max-w-sm"
        // Radix focuses the first button on open, which paints its focus
        // ring before the employee has picked anything.
        onOpenAutoFocus={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => !manual && e.preventDefault()}
        onEscapeKeyDown={(e) => !manual && e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-foreground text-base font-semibold">
            {t("attendance.gate.title")}
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            {t("attendance.gate.subtitle", {
              date: format(new Date(`${today}T00:00:00`), "dd MMM yyyy"),
            })}
          </DialogDescription>
        </DialogHeader>

        {schedule && (
          <p className="text-[11px] text-muted-foreground bg-secondary/60 border border-border/60 rounded-lg px-3 py-2">
            {t("attendance.gate.scheduleHint", {
              clockIn: schedule.clock_in_time.slice(0, 5),
              clockOut: schedule.clock_out_time.slice(0, 5),
              tolerance: schedule.late_tolerance_minutes,
            })}
          </p>
        )}

        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2">
            {SELF_CHECK_IN_STATUSES.map((status) => {
              const Icon = ICONS[status] ?? CheckCircle2;
              return (
                <button
                  key={status}
                  type="button"
                  onClick={() => setSelected(status)}
                  className={cn(
                    "flex flex-col items-center gap-1.5 py-3 rounded-lg border text-xs font-medium transition-colors",
                    selected === status
                      ? "border-primary bg-primary/10 text-primary"
                      : "border-border bg-secondary text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t(`attendance.status.${status}`)}
                </button>
              );
            })}
          </div>

          {needsNote && (
            <Textarea
              autoFocus
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={t("attendance.gate.notePlaceholder")}
              className="bg-secondary border-border text-foreground text-sm min-h-[70px]"
            />
          )}
          {needsNote && <AttachmentInput file={file} onChange={setFile} />}
        </div>

        <DialogFooter>
          <Button
            type="button"
            size="sm"
            disabled={!selected || (needsNote && !note.trim()) || checkIn.isPending}
            onClick={submit}
            className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
          >
            {checkIn.isPending && (
              <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" />
            )}
            {t("attendance.gate.submit")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
