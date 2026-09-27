import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import type { EmploymentType, PayrollLine, PayrollRun } from "@/lib/types";

const RUNS_QK = ["payroll-runs"] as const;
const LINES_QK = ["payroll-lines"] as const;

export function usePayrollRuns() {
  return useQuery<PayrollRun[]>({
    queryKey: [...RUNS_QK],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_payroll_runs")
        .select("*")
        .order("period", { ascending: false });
      if (error) throw error;
      return data as PayrollRun[];
    },
  });
}

/** RLS decides the rows: the whole run for a payroll officer, the caller's own line
 *  otherwise, and nothing while the run is a draft. */
export interface PayrollLineFilters {
  paymentStatus?: PayrollLine["payment_status"];
  employmentType?: EmploymentType;
}

export function usePayrollLines(
  runId: number | null,
  filters: PayrollLineFilters = {},
) {
  return useQuery<PayrollLine[]>({
    queryKey: [...LINES_QK, runId, filters],
    enabled: runId !== null,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // Employment type lives on the employee behind the profile, reached
      // through a filter-only !inner embed so unfiltered runs keep every line.
      let query = supabase
        .from("t_payroll_lines")
        .select(
          filters.employmentType
            ? "*, emp_filter:profiles!inner(employee:m_employees!inner(employment_type))"
            : "*",
        )
        .eq("run_id", runId!);
      if (filters.paymentStatus)
        query = query.eq("payment_status", filters.paymentStatus);
      if (filters.employmentType)
        query = query.eq(
          "emp_filter.employee.employment_type",
          filters.employmentType,
        );
      const { data, error } = await query.order("id");
      if (error) throw error;
      return data as unknown as PayrollLine[];
    },
  });
}

/** Caller's finalized lines, newest first. RLS hides drafts and other people's lines. */
export function useMyPayslips(userId: string | undefined) {
  return useQuery<(PayrollLine & { period: string })[]>({
    queryKey: [...LINES_QK, "mine", userId],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_payroll_lines")
        .select("*, run:t_payroll_runs!inner(period)")
        .eq("user_id", userId!);
      if (error) throw error;
      return data
        .map(({ run, ...line }) => ({ ...(line as PayrollLine), period: run.period }))
        .sort((a, b) => b.period.localeCompare(a.period));
    },
  });
}

/** Opens the month if it is new and restates its earnings from the approved
 *  rows. Deductions and payment status already entered are left alone. */
export function useGeneratePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (period: string) => {
      const { data, error } = await supabase.rpc("generate_payroll_run", {
        p_period: period,
      });
      if (error) throw error;
      return data as number;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RUNS_QK] });
      qc.invalidateQueries({ queryKey: [...LINES_QK] });
      toast.success("Payroll run updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** Deductions are the only money a human types here, and only while the run
 *  is a draft: the database refuses the update once it is finalized. */
export function useUpdatePayrollDeductions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: number;
      pph21: number;
      bpjs: number;
      other_deduction: number;
      deduction_note: string | null;
    }) => {
      const { id, ...fields } = payload;
      const { error } = await supabase
        .from("t_payroll_lines")
        .update(fields)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...LINES_QK] });
      toast.success("Deductions saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** paid_at is stamped by the database, so it always matches the flag. */
export function useSetPaymentStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { id: number; paid: boolean }) => {
      const { error } = await supabase
        .from("t_payroll_lines")
        .update({ payment_status: payload.paid ? "Paid" : "Unpaid" })
        .eq("id", payload.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [...LINES_QK] }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useFinalizePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: number) => {
      const { error } = await supabase
        .from("t_payroll_runs")
        .update({ status: "Finalized" })
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RUNS_QK] });
      qc.invalidateQueries({ queryKey: [...LINES_QK] });
      toast.success("Payroll finalized");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeletePayrollRun() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (runId: number) => {
      const { error } = await supabase
        .from("t_payroll_runs")
        .delete()
        .eq("id", runId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RUNS_QK] });
      qc.invalidateQueries({ queryKey: [...LINES_QK] });
      toast.success("Draft run deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
