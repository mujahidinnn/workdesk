import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Division } from "@/lib/types";
import { toast } from "sonner";

export function useDivisions() {
  return useQuery<Division[]>({
    queryKey: ["divisions"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_divisions")
        .select("*")
        .order("name");
      if (error) throw error;
      return data as Division[];
    },
    staleTime: 60_000,
  });
}

export function useSaveDivision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...values
    }: {
      id?: number;
      name: string;
      description: string | null;
    }) => {
      const { error } = id
        ? await supabase.from("m_divisions").update(values).eq("id", id)
        : await supabase.from("m_divisions").insert(values);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["divisions"] });
      toast.success("Division saved");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteDivision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("m_divisions").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["divisions"] });
      toast.success("Division deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useToggleDivision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_active }: { id: number; is_active: boolean }) => {
      const { error } = await supabase.from("m_divisions").update({ is_active }).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["divisions"] }),
    onError: (e: Error) => toast.error(e.message),
  });
}
