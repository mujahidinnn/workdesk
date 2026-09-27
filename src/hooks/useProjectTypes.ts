import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { ProjectType } from "@/lib/types";
import { toast } from "sonner";

export function useProjectTypes() {
  return useQuery<ProjectType[]>({
    queryKey: ["project-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_project_types")
        .select("*")
        .order("id");
      if (error) throw error;
      return data as ProjectType[];
    },
    staleTime: 30_000,
  });
}

export function useCreateProjectType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (type_name: string) => {
      const { data, error } = await supabase
        .from("m_project_types")
        .insert({ type_name })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-types"] });
      toast.success("Project type added");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateProjectType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      type_name,
    }: {
      id: number;
      type_name: string;
    }) => {
      const { data, error } = await supabase
        .from("m_project_types")
        .update({ type_name })
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-types"] });
      toast.success("Project type updated");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProjectType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase
        .from("m_project_types")
        .delete()
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["project-types"] });
      qc.invalidateQueries({ queryKey: ["projects"] });
      toast.success("Project type deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
