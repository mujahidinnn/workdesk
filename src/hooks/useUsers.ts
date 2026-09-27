import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { UserWithEmail } from "@/lib/types";
import { toast } from "sonner";

export interface UserFilters {
  roleId?: string;
  linked?: "linked" | "unlinked";
}

export function useUsers(filters: UserFilters = {}) {
  return useQuery<UserWithEmail[]>({
    queryKey: ["users", filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // get_users_with_email RETURNS TABLE, so PostgREST filters apply to it.
      let query = supabase.rpc("get_users_with_email");
      if (filters.roleId) query = query.eq("role_id", Number(filters.roleId));
      if (filters.linked === "linked")
        query = query.not("employee_id", "is", null);
      if (filters.linked === "unlinked") query = query.is("employee_id", null);
      const { data, error } = await query;
      if (error) throw error;
      return data as UserWithEmail[];
    },
  });
}

export function useUpdateUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      roleId,
    }: {
      userId: string;
      roleId: number | null;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ role_id: roleId })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Role updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateUserEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      userId,
      employeeId,
    }: {
      userId: string;
      employeeId: number | null;
    }) => {
      const { error } = await supabase
        .from("profiles")
        .update({ employee_id: employeeId })
        .eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("Linked employee updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      email: string;
      password: string;
      full_name: string;
      role_id: number;
      employee_id?: number | null;
    }) => {
      const { data, error } = await supabase.functions.invoke("create-user", {
        body: payload,
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
      return data as { id: string; email: string };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User account created");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke("delete-user", {
        body: { user_id: userId },
      });
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User access revoked");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useReactivateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data, error } = await supabase.functions.invoke(
        "reactivate-user",
        { body: { user_id: userId } },
      );
      if (error) throw new Error(error.message);
      if (data?.error) throw new Error(data.error);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["users"] });
      toast.success("User access restored");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
