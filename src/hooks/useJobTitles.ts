import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

interface JobTitleMaps {
  byEmployee: Record<number, string>;
  byUser: Record<string, string>;
}

/**
 * Job title (m_employees.role_title, e.g. "QA Engineer") for anyone shown by
 * name. Look up by employee id or by auth user id; missing = no title.
 */
export function useJobTitles() {
  const { data } = useQuery<JobTitleMaps>({
    queryKey: ["job-titles"],
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const [emps, profiles] = await Promise.all([
        supabase.from("m_employees").select("id, role_title"),
        supabase.from("profiles").select("id, employee_id").not("employee_id", "is", null),
      ]);
      if (emps.error) throw emps.error;
      if (profiles.error) throw profiles.error;

      const byEmployee: Record<number, string> = {};
      for (const e of emps.data) if (e.role_title) byEmployee[e.id] = e.role_title;
      const byUser: Record<string, string> = {};
      for (const p of profiles.data) {
        const title = p.employee_id != null ? byEmployee[p.employee_id] : undefined;
        if (title) byUser[p.id] = title;
      }
      return { byEmployee, byUser };
    },
  });

  return {
    byEmployee: (id: number | null | undefined) =>
      id != null ? data?.byEmployee[id] : undefined,
    byUser: (id: string | null | undefined) => (id ? data?.byUser[id] : undefined),
  };
}
