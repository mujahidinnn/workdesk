import { useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { subscribeShared } from "@/lib/realtimeSubscription";
import type {
  Board,
  BoardColumn,
  BoardMember,
  BoardTaskRow,
  MemberRole,
  Project,
  TaskLabel,
} from "@/lib/types";
import { toast } from "sonner";
import { BANNER_BUCKET } from "./useBoards";
import { isStoredImage } from "@/lib/bannerPatterns";

export interface BoardData {
  board: Board & {
    project: Pick<Project, "id" | "project_code" | "project_name">;
  };
  columns: BoardColumn[];
  tasks: BoardTaskRow[];
  labels: TaskLabel[];
  members: BoardMember[];
}

export const boardKey = (boardId: number) => ["board", boardId] as const;

export const TASK_SELECT =
  "*, assignees:t_task_assignees(user_id, assigned_by), reviewers:t_task_reviewers(user_id), steps:t_task_steps(id, is_done, assignee_id, done_by), labels:t_task_label_map(label_id), reviews:t_task_reviews(decision, created_at)";

export function useBoard(boardId: number) {
  const qc = useQueryClient();

  useEffect(() => {
    const refresh = () => {
      qc.invalidateQueries({ queryKey: boardKey(boardId) });
      qc.invalidateQueries({ queryKey: ["task-steps"] });
    };
    // ponytail: assignees/steps have no board_id to filter on, so every visible
    // change refetches this board; add board_id to them if boards get busy.
    return subscribeShared(`board-${boardId}`, (ch) => {
      ch.on("postgres_changes", { event: "*", schema: "public", table: "t_tasks", filter: `board_id=eq.${boardId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "t_board_columns", filter: `board_id=eq.${boardId}` }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "t_task_assignees" }, refresh)
        .on("postgres_changes", { event: "*", schema: "public", table: "t_task_steps" }, refresh);
    });
  }, [boardId, qc]);

  return useQuery<BoardData>({
    queryKey: boardKey(boardId),
    enabled: Number.isFinite(boardId),
    queryFn: async () => {
      const [board, columns, tasks, labels] = await Promise.all([
        supabase
          .from("t_boards")
          .select("*, project:m_projects(id, project_code, project_name)")
          .eq("id", boardId)
          .single(),
        supabase.from("t_board_columns").select("*").eq("board_id", boardId).order("position"),
        supabase.from("t_tasks").select(TASK_SELECT).eq("board_id", boardId).is("archived_at", null),
        supabase.from("t_task_labels").select("*").eq("board_id", boardId).order("name"),
      ]);
      for (const r of [board, columns, tasks, labels]) if (r.error) throw r.error;
      const members = await supabase
        .from("m_project_members")
        .select("user_id, member_role, profile:profiles(id, full_name, avatar_url)")
        .eq("project_id", board.data!.project_id);
      if (members.error) throw members.error;
      return {
        board: board.data as BoardData["board"],
        columns: columns.data as BoardColumn[],
        tasks: tasks.data as unknown as BoardTaskRow[],
        labels: labels.data as TaskLabel[],
        members: members.data as BoardMember[],
      };
    },
  });
}

export function useSetMemberRole(boardId: number, projectId: number) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: MemberRole }) => {
      const { error } = await supabase
        .from("m_project_members")
        .update({ member_role: role })
        .eq("project_id", projectId)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: boardKey(boardId) }),
        qc.invalidateQueries({ queryKey: ["my-project-roles"] }),
        qc.invalidateQueries({ queryKey: ["project-members", projectId] }),
      ]),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useSetBanner() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ boardId, current, value }: { boardId: number; current: string | null; value: File | string | null }) => {
      let path: string | null = typeof value === "string" ? value : null;
      if (value instanceof File) {
        path = `${boardId}/${crypto.randomUUID()}.${value.name.split(".").pop()}`;
        const { error } = await supabase.storage.from(BANNER_BUCKET).upload(path, value);
        if (error) throw error;
      }
      const { error } = await supabase.from("t_boards").update({ background: path }).eq("id", boardId);
      if (error) {
        if (value instanceof File && path) await supabase.storage.from(BANNER_BUCKET).remove([path]);
        throw error;
      }
      if (isStoredImage(current)) await supabase.storage.from(BANNER_BUCKET).remove([current]);
    },
    onSuccess: (_d, { boardId }) => {
      qc.invalidateQueries({ queryKey: boardKey(boardId) });
      qc.invalidateQueries({ queryKey: ["board-stats"] });
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export interface ArchivedTask {
  id: number;
  task_no: number;
  title: string;
  description: string | null;
  expected_output: string | null;
  status: string;
  division_id: number | null;
  due_date: string | null;
  parent_id: number | null;
  archived_at: string;
  parent: { task_no: number; title: string } | null;
  column: { name: string } | null;
  assignees: { user_id: string }[];
  steps: { is_done: boolean }[];
  children: { id: number }[];
  archived_by: string | null;
}

export function useArchivedTasks(boardId: number, enabled: boolean) {
  return useQuery<ArchivedTask[]>({
    queryKey: ["board-archived", boardId],
    enabled,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_tasks")
        .select(
          "id, task_no, title, description, expected_output, status, division_id, due_date, parent_id, archived_at, parent:parent_id(task_no, title), column:t_board_columns(name), assignees:t_task_assignees(user_id), steps:t_task_steps(is_done), children:t_tasks!parent_id(id)",
        )
        .eq("board_id", boardId)
        .not("archived_at", "is", null)
        .order("archived_at", { ascending: false });
      if (error) throw error;
      const rows = data as unknown as Omit<ArchivedTask, "archived_by">[];
      const { data: acts, error: actErr } = rows.length
        ? await supabase
            .from("t_task_activity")
            .select("task_id, actor_id")
            .eq("action", "archived")
            .in("task_id", rows.map((r) => r.id))
            .order("created_at", { ascending: false })
        : { data: [], error: null };
      if (actErr) throw actErr;
      const by = new Map<number, string | null>();
      for (const a of acts ?? []) if (!by.has(a.task_id)) by.set(a.task_id, a.actor_id);
      return rows.map((r) => ({ ...r, archived_by: by.get(r.id) ?? null }));
    },
  });
}

export type ProfileLite = { id: string; full_name: string | null; avatar_url: string | null };

export function useProfiles(ids: string[]) {
  const list = [...new Set(ids)].sort();
  return useQuery<ProfileLite[]>({
    queryKey: ["profiles-lite", list],
    enabled: list.length > 0,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("id, full_name, avatar_url").in("id", list);
      if (error) throw error;
      return data as ProfileLite[];
    },
  });
}
