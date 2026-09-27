import { format } from "date-fns";

export type PeriodType = "daily" | "monthly" | "yearly";

function periodPrefix(type: PeriodType, date: Date): string {
  if (type === "daily") return format(date, "yyyy-MM-dd");
  if (type === "monthly") return format(date, "yyyy-MM");
  return format(date, "yyyy");
}

/** Keeps only records whose `date` (YYYY-MM-DD) falls in the given period. */
export function filterByPeriod<T extends { date: string }>(
  records: T[],
  type: PeriodType,
  date: Date,
): T[] {
  const prefix = periodPrefix(type, date);
  return records.filter((r) => r.date.startsWith(prefix));
}
