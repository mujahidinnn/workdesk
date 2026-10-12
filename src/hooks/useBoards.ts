import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/context/auth";
import { supabase } from "@/integrations/supabase/client";
import type { Board, BoardMember, MemberRole, TaskStatus } from "@/lib/types";
import { toast } from "sonner";
import { isStoredImage } from "@/lib/bannerPatterns";

export interface BoardCardStats {
  board_id: number;
  project_id: number;
  background: string | null;
  open: number;
  overdue: number;
  done: number;
}

export function useBoardStats() {
  return useQuery<Record<number, BoardCardStats>>({
    queryKey: ["board-stats"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_boards")
        .select("id, project_id, background, t_tasks(status, due_date, archived_at, parent_id)")
        .is("t_tasks.parent_id", null)
        .is("t_tasks.archived_at", null);
      if (error) throw error;
      const today = new Date().toISOString().slice(0, 10);
      const out: Record<number, BoardCardStats> = {};
      for (const b of data) {
        const tasks = b.t_tasks as { status: TaskStatus; due_date: string | null }[];
        const open = tasks.filter((t) => t.status !== "done");
        out[b.project_id] = {
          board_id: b.id,
          project_id: b.project_id,
          background: b.background,
          open: open.length,
          overdue: open.filter((t) => t.due_date && t.due_date < today).length,
          done: tasks.length - open.length,
        };
      }
      return out;
    },
  });
}

export function useEnsureBoard() {
  return useMutation({
    mutationFn: async (projectId: number) => {
      const { data, error } = await supabase.rpc("ensure_board", {
        p_project_id: projectId,
      });
      if (error) throw error;
      return data as Board;
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export const BANNER_BUCKET = "board-banners";

export function useBannerUrls(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter(isStoredImage))].sort();
  return useQuery<Record<string, string>>({
    queryKey: ["banner-urls", list],
    enabled: list.length > 0,
    staleTime: 50 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.storage.from(BANNER_BUCKET).createSignedUrls(list, 60 * 60);
      if (error) throw error;
      return Object.fromEntries(data.filter((d) => d.signedUrl).map((d) => [d.path!, d.signedUrl]));
    },
  });
}

export function useBoardOrder() {
  const { user } = useAuth();
  return useQuery<Record<number, number>>({
    queryKey: ["board-order", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("t_board_order").select("project_id, position");
      if (error) throw error;
      return Object.fromEntries(data.map((r) => [r.project_id, Number(r.position)]));
    },
  });
}

export function useSaveBoardOrder() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["board-order", user?.id];
  return useMutation({
    mutationFn: async (projectIds: number[]) => {
      const rows = projectIds.map((project_id, i) => ({ project_id, position: (i + 1) * 1024 }));
      const { error } = await supabase.from("t_board_order").upsert(rows, { onConflict: "user_id,project_id" });
      if (error) throw error;
    },
    onMutate: (projectIds) => {
      const prev = qc.getQueryData(key);
      qc.setQueryData(key, Object.fromEntries(projectIds.map((id, i) => [id, (i + 1) * 1024])));
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      qc.setQueryData(key, ctx?.prev);
      toast.error(e.message);
    },
  });
}

export function useMyProjectRoles() {
  const { user } = useAuth();
  return useQuery<Record<number, MemberRole>>({
    queryKey: ["my-project-roles", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_project_members")
        .select("project_id, member_role")
        .eq("user_id", user!.id);
      if (error) throw error;
      return Object.fromEntries(data.map((r) => [r.project_id, r.member_role as MemberRole]));
    },
  });
}

export function useProjectMembers(projectId: number | null) {
  return useQuery<BoardMember[]>({
    queryKey: ["project-members", projectId],
    enabled: projectId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("m_project_members")
        .select("user_id, member_role, profile:profiles(id, full_name, avatar_url)")
        .eq("project_id", projectId!);
      if (error) throw error;
      return data as BoardMember[];
    },
  });
}
