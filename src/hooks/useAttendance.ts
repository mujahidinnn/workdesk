import { useEffect, useState } from "react";
import {
  useQuery,
  useMutation,
  useQueryClient,
  keepPreviousData,
} from "@tanstack/react-query";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/context/auth";
import { logAudit } from "@/lib/audit";
import i18n from "@/lib/i18n";
import { toast } from "sonner";
import type {
  Attendance,
  AttendanceWithProfile,
  AttendanceStatus,
} from "@/lib/types";

const QK = ["attendance"] as const;
const BUCKET = "attendance-attachments";
const SIGNED_URL_TTL = 60 * 60; // 1 hour - bucket is private

// Paths starting with "/" are demo files in public/demo, not bucket objects.
/** A path starting with "/" is a file shipped with the app (the demo seed's
 *  files live in public/demo), not an object in the bucket. */
const isStatic = (path: string) => path.startsWith("/");

// Storage policy requires files under the uploader's folder.
/** Stores the file under the uploader's folder, as the storage policy requires. */
async function uploadAttachment(uploaderId: string, file: File) {
  const ext = file.name.split(".").pop();
  const path = `${uploaderId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, file);
  if (error) throw error;
  return { attachment_path: path, attachment_name: file.name };
}

// Removes the uploaded file if the insert fails.
/** Uploads the optional file, then inserts; drops the file if the insert fails. */
async function insertWithAttachment(
  uploaderId: string | undefined,
  payload: Record<string, unknown> & { user_id: string; date: string; status: AttendanceStatus },
  file?: File | null,
) {
  if (file && !uploaderId) throw new Error("Not signed in");
  const att = file ? await uploadAttachment(uploaderId!, file) : null;
  const { data, error } = await supabase
    .from("t_attendance")
    .insert({ ...payload, ...att })
    .select()
    .single();
  if (error) {
    if (att) await supabase.storage.from(BUCKET).remove([att.attachment_path]);
    throw error;
  }
  return data;
}

/** Turns the raw Postgres complaints into something an employee can read. */
function friendlyError(e: Error): string {
  const msg = e.message ?? "";
  if (msg.includes("duplicate key"))
    return i18n.t("attendance.errors.duplicate");
  if (msg.includes("period is closed"))
    return i18n.t("attendance.errors.locked");
  if (msg.includes("No open check-in"))
    return i18n.t("attendance.errors.noOpenCheckIn");
  if (msg.includes("attendance_note_required"))
    return i18n.t("attendance.errors.noteRequired");
  if (msg.includes("Check-out must be later"))
    return i18n.t("attendance.errors.clockOrder");
  return msg;
}

/** Today in yyyy-MM-dd, updates when a tab stays open past midnight. */
export function useToday(): string {
  const [today, setToday] = useState(() => format(new Date(), "yyyy-MM-dd"));
  useEffect(() => {
    const id = setInterval(
      () => setToday(format(new Date(), "yyyy-MM-dd")),
      60_000,
    );
    return () => clearInterval(id);
  }, []);
  return today;
}

export interface AttendanceFilters {
  userId?: string;
  status?: AttendanceStatus;
}

/** Filters server-side to stay under PostgREST's 1000 row cap. */
export function useAttendance(
  from: string,
  to: string,
  filters: AttendanceFilters = {},
) {
  return useQuery<AttendanceWithProfile[]>({
    queryKey: [...QK, from, to, filters],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("t_attendance")
        .select(
          "*, profile:profiles!t_attendance_user_id_fkey(id, full_name, avatar_url)",
        )
        .gte("date", from)
        .lte("date", to);
      if (filters.userId) query = query.eq("user_id", filters.userId);
      if (filters.status) query = query.eq("status", filters.status);
      const { data, error } = await query.order("date", { ascending: false });
      if (error) throw error;
      const rows = data as AttendanceWithProfile[];
      const paths = rows.flatMap((r) =>
        r.attachment_path && !isStatic(r.attachment_path) ? r.attachment_path : [],
      );
      const urls = new Map<string, string>();
      if (paths.length) {
        const { data: signed } = await supabase.storage
          .from(BUCKET)
          .createSignedUrls(paths, SIGNED_URL_TTL);
        for (const s of signed ?? []) if (s.path) urls.set(s.path, s.signedUrl);
      }
      for (const r of rows) {
        const p = r.attachment_path;
        r.attachment_url = !p ? null : isStatic(p) ? p : urls.get(p);
      }
      return rows;
    },
  });
}

/** Today's attendance row for one user, or null when not yet recorded. */
export function useTodayAttendance(userId: string | undefined, date: string) {
  return useQuery<Attendance | null>({
    queryKey: [...QK, "today", userId, date],
    enabled: !!userId,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_attendance")
        .select("*")
        .eq("user_id", userId as string)
        .eq("date", date)
        .maybeSingle();
      if (error) throw error;
      return data as Attendance | null;
    },
  });
}

export type CheckInPayload = {
  user_id: string;
  date: string;
  status: AttendanceStatus;
  note?: string | null;
  file?: File | null;
};

/** Date and clock_in are stamped by the server clock, never the device. */
export function useCheckIn() {
  const qc = useQueryClient();
  const { user } = useAuth();
  return useMutation({
    mutationFn: ({ file, ...payload }: CheckInPayload) =>
      insertWithAttachment(user?.id, payload, file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("create", "attendance", data.id, {
        status: data.status,
        date: data.date,
      });
      toast.success(i18n.t("attendance.toast.checkedIn"));
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/** Closes today's open check-in using the server clock. */
export function useCheckOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data, error } = await supabase.rpc("attendance_check_out");
      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("update", "attendance", data.id, { clock_out: data.clock_out });
      toast.success(i18n.t("attendance.toast.checkedOut"));
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export type AttendanceCorrection = {
  id: number;
  status: AttendanceStatus;
  clock_in: string | null;
  clock_out: string | null;
  note: string | null;
  updated_by: string;
  /** New file replaces the current one (old_path) when given. */
  file?: File | null;
  old_path?: string | null;
};

/** Admin correction of an existing record's status / clock in / clock out. */
export function useUpdateAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file, old_path, ...payload }: AttendanceCorrection) => {
      const att = file ? await uploadAttachment(payload.updated_by, file) : null;
      const { data, error } = await supabase
        .from("t_attendance")
        .update({ ...payload, ...att, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) {
        if (att) await supabase.storage.from(BUCKET).remove([att.attachment_path]);
        throw error;
      }
      if (att && old_path && !isStatic(old_path))
        await supabase.storage.from(BUCKET).remove([old_path]);
      return data;
    },
    onSuccess: (data, variables) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("update", "attendance", variables.id, { status: data.status });
      toast.success("Attendance updated");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

/** Admin manual entry - logging attendance on behalf of an employee. */
export function useCreateAttendanceForUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      file,
      ...payload
    }: {
      user_id: string;
      date: string;
      status: AttendanceStatus;
      clock_in: string | null;
      clock_out: string | null;
      note: string | null;
      updated_by: string;
      file?: File | null;
    }) => insertWithAttachment(payload.updated_by, payload, file),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("create", "attendance", data.id, {
        status: data.status,
        date: data.date,
      });
      toast.success("Attendance added");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}

export function useDeleteAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      attachment_path,
    }: Pick<Attendance, "id" | "attachment_path">) => {
      const { error } = await supabase
        .from("t_attendance")
        .delete()
        .eq("id", id);
      if (error) throw error;
      // Row first: a failed delete must not leave the record pointing at nothing.
      if (attachment_path && !isStatic(attachment_path))
        await supabase.storage.from(BUCKET).remove([attachment_path]);
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: [...QK] });
      logAudit("delete", "attendance", id);
      toast.success("Attendance record deleted");
    },
    onError: (e: Error) => toast.error(friendlyError(e)),
  });
}
