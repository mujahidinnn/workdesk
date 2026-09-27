import { describe, expect, it } from "vitest";
import { isEarlyLeave, isLateArrival, workHours } from "../attendance";
import type { WorkSchedule } from "../types";

const schedule = {
  clock_in_time: "08:00:00",
  clock_out_time: "17:00:00",
  late_tolerance_minutes: 15,
} as WorkSchedule;

describe("isLateArrival", () => {
  it("only judges days the person was present", () => {
    expect(isLateArrival("10:00", schedule, "Izin")).toBe(false);
    expect(isLateArrival("10:00", schedule, "Cuti")).toBe(false);
    expect(isLateArrival("10:00", schedule, "Alpa")).toBe(false);
  });

  it("is false without a schedule or a usable clock in", () => {
    expect(isLateArrival("10:00", null, "Hadir")).toBe(false);
    expect(isLateArrival(null, schedule, "Hadir")).toBe(false);
    expect(isLateArrival("not-a-time", schedule, "Hadir")).toBe(false);
  });

  it("treats the tolerance limit itself as on time", () => {
    expect(isLateArrival("08:15:00", schedule, "Hadir")).toBe(false);
    expect(isLateArrival("08:16:00", schedule, "Hadir")).toBe(true);
  });
});

describe("isEarlyLeave", () => {
  it("only judges days the person was present", () => {
    expect(isEarlyLeave("12:00", schedule, "Sakit")).toBe(false);
  });

  it("is false without a schedule or a usable clock out", () => {
    expect(isEarlyLeave("12:00", null, "Hadir")).toBe(false);
    expect(isEarlyLeave(null, schedule, "Hadir")).toBe(false);
    expect(isEarlyLeave("not-a-time", schedule, "Hadir")).toBe(false);
  });

  // Number("") is 0, so an empty segment must not read as midnight.
  it("does not read an empty time string as midnight", () => {
    expect(isEarlyLeave("::", schedule, "Hadir")).toBe(false);
    expect(isEarlyLeave(":30", schedule, "Hadir")).toBe(false);
    expect(isEarlyLeave("8:", schedule, "Hadir")).toBe(false);
    expect(isEarlyLeave("25:00", schedule, "Hadir")).toBe(false);
  });

  it("counts leaving before the scheduled end, not exactly on it", () => {
    expect(isEarlyLeave("17:00:00", schedule, "Hadir")).toBe(false);
    expect(isEarlyLeave("16:59:00", schedule, "Hadir")).toBe(true);
    expect(isEarlyLeave("18:00:00", schedule, "Hadir")).toBe(false);
  });
});

describe("workHours", () => {
  it("counts the hours between the two stamps", () => {
    expect(workHours("08:00:00", "17:00:00")).toBe(9);
    expect(workHours("08:00", "11:30")).toBe(3.5);
  });

  it("gives null when the day is not properly closed", () => {
    expect(workHours("08:00", null)).toBeNull();
    expect(workHours(null, "17:00")).toBeNull();
    expect(workHours("oops", "17:00")).toBeNull();
    expect(workHours("17:00", "08:00")).toBeNull();
    expect(workHours("08:00", "08:00")).toBeNull();
  });

  // An empty segment must not produce a full working day.
  it("does not turn a junk clock in into a 17 hour day", () => {
    expect(workHours(":00", "17:00")).toBeNull();
    expect(workHours("08:", "17:00")).toBeNull();
  });
});
