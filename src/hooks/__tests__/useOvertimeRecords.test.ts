import { describe, expect, it } from "vitest";
import { calcDurationHours } from "../useOvertimeRecords";

describe("calcDurationHours", () => {
  it("counts a normal shift", () => {
    expect(calcDurationHours("18:00", "21:30")).toBe(3.5);
    expect(calcDurationHours("18:00:00", "19:20:00")).toBe(1.33);
  });

  it("pays nothing for a typo where the end is before the start", () => {
    expect(calcDurationHours("21:00", "18:00")).toBe(0);
    expect(calcDurationHours("18:00", "18:00")).toBe(0);
    expect(calcDurationHours("abc", "18:00")).toBe(0);
  });

  it("wraps past midnight only when the shift is marked overnight", () => {
    expect(calcDurationHours("22:00", "02:00", true)).toBe(4);
    // Same two times without the flag stay a typo, not 4 free hours.
    expect(calcDurationHours("22:00", "02:00")).toBe(0);
  });
});
