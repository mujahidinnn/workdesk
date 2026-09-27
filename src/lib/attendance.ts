import type { AttendanceStatus, WorkSchedule } from "./types";

/** "HH:MM[:SS]" to minutes, or null when the value is missing or junk. */
function toMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  // Number("") is 0, not NaN, so an empty segment like ":30" or "8:" would
  // otherwise pass as a real time and invent hours out of nothing.
  const parts = time.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((p) => p.trim() === "")) return null;

  const [h, m] = parts.map(Number);
  if (!Number.isInteger(h) || !Number.isInteger(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return h * 60 + m;
}

/** Late only means something on a day the person was actually present. */
export function isLateArrival(
  clockIn: string | null,
  schedule: WorkSchedule | null | undefined,
  status: AttendanceStatus,
): boolean {
  if (status !== "Hadir" || !schedule) return false;
  const actual = toMinutes(clockIn);
  const start = toMinutes(schedule.clock_in_time);
  if (actual === null || start === null) return false;
  return actual > start + schedule.late_tolerance_minutes;
}

/** Clocked out before the schedule's end of day. */
export function isEarlyLeave(
  clockOut: string | null,
  schedule: WorkSchedule | null | undefined,
  status: AttendanceStatus,
): boolean {
  if (status !== "Hadir" || !schedule) return false;
  const actual = toMinutes(clockOut);
  const end = toMinutes(schedule.clock_out_time);
  if (actual === null || end === null) return false;
  return actual < end;
}

/** Hours between clock in and clock out, or null when the day is not closed. */
export function workHours(
  clockIn: string | null,
  clockOut: string | null,
): number | null {
  const start = toMinutes(clockIn);
  const end = toMinutes(clockOut);
  if (start === null || end === null || end <= start) return null;
  return (end - start) / 60;
}
