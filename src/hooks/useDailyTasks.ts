import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type {
  DailyTask,
  DailyTaskWithRelations,
  DashboardSummary,
} from "@/lib/types";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";
import { startOfWeek, endOfWeek, format } from "date-fns";

export interface DailyTaskFilters {
  employeeId?: string;
  projectId?: string;
  /** yyyy-MM-dd, inclusive (`date` is a DATE column) */
  from?: string;
  to?: string;
}

export function useDailyTasks(filters: DailyTaskFilters = {}) {
  return useQuery<DailyTaskWithRelations[]>({
    queryKey: ["daily-tasks", filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("t_daily_tasks")
        .select(
          `
          *,
          employee:m_employees(*),
          project:m_projects(
            *,
            project_type_assignment(type:m_project_types(id, type_name)),
            status:m_work_status(id, status_name)
          )
        `,
        );
      if (filters.employeeId)
        query = query.eq("employee_id", Number(filters.employeeId));
      if (filters.projectId)
        query = query.eq("project_id", Number(filters.projectId));
      if (filters.from) query = query.gte("date", filters.from);
      if (filters.to) query = query.lte("date", filters.to);
      const { data, error } = await query
        .order("date", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return data as DailyTaskWithRelations[];
    },
  });
}

export function useDashboardSummary() {
  return useQuery<DashboardSummary>({
    queryKey: ["dashboard-summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_daily_tasks")
        .select("progress_pct, problem_desc");
      if (error) throw error;
      const tasks = data as Pick<DailyTask, "progress_pct" | "problem_desc">[];
      const totalTasks = tasks.length;
      const avgProgress =
        totalTasks > 0
          ? Math.round(
              tasks.reduce((sum, t) => sum + t.progress_pct, 0) / totalTasks,
            )
          : 0;
      const activeProblems = tasks.filter(
        (t) => t.problem_desc && t.problem_desc.trim().length > 0,
      ).length;
      const completedTasks = tasks.filter((t) => t.progress_pct === 100).length;
      return { totalTasks, avgProgress, activeProblems, completedTasks };
    },
  });
}

export function useTasksPerProject() {
  return useQuery<{ project_code: string; count: number }[]>({
    queryKey: ["tasks-per-project"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_daily_tasks")
        .select(`project:m_projects(project_code)`);
      if (error) throw error;
      const counts: Record<string, number> = {};
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any[]).forEach((row: any) => {
        const code = row.project?.project_code || "Unknown";
        counts[code] = (counts[code] || 0) + 1;
      });
      return Object.entries(counts).map(([project_code, count]) => ({
        project_code,
        count,
      }));
    },
  });
}

export function useCreateDailyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Omit<DailyTask, "id" | "created_at">) => {
      const { data, error } = await supabase
        .from("t_daily_tasks")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["tasks-per-project"] });
      logAudit("create", "daily_task", data.id, { date: data.date });
      toast.success("Task logged successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateDailyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<DailyTask> & { id: number }) => {
      const { data, error } = await supabase
        .from("t_daily_tasks")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["tasks-per-project"] });
      logAudit("update", "daily_task", variables.id, { date: data.date });
      toast.success("Task updated successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteDailyTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("t_daily_tasks")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
      qc.invalidateQueries({ queryKey: ["tasks-per-project"] });
      logAudit("delete", "daily_task", id);
      toast.success("Task deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export type ProblemsLogFilters = Pick<
  DailyTaskFilters,
  "employeeId" | "projectId"
>;

export function useProblemsLog(filters: ProblemsLogFilters = {}) {
  return useQuery<DailyTaskWithRelations[]>({
    queryKey: ["problems-log", filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("t_daily_tasks")
        .select(
          `
          *,
          employee:m_employees(*),
          project:m_projects(*, project_type_assignment(type:m_project_types(id, type_name)), status:m_work_status(id, status_name))
        `,
        )
        .not("problem_desc", "is", null)
        .neq("problem_desc", "");
      if (filters.employeeId)
        query = query.eq("employee_id", Number(filters.employeeId));
      if (filters.projectId)
        query = query.eq("project_id", Number(filters.projectId));
      const { data, error } = await query
        .order("is_resolved", { ascending: true })
        .order("date", { ascending: false });
      if (error) throw error;
      return data as DailyTaskWithRelations[];
    },
  });
}

export function useToggleResolved() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      is_resolved,
    }: {
      id: number;
      is_resolved: boolean;
    }) => {
      const { data, error } = await supabase
        .from("t_daily_tasks")
        .update({ is_resolved })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["problems-log"] });
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface WorkloadEntry {
  employee_id: number;
  employee_name: string;
  role_title: string;
  days: { date: string; count: number; totalProgress: number }[];
  totalTasks: number;
}

export function useWeeklyWorkload() {
  return useQuery<WorkloadEntry[]>({
    queryKey: ["weekly-workload"],
    queryFn: async () => {
      const weekStart = format(
        startOfWeek(new Date(), { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      );
      const weekEnd = format(
        endOfWeek(new Date(), { weekStartsOn: 1 }),
        "yyyy-MM-dd",
      );

      const { data, error } = await supabase
        .from("t_daily_tasks")
        .select(
          "date, employee_id, progress_pct, employee:m_employees(id, full_name, role_title)",
        )
        .gte("date", weekStart)
        .lte("date", weekEnd);
      if (error) throw error;

      const map = new Map<number, WorkloadEntry>();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (data as any[]).forEach((row) => {
        const emp = row.employee;
        if (!emp) return;
        if (!map.has(emp.id)) {
          map.set(emp.id, {
            employee_id: emp.id,
            employee_name: emp.full_name,
            role_title: emp.role_title,
            days: [],
            totalTasks: 0,
          });
        }
        const entry = map.get(emp.id)!;
        const existing = entry.days.find((d) => d.date === row.date);
        if (existing) {
          existing.count += 1;
          existing.totalProgress += row.progress_pct;
        } else {
          entry.days.push({
            date: row.date,
            count: 1,
            totalProgress: row.progress_pct,
          });
        }
        entry.totalTasks += 1;
      });
      return Array.from(map.values()).sort(
        (a, b) => b.totalTasks - a.totalTasks,
      );
    },
    refetchInterval: 60_000,
  });
}
