import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { eachDayOfInterval, format, getISODay, parseISO } from "date-fns";
import { useHolidays } from "@/hooks/useHolidays";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import type {
  LeaveRequest,
  LeaveRequestWithProfile,
  LeaveStatus,
  LeaveType,
} from "@/lib/types";

const QK = ["leave-requests"] as const;
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

// Must match the DB approval trigger (skip non-work days and holidays) so the
// balance tile and attendance rows agree.
export function countLeaveWorkingDays(
  startDate: string,
  endDate: string,
  workDays: number[] = DEFAULT_WORK_DAYS,
  holidays: Set<string> = new Set(),
): number {
  const start = parseISO(startDate);
  const end = parseISO(endDate);
  if (!(start <= end)) return 0;
  return eachDayOfInterval({ start, end }).filter(
    (d) =>
      workDays.includes(getISODay(d)) && !holidays.has(format(d, "yyyy-MM-dd")),
  ).length;
}

// The approver on record is always the session that actually clicked approve.
async function sessionUserId(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user)
    throw new Error("Session expired, please sign in again");
  return data.user.id;
}

export interface LeaveFilters {
  userId?: string;
  /** Approvers never see their own requests in the queue. */
  excludeUserId?: string;
  status?: LeaveStatus;
  type?: LeaveType;
  /** yyyy-MM-dd, inclusive; a request matches when its period overlaps. */
  from?: string;
  to?: string;
}

export function useLeaveRequests(filters: LeaveFilters = {}) {
  return useQuery<LeaveRequestWithProfile[]>({
    queryKey: [...QK, filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from("t_leave_requests").select(
        `
          *,
          submitter:profiles!t_leave_requests_user_id_fkey(id, full_name, avatar_url)
        `,
      );
      if (filters.userId) query = query.eq("user_id", filters.userId);
      if (filters.excludeUserId)
        query = query.neq("user_id", filters.excludeUserId);
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.type) query = query.eq("type", filters.type);
      if (filters.from) query = query.gte("end_date", filters.from);
      if (filters.to) query = query.lte("start_date", filters.to);
      const { data, error } = await query
        .order("start_date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as LeaveRequestWithProfile[];
    },
  });
}

/** Yearly Cuti entitlement from the employee record linked to the profile. */
export function useLeaveQuota(employeeId: number | null | undefined) {
  return useQuery<number>({
    queryKey: [...QK, "quota", employeeId],
    enabled: !!employeeId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_employees")
        .select("annual_leave_quota")
        .eq("id", employeeId!)
        .maybeSingle();
      if (error) throw error;
      return data?.annual_leave_quota ?? 0;
    },
  });
}

/**
 * Remaining Cuti for one person in one year. Only approved Cuti counts, and
 * only the part of a request that falls inside the year being asked about.
 */
export function useLeaveBalance(
  userId: string | undefined,
  employeeId: number | null | undefined,
  year: number,
) {
  const { data: requests = [] } = useLeaveRequests();
  const { data: quota = 0, isLoading } = useLeaveQuota(employeeId);
  const { data: schedule } = useWorkSchedule();
  const { data: holidays = [] } = useHolidays();

  const workDays = schedule?.work_days?.length
    ? schedule.work_days
    : DEFAULT_WORK_DAYS;
  const holidaySet = new Set(holidays.map((h) => h.date));
  const yearStart = `${year}-01-01`;
  const yearEnd = `${year}-12-31`;

  const used = requests
    .filter(
      (r) =>
        r.user_id === userId &&
        r.type === "Cuti" &&
        r.status === "Approved" &&
        r.start_date <= yearEnd &&
        r.end_date >= yearStart,
    )
    .reduce(
      (sum, r) =>
        sum +
        countLeaveWorkingDays(
          r.start_date < yearStart ? yearStart : r.start_date,
          r.end_date > yearEnd ? yearEnd : r.end_date,
          workDays,
          holidaySet,
        ),
      0,
    );

  return { quota, used, remaining: Math.max(0, quota - used), isLoading };
}

export type LeaveRequestPayload = Pick<
  LeaveRequest,
  "user_id" | "type" | "start_date" | "end_date" | "reason"
>;

export function useCreateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: LeaveRequestPayload) => {
      const { data, error } = await supabase
        .from("t_leave_requests")
        .insert({ ...payload, status: "Pending" })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("create", "leave", data.id, {
        type: data.type,
        start_date: data.start_date,
      });
      toast.success("Request submitted successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Owner edits always reset to Pending, the only status the update policy
// accepts from them; fixing a rejected request also clears the note.
export function useUpdateLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<LeaveRequestPayload> & {
      id: number;
      status?: LeaveStatus;
      rejection_note?: string | null;
    }) => {
      const { error } = await supabase
        .from("t_leave_requests")
        .update(payload)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("update", "leave", id);
      toast.success("Request updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("t_leave_requests")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("delete", "leave", id);
      toast.success("Request deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

// Attendance rows are written by a DB trigger on approval, not here.
export function useApproveLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id }: { id: number }) => {
      const approvedBy = await sessionUserId();
      const { error } = await supabase
        .from("t_leave_requests")
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
      qc.invalidateQueries({ queryKey: ["attendance"] });
      logAudit("update", "leave", id, { status: "Approved" });
      toast.success("Request approved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useRejectLeaveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, note }: { id: number; note: string }) => {
      const approvedBy = await sessionUserId();
      const { error } = await supabase
        .from("t_leave_requests")
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
      logAudit("update", "leave", id, { status: "Rejected", note });
      toast.success("Request rejected");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
