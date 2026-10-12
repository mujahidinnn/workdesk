import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import { TASK_SELECT } from "./useBoard";
import type { BoardTaskRow, MemberRole } from "@/lib/types";

export type MyTask = BoardTaskRow & {
  board: { id: number; name: string; project_id: number };
};

export interface MyStep {
  id: number;
  title: string;
  task: { id: number; task_no: number; title: string; due_date: string | null; archived_at: string | null; board: { id: number; name: string } };
}

export interface MyTasksData {
  assigned: MyTask[];
  steps: MyStep[];
  toReview: MyTask[];
  roles: Record<number, MemberRole>;
}

const SELECT = `${TASK_SELECT}, board:t_boards(id, name, project_id)`;

export function useMyTasks() {
  const { user } = useAuth();
  return useQuery<MyTasksData>({
    queryKey: ["my-tasks", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const [mine, review, roles, steps] = await Promise.all([
        supabase.from("t_task_assignees").select("task_id").eq("user_id", user!.id),
        supabase.from("t_tasks").select(SELECT).eq("status", "in_review").is("archived_at", null),
        supabase.from("m_project_members").select("project_id, member_role").eq("user_id", user!.id),
        supabase
          .from("t_task_steps")
          .select("id, title, task:t_tasks!inner(id, task_no, title, due_date, archived_at, board:t_boards(id, name))")
          .eq("assignee_id", user!.id)
          .eq("is_done", false)
          .is("task.archived_at", null),
      ]);
      for (const r of [mine, review, roles, steps]) if (r.error) throw r.error;
      const ids = mine.data!.map((r) => r.task_id);
      const assigned = ids.length
        ? await supabase.from("t_tasks").select(SELECT).in("id", ids).is("archived_at", null)
        : { data: [], error: null };
      if (assigned.error) throw assigned.error;
      return {
        assigned: assigned.data as unknown as MyTask[],
        toReview: review.data as unknown as MyTask[],
        steps: steps.data as unknown as MyStep[],
        roles: Object.fromEntries(
          roles.data!.map((r) => [r.project_id, r.member_role as MemberRole]),
        ),
      };
    },
  });
}

export interface BoardTaskRef {
  id: number;
  task_no: number;
  title: string;
  board: { id: number; name: string };
}

export function useBoardTaskRef(id: number | null) {
  return useQuery<BoardTaskRef | null>({
    queryKey: ["board-task-ref", id],
    enabled: id != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_tasks")
        .select("id, task_no, title, board:t_boards(id, name)")
        .eq("id", id!)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as BoardTaskRef | null;
    },
  });
}
