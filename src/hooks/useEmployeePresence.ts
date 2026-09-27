import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/** Returns a map of employee_id → latest task created_at (ISO string) */
export function useEmployeePresence() {
  return useQuery<Record<number, string>>({
    queryKey: ["employee-presence"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_daily_tasks")
        .select("employee_id, created_at")
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;

      const map: Record<number, string> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any[]).forEach((row) => {
        if (!map[row.employee_id]) {
          map[row.employee_id] = row.created_at as string;
        }
      });
      return map;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}

/** Returns true if the employee was active in the last 4 hours */
export function isEmployeeActive(lastActiveAt: string | undefined): boolean {
  if (!lastActiveAt) return false;
  const diffMs = Date.now() - new Date(lastActiveAt).getTime();
  return diffMs <= 4 * 60 * 60 * 1000;
}
