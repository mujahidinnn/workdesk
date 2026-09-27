import {
  eachDayOfInterval,
  endOfDay,
  endOfMonth,
  endOfYear,
  format,
  startOfDay,
  startOfMonth,
  startOfYear,
} from "date-fns";
import type { Holiday, WorkSchedule } from "./types";
import type { PeriodType } from "./period";

const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

export function isWeekend(date: Date): boolean {
  const day = date.getDay();
  return day === 0 || day === 6;
}

/** ISO weekday: 1 = Monday .. 7 = Sunday. */
function isoDay(date: Date): number {
  return date.getDay() === 0 ? 7 : date.getDay();
}

/** Working days come from the schedule, Mon-Fri when there is no row yet. */
export function isWorkday(
  date: Date,
  holidays: Holiday[],
  schedule?: WorkSchedule | null,
): boolean {
  const days = schedule?.work_days?.length
    ? schedule.work_days
    : DEFAULT_WORK_DAYS;
  if (!days.includes(isoDay(date))) return false;
  const dateStr = format(date, "yyyy-MM-dd");
  return !holidays.some((h) => h.date === dateStr);
}

/** First and last day of the selected period filter. */
export function periodRange(
  type: PeriodType,
  date: Date,
): { start: Date; end: Date } {
  if (type === "daily") return { start: startOfDay(date), end: endOfDay(date) };
  if (type === "monthly")
    return { start: startOfMonth(date), end: endOfMonth(date) };
  return { start: startOfYear(date), end: endOfYear(date) };
}

/** Skips future days so a half-finished month isn't judged against its full length. */
export function countWorkdays(
  start: Date,
  end: Date,
  holidays: Holiday[],
  schedule?: WorkSchedule | null,
): number {
  const today = endOfDay(new Date());
  const last = end > today ? today : end;
  if (last < start) return 0;
  return eachDayOfInterval({ start, end: last }).filter((d) =>
    isWorkday(d, holidays, schedule),
  ).length;
}
