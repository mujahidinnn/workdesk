import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { countWorkdays, isWorkday, periodRange } from "../workday";
import type { Holiday, WorkSchedule } from "../types";

// June 2025: 1st is a Sunday, so 2nd-6th is Mon-Fri and 7th is a Saturday.
const sixDayWeek = { work_days: [1, 2, 3, 4, 5, 6] } as WorkSchedule;
const holidays = [{ date: "2025-06-04" }] as Holiday[];
const saturday = new Date(2025, 5, 7);
const wednesday = new Date(2025, 5, 4);

describe("isWorkday", () => {
  it("falls back to Mon-Fri when there is no schedule", () => {
    expect(isWorkday(saturday, [])).toBe(false);
    expect(isWorkday(wednesday, [])).toBe(true);
  });

  it("counts Saturday on a configured six day week", () => {
    expect(isWorkday(saturday, [], sixDayWeek)).toBe(true);
    expect(isWorkday(new Date(2025, 5, 8), [], sixDayWeek)).toBe(false);
  });

  it("never counts a holiday", () => {
    expect(isWorkday(wednesday, holidays)).toBe(false);
    expect(isWorkday(wednesday, holidays, sixDayWeek)).toBe(false);
  });
});

describe("periodRange", () => {
  const date = new Date(2025, 5, 15, 13, 30);

  it("covers the single day", () => {
    const { start, end } = periodRange("daily", date);
    expect(start).toEqual(new Date(2025, 5, 15, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2025, 5, 15, 23, 59, 59, 999));
  });

  it("covers the whole month", () => {
    const { start, end } = periodRange("monthly", date);
    expect(start).toEqual(new Date(2025, 5, 1, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2025, 5, 30, 23, 59, 59, 999));
  });

  it("covers the whole year", () => {
    const { start, end } = periodRange("yearly", date);
    expect(start).toEqual(new Date(2025, 0, 1, 0, 0, 0, 0));
    expect(end).toEqual(new Date(2025, 11, 31, 23, 59, 59, 999));
  });
});

describe("countWorkdays", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2025, 5, 10, 12, 0));
  });
  afterEach(() => vi.useRealTimers());

  it("stops at today instead of running to the end of the month", () => {
    const { start, end } = periodRange("monthly", new Date(2025, 5, 10));
    // Jun 2-6 and Jun 9-10, not the full 21 workdays of June.
    expect(countWorkdays(start, end, [])).toBe(7);
  });

  it("drops a holiday inside the range", () => {
    const { start, end } = periodRange("monthly", new Date(2025, 5, 10));
    expect(countWorkdays(start, end, holidays)).toBe(6);
  });

  it("adds the Saturdays on a six day week", () => {
    const { start, end } = periodRange("monthly", new Date(2025, 5, 10));
    // Same days plus Jun 7.
    expect(countWorkdays(start, end, [], sixDayWeek)).toBe(8);
  });

  it("is zero for a period that has not started yet", () => {
    const { start, end } = periodRange("monthly", new Date(2025, 6, 15));
    expect(countWorkdays(start, end, [])).toBe(0);
  });
});
