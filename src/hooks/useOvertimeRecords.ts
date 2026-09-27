import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import type {
  OvertimeRecord,
  OvertimeRecordWithRelations,
  OvertimeMonthSummary,
  OvertimeType,
  EmployeeRate,
} from "@/lib/types";

const QK = ["overtime-records"] as const;
const RK = ["employee-rates"] as const;

// Must match the compute_overtime_totals trigger. Without the overnight flag,
// an end at or before the start is a typo worth 0 hours, not a wrap around.
export function calcDurationHours(
  startTime: string,
  endTime: string,
  overnight = false,
): number {
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  const mins = eh * 60 + em - (sh * 60 + sm) + (overnight ? 24 * 60 : 0);
  if (!Number.isFinite(mins) || mins <= 0) return 0;
  return Math.round((mins / 60) * 100) / 100;
}

export function formatShiftTime(
  r: Pick<OvertimeRecord, "date" | "end_date" | "start_time" | "end_time">,
): string {
  if (!r.start_time || !r.end_time) return "-";
  const plusOne = r.end_date && r.end_date !== r.date ? " (+1)" : "";
  return `${r.start_time.slice(0, 5)}–${r.end_time.slice(0, 5)}${plusOne}`;
}

async function sessionUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    throw new Error("Session expired, please sign in again");
  return data.user.id;
}

export const OVERTIME_TYPES: OvertimeType[] = [
  "Overtime",
  "BusinessTrip_Local",
  "BusinessTrip_OutOfTown",
];

export interface OvertimeFilters {
  /** Only this submitter's rows */
  userId?: string;
  /** Everyone but this submitter (approval queue) */
  excludeUserId?: string;
  status?: OvertimeRecord["status"];
  type?: OvertimeType;
  projectId?: string;
  /** yyyy-MM-dd, inclusive */
  from?: string;
  to?: string;
}

export function useOvertimeRecords(filters: OvertimeFilters = {}) {
  return useQuery<OvertimeRecordWithRelations[]>({
    queryKey: [...QK, filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from("t_overtime_business_trips").select(
        `
          *,
          project:m_projects(id, project_code, project_name),
          submitter:profiles!t_overtime_business_trips_user_id_fkey(id, full_name, avatar_url)
        `,
      );
      if (filters.userId) query = query.eq("user_id", filters.userId);
      if (filters.excludeUserId)
        query = query.neq("user_id", filters.excludeUserId);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.type) query = query.eq("type", filters.type);
      if (filters.projectId)
        query = query.eq("project_id", Number(filters.projectId));
      if (filters.from) query = query.gte("date", filters.from);
      if (filters.to) query = query.lte("date", filters.to);
      const { data, error } = await query
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as OvertimeRecordWithRelations[];
    },
  });
}

export function useOvertimeMonthlySummary(year: number) {
  return useQuery<OvertimeMonthSummary[]>({
    queryKey: [...QK, "summary", year],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_overtime_business_trips")
        .select("type, date, duration_hours, status")
        .gte("date", `${year}-01-01`)
        .lte("date", `${year}-12-31`);
      if (error) throw error;

      const months: OvertimeMonthSummary[] = Array.from(
        { length: 12 },
        (_, i) => ({
          month: i + 1,
          label: format(new Date(year, i, 1), "MMM"),
          overtimeHours: 0,
          businessTripLocalDays: 0,
          businessTripOutOfTownDays: 0,
        }),
      );

      for (const row of data as Pick<
        OvertimeRecord,
        "type" | "date" | "duration_hours" | "status"
      >[]) {
        if (row.status !== "Approved") continue;
        const m = parseISO(row.date).getMonth();
        if (row.type === "Overtime") {
          months[m].overtimeHours += row.duration_hours ?? 0;
        } else if (row.type === "BusinessTrip_Local") {
          months[m].businessTripLocalDays += 1;
        } else if (row.type === "BusinessTrip_OutOfTown") {
          months[m].businessTripOutOfTownDays += 1;
        }
      }
      return months;
    },
  });
}

export function useEmployeeRates() {
  return useQuery<EmployeeRate[]>({
    queryKey: [...RK],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_employee_rates")
        .select(
          "*, profile:profiles!t_employee_rates_profile_id_fkey(id, full_name)",
        )
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data as EmployeeRate[];
    },
  });
}

export function useUpsertEmployeeRate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      profile_id: string;
      base_salary: number;
      overtime_rate: number;
      local_trip_rate: number;
      out_of_town_rate: number;
      updated_by: string;
    }) => {
      const { error } = await supabase
        .from("t_employee_rates")
        .upsert(
          { ...payload, updated_at: new Date().toISOString() },
          { onConflict: "profile_id" },
        );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: [...RK] });
      toast.success("Rates saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// duration_hours and daily_allowance are omitted: a trigger computes and overwrites them.
export type OvertimeRecordPayload = Omit<
  OvertimeRecord,
  | "id"
  | "created_at"
  | "approved_by"
  | "rejection_note"
  | "duration_hours"
  | "daily_allowance"
>;

export function useCreateOvertimeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: OvertimeRecordPayload) => {
      const { data, error } = await supabase
        .from("t_overtime_business_trips")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("create", "overtime", data.id, {
        type: data.type,
        date: data.date,
      });
      toast.success("Request submitted successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateOvertimeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<OvertimeRecordPayload> & {
      id: number;
      // Resubmit sends status and the cleared note in one write; RLS checks the edited row.
      rejection_note?: string | null;
    }) => {
      const { data, error } = await supabase
        .from("t_overtime_business_trips")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("update", "overtime", variables.id, { status: data.status });
      toast.success("Request updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteOvertimeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("t_overtime_business_trips")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("delete", "overtime", id);
      toast.success("Request deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useApproveOvertimeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number; approvedBy: string }) => {
      const approvedBy = await sessionUserId();
      const { error } = await supabase
        .from("t_overtime_business_trips")
        .update({
          status: "Approved",
          approved_by: approvedBy,
          rejection_note: null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("update", "overtime", id, { status: "Approved" });
      toast.success("Request approved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRejectOvertimeRecord() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      note,
    }: {
      id: number;
      approvedBy: string;
      note: string;
    }) => {
      const approvedBy = await sessionUserId();
      const { error } = await supabase
        .from("t_overtime_business_trips")
        .update({
          status: "Rejected",
          approved_by: approvedBy,
          rejection_note: note || null,
        })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id, note }) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("update", "overtime", id, { status: "Rejected", note });
      toast.success("Request rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
