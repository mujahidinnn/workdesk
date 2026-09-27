import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Employee, EmploymentType } from "@/lib/types";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";

export interface EmployeeFilters {
  status?: Employee["status"];
  employmentType?: EmploymentType;
}

export function useEmployees(filters: EmployeeFilters = {}) {
  return useQuery<Employee[]>({
    queryKey: ["employees", filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase.from("m_employees").select("*");
      if (filters.status) query = query.eq("status", filters.status);
      if (filters.employmentType)
        query = query.eq("employment_type", filters.employmentType);
      const { data, error } = await query.order("created_at", {
        ascending: false,
      });
      if (error) throw error;
      return data as Employee[];
    },
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      // Other columns have DB defaults or are nullable, so a name + job title sheet still imports.
      payload: Partial<Omit<Employee, "id" | "created_at">> &
        Pick<Employee, "full_name" | "role_title">,
    ) => {
      const { data, error } = await supabase
        .from("m_employees")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      logAudit("create", "employee", data.id, { full_name: data.full_name });
      toast.success("Employee added successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: Partial<Employee> & { id: number }) => {
      const { data, error } = await supabase
        .from("m_employees")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      logAudit("update", "employee", variables.id, {
        full_name: data.full_name,
      });
      toast.success("Employee updated successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

/** The DB refuses to drop an employee referenced by daily reports. */
function describeDeleteError(e: Error): string {
  return e.message.includes("violates foreign key constraint")
    ? "This employee already has reported work. Set them to Inactive instead of deleting."
    : e.message;
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("m_employees")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["employees"] });
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
      logAudit("delete", "employee", id);
      toast.success("Employee removed");
    },
    onError: (e: Error) => toast.error(describeDeleteError(e)),
  });
}
