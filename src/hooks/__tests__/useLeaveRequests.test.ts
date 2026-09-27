import { describe, expect, it } from "vitest";
import { countLeaveWorkingDays } from "../useLeaveRequests";

// June 2025: 1st is a Sunday, so 2nd-6th is Mon-Fri and 7th is a Saturday.
const holidays = new Set(["2025-06-04"]);

describe("countLeaveWorkingDays", () => {
  it("counts a plain Mon-Fri week", () => {
    expect(countLeaveWorkingDays("2025-06-02", "2025-06-06")).toBe(5);
  });

  it("skips the weekend", () => {
    // Fri, Sat, Sun, Mon.
    expect(countLeaveWorkingDays("2025-06-06", "2025-06-09")).toBe(2);
  });

  it("skips a holiday", () => {
    expect(
      countLeaveWorkingDays("2025-06-02", "2025-06-06", undefined, holidays),
    ).toBe(4);
  });

  it("counts a single day, unless it is not a working day", () => {
    expect(countLeaveWorkingDays("2025-06-02", "2025-06-02")).toBe(1);
    expect(countLeaveWorkingDays("2025-06-07", "2025-06-07")).toBe(0);
    expect(
      countLeaveWorkingDays("2025-06-04", "2025-06-04", undefined, holidays),
    ).toBe(0);
  });

  it("counts Saturday on a six day week", () => {
    expect(
      countLeaveWorkingDays("2025-06-02", "2025-06-07", [1, 2, 3, 4, 5, 6]),
    ).toBe(6);
  });

  it("is zero when the range is inverted", () => {
    expect(countLeaveWorkingDays("2025-06-06", "2025-06-02")).toBe(0);
  });
});
