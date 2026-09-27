import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { Project, ProjectType, WorkStatus } from "@/lib/types";
import { logAudit } from "@/lib/audit";
import { toast } from "sonner";

export interface ProjectPayload {
  project_code: string;
  project_name: string;
  client: string;
  pic_name?: string;
  pic_contact?: string;
  priority?: string;
  status_id?: number | null;
  start_date?: string | null;
  end_date?: string | null;
  project_type_ids: number[];
  member_user_ids: string[];
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function flattenProject(row: any): Project {
  const project_types: ProjectType[] = (row.project_type_assignment ?? [])
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .map((a: any) => a.type)
    .filter(Boolean);
  const work_status: WorkStatus | null = row.status ?? null;
  const member_user_ids: string[] = (row.m_project_members ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (m: any) => m.user_id,
  );
  return {
    ...row,
    project_types,
    work_status,
    member_user_ids,
    project_type_assignment: undefined,
    status: undefined,
    m_project_members: undefined,
    type_filter: undefined,
  };
}

export interface ProjectFilters {
  statusId?: string;
  typeId?: string;
  priority?: string;
}

export function useProjects(filters: ProjectFilters = {}) {
  return useQuery<Project[]>({
    queryKey: ["projects", filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      // The type filter goes through a separate !inner alias so the
      // project_type_assignment embed still returns every type of a match.
      let query = supabase.from("m_projects").select(
        `
          *,
          project_type_assignment(type:m_project_types(id, type_name)),
          status:m_work_status(id, status_name),
          m_project_members(user_id)
          ${filters.typeId ? ", type_filter:project_type_assignment!inner(type_id)" : ""}
        `,
      );
      if (filters.statusId)
        query = query.eq("status_id", Number(filters.statusId));
      if (filters.priority) query = query.eq("priority", filters.priority);
      if (filters.typeId)
        query = query.eq("type_filter.type_id", Number(filters.typeId));
      const { data, error } = await query.order("created_at", {
        ascending: false,
      });
      if (error) throw error;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data as any[]).map(flattenProject);
    },
  });
}

async function syncProjectTypes(projectId: number, typeIds: number[]) {
  const { error: delErr } = await supabase
    .from("project_type_assignment")
    .delete()
    .eq("project_id", projectId);
  if (delErr) throw delErr;

  if (typeIds.length > 0) {
    const rows = typeIds.map((type_id) => ({ project_id: projectId, type_id }));
    const { error: insErr } = await supabase
      .from("project_type_assignment")
      .insert(rows);
    if (insErr) throw insErr;
  }
}

async function syncProjectMembers(projectId: number, userIds: string[]) {
  const { error: delErr } = await supabase
    .from("m_project_members")
    .delete()
    .eq("project_id", projectId);
  if (delErr) throw delErr;

  if (userIds.length > 0) {
    const rows = userIds.map((user_id) => ({ project_id: projectId, user_id }));
    const { error: insErr } = await supabase
      .from("m_project_members")
      .insert(rows);
    if (insErr) throw insErr;
  }
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      project_type_ids,
      member_user_ids,
      ...payload
    }: ProjectPayload) => {
      const { data, error } = await supabase
        .from("m_projects")
        .insert(payload)
        .select()
        .single();
      if (error) throw error;
      await syncProjectTypes(data.id, project_type_ids);
      await syncProjectMembers(data.id, member_user_ids);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      logAudit("create", "project", data.id, {
        project_code: data.project_code,
      });
      toast.success("Project created successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useUpdateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      project_type_ids,
      member_user_ids,
      ...payload
    }: ProjectPayload & { id: number }) => {
      const { data, error } = await supabase
        .from("m_projects")
        .update(payload)
        .eq("id", id)
        .select()
        .single();
      if (error) throw error;
      await syncProjectTypes(id, project_type_ids);
      await syncProjectMembers(id, member_user_ids);
      return data;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      logAudit("update", "project", variables.id, {
        project_code: data.project_code,
      });
      toast.success("Project updated successfully");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error } = await supabase.from("m_projects").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["daily-tasks"] });
      logAudit("delete", "project", id);
      toast.success("Project deleted");
    },
    onError: (e: Error) => toast.error(e.message),
  });
}
