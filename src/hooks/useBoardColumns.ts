import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { BoardColumn } from "@/lib/types";
import { boardKey } from "./useBoard";
import { toast } from "sonner";

type ColumnPatch = Partial<
  Pick<BoardColumn, "name" | "color" | "wip_limit" | "is_done_column" | "position">
>;

export function useAddColumn(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, position }: { name: string; position: number }) => {
      const { error } = await supabase
        .from("t_board_columns")
        .insert({ board_id: boardId, name, position });
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(boardId) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateColumn(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...patch }: ColumnPatch & { id: number }) => {
      const { error } = await supabase.from("t_board_columns").update(patch).eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(boardId) }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteColumn(boardId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("t_board_columns").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: boardKey(boardId) }),
    onError: (e: Error) => toast.error(e.message),
  });
}
