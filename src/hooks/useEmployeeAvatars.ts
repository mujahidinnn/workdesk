import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface EmployeeAvatarInfo {
  avatarUrl: string | null;
  /** May differ from m_employees.full_name. */
  profileName: string | null;
}

/**
 * Returns a map of employee_id → { avatarUrl, profileName } for all employees
 * that have a linked auth profile.  Used to show real photos across the app.
 */
export function useEmployeeAvatarMap(): Record<number, EmployeeAvatarInfo> {
  const { data = {} } = useQuery<Record<number, EmployeeAvatarInfo>>({
    queryKey: ["employee-avatar-map"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("employee_id, avatar_url, full_name")
        .not("employee_id", "is", null);

      if (error) throw error;

      const map: Record<number, EmployeeAvatarInfo> = {};
      (
        data as {
          employee_id: number;
          avatar_url: string | null;
          full_name: string | null;
        }[]
      ).forEach((p) => {
        if (p.employee_id != null) {
          map[p.employee_id] = {
            avatarUrl: p.avatar_url,
            profileName: p.full_name,
          };
        }
      });
      return map;
    },
    staleTime: 30_000,
  });
  return data;
}
