import { describe, expect, it } from "vitest";
import { payrollRecap } from "../payroll";
import type { EmployeeRate, OvertimeRecordWithRelations } from "../types";

const rate = (profile_id: string, full_name: string, base_salary: number) =>
  ({
    id: 1,
    profile_id,
    base_salary,
    overtime_rate: 50_000,
    local_trip_rate: 100_000,
    out_of_town_rate: 300_000,
    updated_at: "2026-01-01T00:00:00Z",
    updated_by: null,
    profile: { id: profile_id, full_name },
  }) as EmployeeRate;

const record = (
  over: Partial<OvertimeRecordWithRelations>,
): OvertimeRecordWithRelations =>
  ({
    id: 1,
    user_id: "u1",
    type: "Overtime",
    date: "2026-01-05",
    end_date: null,
    start_time: "18:00",
    end_time: "21:00",
    project_id: null,
    activity_description: "",
    duration_hours: 3,
    daily_allowance: 150_000,
    status: "Approved",
    approved_by: null,
    rejection_note: null,
    created_at: "2026-01-05T00:00:00Z",
    project: null,
    submitter: { id: "u1", full_name: "Ayu", avatar_url: null },
    ...over,
  }) as OvertimeRecordWithRelations;

describe("payrollRecap", () => {
  it("sums overtime and trips into gross, with base salary for a month", () => {
    const [line] = payrollRecap(
      [
        record({}),
        record({ id: 2, type: "BusinessTrip_Local", daily_allowance: 100_000 }),
        record({
          id: 3,
          type: "BusinessTrip_OutOfTown",
          daily_allowance: 300_000,
        }),
      ],
      [rate("u1", "Ayu", 8_000_000)],
      true,
    );
    expect(line.overtimeHours).toBe(3);
    expect(line.overtimePay).toBe(150_000);
    expect(line.localTripDays).toBe(1);
    expect(line.outOfTownDays).toBe(1);
    expect(line.gross).toBe(8_550_000);
  });

  it("ignores pending and rejected records", () => {
    const [line] = payrollRecap(
      [
        record({ status: "Pending" }),
        record({ id: 2, status: "Rejected", daily_allowance: 999_000 }),
      ],
      [rate("u1", "Ayu", 8_000_000)],
      true,
    );
    expect(line.overtimePay).toBe(0);
    expect(line.gross).toBe(8_000_000);
  });

  it("leaves base salary out when the period is not one month", () => {
    const [line] = payrollRecap([record({})], [rate("u1", "Ayu", 8_000_000)], false);
    expect(line.baseSalary).toBe(0);
    expect(line.gross).toBe(150_000);
  });

  it("keeps an employee with no records on the list", () => {
    const lines = payrollRecap([], [rate("u1", "Ayu", 8_000_000)], true);
    expect(lines).toHaveLength(1);
    expect(lines[0].gross).toBe(8_000_000);
  });

  it("still counts an approved record from someone with no rate row", () => {
    const lines = payrollRecap(
      [record({ user_id: "u9", submitter: { id: "u9", full_name: "Budi", avatar_url: null } })],
      [],
      true,
    );
    expect(lines.map((l) => l.name)).toEqual(["Budi"]);
    expect(lines[0].gross).toBe(150_000);
  });
});
