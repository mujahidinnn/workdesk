import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { WorkStatus } from "@/lib/types";
import { toast } from "sonner";

export function useWorkStatuses() {
  return useQuery<WorkStatus[]>({
    queryKey: ["work-statuses"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_work_status")
        .select("*")
        .order("id");
      if (error) throw error;
      return data as WorkStatus[];
    },
    staleTime: 30_000,
  });
}

export function useCreateWorkStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (status_name: string) => {
      const { data, error } = await supabase
        .from("m_work_status")
        .insert({ status_name })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-statuses"] });
      toast.success("Status added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateWorkStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status_name,
    }: {
      id: number;
      status_name: string;
    }) => {
      const { data, error } = await supabase
        .from("m_work_status")
        .update({ status_name })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-statuses"] });
      toast.success("Status updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteWorkStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("m_work_status")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["work-statuses"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Status deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
