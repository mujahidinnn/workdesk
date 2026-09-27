import type { EmployeeRate, OvertimeRecordWithRelations } from "@/lib/types";

/** Gross pay only: tax and BPJS are handled by the payroll system reading this export. */
export interface PayrollLine {
  userId: string;
  name: string;
  /** Zero unless the export covers exactly one month, see payrollRecap. */
  baseSalary: number;
  overtimeHours: number;
  overtimePay: number;
  localTripDays: number;
  localTripPay: number;
  outOfTownDays: number;
  outOfTownPay: number;
  gross: number;
}

/**
 * Sums money already stamped by the DB trigger, since rates may have changed after approval.
 * Only Approved records count; everyone with a rate row gets a line, even with no overtime.
 * @param includeBaseSalary Base salary is monthly: pass false unless the export covers exactly one month.
 */
export function payrollRecap(
  records: OvertimeRecordWithRelations[],
  rates: EmployeeRate[],
  includeBaseSalary: boolean,
): PayrollLine[] {
  const lines = new Map<string, PayrollLine>();

  const lineFor = (userId: string, name: string) => {
    let line = lines.get(userId);
    if (!line) {
      const rate = rates.find((r) => r.profile_id === userId);
      line = {
        userId,
        name: name || (rate?.profile?.full_name ?? ""),
        baseSalary: includeBaseSalary ? (rate?.base_salary ?? 0) : 0,
        overtimeHours: 0,
        overtimePay: 0,
        localTripDays: 0,
        localTripPay: 0,
        outOfTownDays: 0,
        outOfTownPay: 0,
        gross: 0,
      };
      lines.set(userId, line);
    }
    return line;
  };

  for (const rate of rates) {
    lineFor(rate.profile_id, rate.profile?.full_name ?? "");
  }

  for (const r of records) {
    if (r.status !== "Approved") continue;
    const line = lineFor(r.user_id, r.submitter?.full_name ?? "");
    const pay = r.daily_allowance ?? 0;
    if (r.type === "Overtime") {
      line.overtimeHours += r.duration_hours ?? 0;
      line.overtimePay += pay;
    } else if (r.type === "BusinessTrip_Local") {
      line.localTripDays += 1;
      line.localTripPay += pay;
    } else {
      line.outOfTownDays += 1;
      line.outOfTownPay += pay;
    }
  }

  for (const line of lines.values()) {
    line.gross =
      line.baseSalary + line.overtimePay + line.localTripPay + line.outOfTownPay;
  }

  return [...lines.values()].sort((a, b) => a.name.localeCompare(b.name));
}
