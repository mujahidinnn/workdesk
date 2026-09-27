import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import type { WorkSchedule } from "@/lib/types";

const QK = ["work-schedule"] as const;

export function useWorkSchedule() {
  return useQuery<WorkSchedule | null>({
    queryKey: [...QK],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_work_schedule")
        .select("*")
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as WorkSchedule | null;
    },
  });
}

export function useUpdateWorkSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      id: number;
      clock_in_time: string;
      clock_out_time: string;
      late_tolerance_minutes: number;
      timezone: string;
      work_days: number[];
      locked_until: string | null;
      company_name: string;
      updated_by: string;
    }) => {
      const { id, ...rest } = payload;
      const { error } = await supabase
        .from("m_work_schedule")
        .update({ ...rest, updated_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, payload) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("update", "work_schedule", payload.id, {
        clock_in_time: payload.clock_in_time,
        clock_out_time: payload.clock_out_time,
        late_tolerance_minutes: payload.late_tolerance_minutes,
        timezone: payload.timezone,
        work_days: payload.work_days,
        locked_until: payload.locked_until,
        company_name: payload.company_name,
      });
      toast.success("Work schedule updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
