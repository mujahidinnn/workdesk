import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useWorkSchedule } from "@/hooks/useWorkSchedule";
import { isLateArrival } from "@/lib/attendance";
import type { Attendance } from "@/lib/types";

export interface HrisSummary {
  headcount: number;
  presentToday: number;
  lateToday: number;
  onLeaveToday: number;
  pendingOvertime: number;
  pendingLeave: number;
  overtimeHoursThisMonth: number;
}

/** Counted in the database to avoid PostgREST's silent 1000-row cap.
 *  RLS scopes rows: employees see their own items, approvers the queue. */
export function useHrisSummary() {
  const { data: schedule } = useWorkSchedule();
  const today = format(new Date(), "yyyy-MM-dd");
  const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
  const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");

  return useQuery<HrisSummary>({
    queryKey: ["hris-summary", today, schedule?.id],
    queryFn: async () => {
      const [
        headcount,
        todayRows,
        pendingOvertime,
        pendingLeave,
        overtimeRows,
      ] = await Promise.all([
        supabase
          .from("m_employees")
          .select("id", { count: "exact", head: true })
          .eq("status", "Active"),
        supabase
          .from("t_attendance")
          .select("status, clock_in")
          .eq("date", today),
        supabase
          .from("t_overtime_business_trips")
          .select("id", { count: "exact", head: true })
          .eq("status", "Pending"),
        supabase
          .from("t_leave_requests")
          .select("id", { count: "exact", head: true })
          .eq("status", "Pending"),
        supabase
          .from("t_overtime_business_trips")
          .select("duration_hours")
          .eq("type", "Overtime")
          .eq("status", "Approved")
          .gte("date", monthStart)
          .lte("date", monthEnd),
      ]);

      const rows = (todayRows.data ?? []) as Pick<
        Attendance,
        "status" | "clock_in"
      >[];

      return {
        headcount: headcount.count ?? 0,
        presentToday: rows.filter((r) => r.status === "Hadir").length,
        lateToday: rows.filter((r) =>
          isLateArrival(r.clock_in, schedule, r.status),
        ).length,
        onLeaveToday: rows.filter(
          (r) =>
            r.status === "Izin" || r.status === "Sakit" || r.status === "Cuti",
        ).length,
        pendingOvertime: pendingOvertime.count ?? 0,
        pendingLeave: pendingLeave.count ?? 0,
        overtimeHoursThisMonth: (
          (overtimeRows.data ?? []) as { duration_hours: number | null }[]
        ).reduce((sum, r) => sum + (r.duration_hours ?? 0), 0),
      };
    },
  });
}
