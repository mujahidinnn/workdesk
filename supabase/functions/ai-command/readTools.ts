// Read tools for the AI loop. Every query runs on the caller's JWT client, so RLS decides what the AI sees.
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.57.4";
import type { Ref } from "../_shared/aiLoop.ts";

const LIMIT = 50;
const MAX_TEXT = 300;
const TZ = "Asia/Jakarta";
const DEFAULT_WORK_DAYS = [1, 2, 3, 4, 5];

// deno-lint-ignore no-explicit-any
type Row = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
// deno-lint-ignore no-explicit-any
type Args = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any

export const wibToday = (d = new Date()) => d.toLocaleDateString("en-CA", { timeZone: TZ });

export function weekBounds(today = wibToday()): { from: string; to: string } {
  const d = new Date(`${today}T00:00:00Z`);
  const mon = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000);
  const sun = new Date(mon.getTime() + 6 * 86_400_000);
  return { from: mon.toISOString().slice(0, 10), to: sun.toISOString().slice(0, 10) };
}

function cut(v: unknown): unknown {
  if (typeof v === "string") return v.length > MAX_TEXT ? v.slice(0, MAX_TEXT) + "..." : v;
  if (Array.isArray(v)) return v.map(cut);
  if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, cut(x)]));
  return v;
}

function ok<T>(r: { data: T | null; error: { message: string } | null }): T {
  if (r.error) throw new Error(r.error.message);
  return r.data as T;
}

const one = <T>(v: T | T[] | null | undefined): T | undefined => (Array.isArray(v) ? v[0] : v ?? undefined);
const person = (id: string, name?: string | null): Ref => ({ type: "person", id, label: name ?? id });

// Same rule as countLeaveWorkingDays in useLeaveRequests and the DB approval trigger.
function workingDays(start: string, end: string, workDays: number[], holidays: Set<string>): number {
  let n = 0;
  for (let t = Date.parse(`${start}T00:00:00Z`); t <= Date.parse(`${end}T00:00:00Z`); t += 86_400_000) {
    const d = new Date(t);
    const iso = d.getUTCDay() === 0 ? 7 : d.getUTCDay();
    if (workDays.includes(iso) && !holidays.has(d.toISOString().slice(0, 10))) n++;
  }
  return n;
}

async function employeeIdOf(c: SupabaseClient, userId: string): Promise<number | null> {
  const p = ok(await c.from("profiles").select("employee_id").eq("id", userId).maybeSingle()) as Row | null;
  return p?.employee_id ?? null;
}

const TASK_COLS =
  "id, task_no, title, status, priority, due_date, completed_at, board_id, board:t_boards(name), " +
  "assignees:t_task_assignees(user_id, profile:profiles!t_task_assignees_user_id_fkey(full_name))";

function taskRefs(tasks: Row[]): Ref[] {
  const refs: Ref[] = [];
  for (const t of tasks) {
    refs.push({ type: "task", id: String(t.id), label: t.title });
    const b = one(t.board) as Row | undefined;
    if (b) refs.push({ type: "board", id: String(t.board_id), label: b.name });
    for (const a of t.assignees ?? []) refs.push(person(a.user_id, one(a.profile as Row)?.full_name));
  }
  return refs;
}

function taskRow(t: Row) {
  return {
    id: t.id, no: t.task_no, title: t.title, status: t.status, priority: t.priority, due_date: t.due_date,
    completed_at: t.completed_at, board_id: t.board_id, board: one(t.board as Row)?.name,
    assignees: (t.assignees ?? []).map((a: Row) => ({ id: a.user_id, name: one(a.profile as Row)?.full_name })),
  };
}

type Tool = (c: SupabaseClient, a: Args, userId: string) => Promise<{ data: unknown; refs: Ref[] }>;

const TOOLS: Record<string, Tool> = {
  async find_people(c, a) {
    const rows = ok(await c.from("profiles")
      .select("id, full_name, employee:m_employees(role_title, department)")
      .ilike("full_name", `%${a.query}%`).order("full_name").limit(LIMIT)) as Row[];
    return {
      data: rows.map((r) => ({ id: r.id, name: r.full_name, position: one(r.employee as Row)?.role_title, division: one(r.employee as Row)?.department })),
      refs: rows.map((r) => person(r.id, r.full_name)),
    };
  },

  // chat_channels_select RLS (chat_user_can_read) limits rows to channels the caller belongs to.
  async find_channels(c, a, userId) {
    const rows = ok(await c.from("t_chat_channels").select(
      "id, type, name, dm_user_a, project:m_projects(project_name), " +
      "user_a:profiles!t_chat_channels_dm_user_a_fkey(full_name), user_b:profiles!t_chat_channels_dm_user_b_fkey(full_name)",
    ).order("id")) as Row[];
    const label = (r: Row): string => {
      if (r.type === "general") return "General";
      if (r.type === "project") return r.name ?? one(r.project as Row)?.project_name ?? "Project";
      return one((r.dm_user_a === userId ? r.user_b : r.user_a) as Row)?.full_name ?? "Direct Message";
    };
    const q = (a.query ?? "").toLowerCase();
    const hits = rows.map((r) => ({ id: r.id, type: r.type, name: label(r) }))
      .filter((r) => r.name.toLowerCase().includes(q)).slice(0, LIMIT);
    return { data: hits, refs: hits.map((r) => ({ type: "channel" as const, id: String(r.id), label: r.name })) };
  },

  async find_boards(c, a) {
    let q = c.from("t_boards").select("id, name, project_id, project:m_projects(project_code, project_name)");
    if (a.member_id) {
      const m = ok(await c.from("m_project_members").select("project_id").eq("user_id", a.member_id)) as Row[];
      q = q.in("project_id", m.map((r) => r.project_id));
    }
    const rows = ok(await q.order("name").limit(LIMIT)) as Row[];
    return {
      data: rows.map((b) => ({ id: b.id, name: b.name, project_id: b.project_id, project: one(b.project as Row)?.project_name })),
      refs: rows.flatMap((b) => [
        { type: "board" as const, id: String(b.id), label: b.name },
        { type: "project" as const, id: String(b.project_id), label: one(b.project as Row)?.project_name ?? b.name },
      ]),
    };
  },

  async list_tasks(c, a) {
    let q = c.from("t_tasks").select(TASK_COLS + (a.assignee_id ? ", filter:t_task_assignees!inner(user_id)" : "")).is("archived_at", null);
    if (a.assignee_id) q = q.eq("filter.user_id", a.assignee_id);
    if (a.board_id) q = q.eq("board_id", a.board_id);
    if (a.status) q = q.eq("status", a.status);
    if (a.due_from) q = q.gte("due_date", a.due_from);
    if (a.due_to) q = q.lte("due_date", a.due_to);
    const rows = ok(await q.order("due_date", { ascending: true, nullsFirst: false }).limit(LIMIT)) as Row[];
    return { data: rows.map(taskRow), refs: taskRefs(rows) };
  },

  async get_task(c, a) {
    const t = ok(await c.from("t_tasks")
      .select(TASK_COLS + ", description, steps:t_task_steps!t_task_steps_task_id_fkey(id, title, is_done, position)")
      .eq("id", a.task_id).maybeSingle()) as Row | null;
    if (!t) return { data: { error: "task not found or not visible to this user" }, refs: [] };
    const comments = ok(await c.from("t_board_task_comments")
      .select("comment, created_at, user_id, author:profiles!t_board_task_comments_user_id_fkey(full_name)")
      .eq("task_id", a.task_id).order("created_at", { ascending: false }).limit(5)) as Row[];
    const steps = ((t.steps ?? []) as Row[]).sort((x, y) => x.position - y.position).slice(0, LIMIT);
    return {
      data: {
        ...taskRow(t), description: t.description,
        steps: steps.map((s) => ({ id: s.id, title: s.title, done: s.is_done })),
        latest_comments: comments.map((m) => ({ by: one(m.author as Row)?.full_name, at: m.created_at, text: m.comment })),
      },
      refs: [
        ...taskRefs([t]),
        ...steps.map((s) => ({ type: "step" as const, id: String(s.id), label: s.title })),
        ...comments.map((m) => person(m.user_id, one(m.author as Row)?.full_name)),
      ],
    };
  },

  async work_summary(c, a) {
    const { from, to } = { ...weekBounds(), ...strip(a, ["from", "to"]) };
    const base = () => c.from("t_tasks").select(TASK_COLS + ", filter:t_task_assignees!inner(user_id)")
      .eq("filter.user_id", a.person_id).is("archived_at", null);
    const open = ok(await base().in("status", ["todo", "in_progress", "in_review"]).order("due_date").limit(LIMIT)) as Row[];
    const done = ok(await base().eq("status", "done")
      .gte("completed_at", `${from}T00:00:00+07:00`).lte("completed_at", `${to}T23:59:59+07:00`).limit(LIMIT)) as Row[];
    const emp = await employeeIdOf(c, a.person_id);
    const reports = emp === null ? [] : ok(await c.from("t_daily_tasks")
      .select("date, task_desc, progress_pct, problem_desc, is_resolved, project_id, project:m_projects(project_name)")
      .eq("employee_id", emp).gte("date", from).lte("date", to).order("date", { ascending: false }).limit(LIMIT)) as Row[];
    const report = (r: Row) => ({ date: r.date, project: one(r.project as Row)?.project_name, task: r.task_desc, progress_pct: r.progress_pct });
    return {
      data: {
        from, to,
        done: done.map(taskRow),
        in_review: open.filter((t) => t.status === "in_review").map(taskRow),
        running: open.filter((t) => t.status !== "in_review").map(taskRow),
        daily_reports: reports.map(report),
        blockers: reports.filter((r) => r.problem_desc && !r.is_resolved).map((r) => ({ ...report(r), problem: r.problem_desc })),
      },
      refs: [
        ...taskRefs([...done, ...open]),
        ...reports.filter((r) => r.project_id).map((r) => ({ type: "project" as const, id: String(r.project_id), label: one(r.project as Row)?.project_name ?? String(r.project_id) })),
      ],
    };
  },

  async attendance(c, a) {
    const { from, to } = { ...weekBounds(), ...strip(a, ["from", "to"]) };
    let q = c.from("t_attendance")
      .select("date, status, clock_in, clock_out, user_id, profile:profiles!t_attendance_user_id_fkey(full_name)")
      .gte("date", from).lte("date", to);
    if (a.person_id) q = q.eq("user_id", a.person_id);
    const rows = ok(await q.order("date", { ascending: false }).limit(LIMIT)) as Row[];
    const s = ok(await c.from("m_work_schedule").select("clock_in_time, late_tolerance_minutes").limit(1).maybeSingle()) as Row | null;
    const mins = (t: string | null) => (t ? Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5)) : null);
    const start = mins(s?.clock_in_time ?? null);
    return {
      data: {
        from, to,
        rows: rows.map((r) => {
          const ci = mins(r.clock_in);
          return {
            date: r.date, person_id: r.user_id, name: one(r.profile as Row)?.full_name, status: r.status,
            clock_in: r.clock_in, clock_out: r.clock_out,
            late: r.status === "Hadir" && ci !== null && start !== null && ci > start + (s?.late_tolerance_minutes ?? 0),
          };
        }),
      },
      refs: rows.map((r) => person(r.user_id, one(r.profile as Row)?.full_name)),
    };
  },

  async leave(c, a, userId) {
    const who = a.person_id ?? userId;
    let q = c.from("t_leave_requests")
      .select("id, type, start_date, end_date, status, reason, rejection_note, user_id, submitter:profiles!t_leave_requests_user_id_fkey(full_name)");
    if (a.person_id) q = q.eq("user_id", a.person_id);
    if (a.from) q = q.gte("end_date", a.from);
    if (a.to) q = q.lte("start_date", a.to);
    const rows = ok(await q.order("start_date", { ascending: false }).limit(LIMIT)) as Row[];

    // Balance the way useLeaveBalance computes it: quota minus approved Cuti working days this year.
    const year = wibToday().slice(0, 4);
    const ys = `${year}-01-01`, ye = `${year}-12-31`;
    // Team-wide questions only need the requests; the balance costs six more queries.
    const wantBalance = !!a.person_id || (!a.from && !a.to);
    const emp = wantBalance ? await employeeIdOf(c, who) : null;
    let balance: unknown = wantBalance ? "not available" : "not requested";
    if (emp !== null) {
      const e = ok(await c.from("m_employees").select("annual_leave_quota").eq("id", emp).maybeSingle()) as Row | null;
      const approved = ok(await c.from("t_leave_requests").select("start_date, end_date")
        .eq("user_id", who).eq("type", "Cuti").eq("status", "Approved").lte("start_date", ye).gte("end_date", ys)) as Row[];
      const sched = ok(await c.from("m_work_schedule").select("work_days").limit(1).maybeSingle()) as Row | null;
      const hol = ok(await c.from("m_holidays").select("date").gte("date", ys).lte("date", ye)) as Row[];
      const workDays = sched?.work_days?.length ? sched.work_days : DEFAULT_WORK_DAYS;
      const holidays = new Set(hol.map((h) => h.date as string));
      const used = approved.reduce((n, r) =>
        n + workingDays(r.start_date < ys ? ys : r.start_date, r.end_date > ye ? ye : r.end_date, workDays, holidays), 0);
      const quota = e?.annual_leave_quota ?? 0;
      balance = { person_id: who, year, quota, used, remaining: Math.max(0, quota - used) };
    }
    return {
      data: {
        balance,
        requests: rows.map((r) => ({
          id: r.id, person_id: r.user_id, name: one(r.submitter as Row)?.full_name, type: r.type,
          start_date: r.start_date, end_date: r.end_date, status: r.status, reason: r.reason, rejection_note: r.rejection_note,
        })),
      },
      refs: rows.flatMap((r) => {
        const name = one(r.submitter as Row)?.full_name;
        return [
          { type: "leave" as const, id: String(r.id), label: `${r.type} ${name ?? ""} ${r.start_date}..${r.end_date}`.replace(/\s+/g, " ") },
          person(r.user_id, name),
        ];
      }),
    };
  },

  async overtime(c, a) {
    let q = overtimeQuery(c);
    if (a.person_id) q = q.eq("user_id", a.person_id);
    if (a.from) q = q.gte("date", a.from);
    if (a.to) q = q.lte("date", a.to);
    return overtimeResult(ok(await q.order("date", { ascending: false }).limit(LIMIT)) as Row[]);
  },

  async payroll_status(c, a) {
    const rows = ok(await c.from("t_payroll_lines")
      .select("payment_status, paid_at, run:t_payroll_runs!inner(period, status)")
      .eq("user_id", a.person_id).eq("run.period", `${a.month}-01`).limit(1)) as Row[];
    const r = rows[0];
    return {
      data: r
        ? { month: a.month, run_status: one(r.run as Row)?.status, payment_status: r.payment_status, paid_at: r.paid_at }
        : { month: a.month, error: "no payroll row visible for this person and month" },
      refs: [],
    };
  },

  async pending_approvals(c, _a, userId) {
    const leaves = ok(await c.from("t_leave_requests")
      .select("id, type, start_date, end_date, reason, user_id, submitter:profiles!t_leave_requests_user_id_fkey(full_name)")
      .eq("status", "Pending").neq("user_id", userId).order("start_date").limit(LIMIT)) as Row[];
    const ot = overtimeResult(ok(await overtimeQuery(c).eq("status", "Pending").neq("user_id", userId).order("date").limit(LIMIT)) as Row[]);
    return {
      data: {
        leave: leaves.map((r) => ({
          id: r.id, person_id: r.user_id, name: one(r.submitter as Row)?.full_name, type: r.type,
          start_date: r.start_date, end_date: r.end_date, reason: r.reason,
        })),
        overtime: ot.data,
      },
      refs: [
        ...leaves.flatMap((r) => {
          const name = one(r.submitter as Row)?.full_name;
          return [{ type: "leave" as const, id: String(r.id), label: `${r.type} ${name ?? ""} ${r.start_date}..${r.end_date}`.replace(/\s+/g, " ") }, person(r.user_id, name)];
        }),
        ...ot.refs,
      ],
    };
  },

  async holidays(c, a) {
    const y = wibToday().slice(0, 4);
    const rows = ok(await c.from("m_holidays").select("date, name, is_national")
      .gte("date", a.from ?? `${y}-01-01`).lte("date", a.to ?? `${y}-12-31`).order("date").limit(LIMIT)) as Row[];
    return { data: rows, refs: [] };
  },

  async issues(c) {
    const rows = ok(await c.from("t_daily_tasks")
      .select("id, date, task_desc, problem_desc, project_id, project:m_projects(project_name), employee:m_employees(full_name)")
      .not("problem_desc", "is", null).neq("problem_desc", "").eq("is_resolved", false)
      .order("date", { ascending: false }).limit(LIMIT)) as Row[];
    return {
      data: rows.map((r) => ({
        date: r.date, employee: one(r.employee as Row)?.full_name, project: one(r.project as Row)?.project_name,
        task: r.task_desc, problem: r.problem_desc,
      })),
      refs: rows.filter((r) => r.project_id).map((r) => ({ type: "project" as const, id: String(r.project_id), label: one(r.project as Row)?.project_name ?? String(r.project_id) })),
    };
  },

  async projects(c) {
    // Progress = done root tasks / all root tasks on the project's board.
    const rows = ok(await c.from("m_projects")
      .select("id, project_code, project_name, client, priority, end_date, status:m_work_status(status_name), board:t_boards(id, t_tasks(status, parent_id, archived_at))")
      .order("created_at", { ascending: false }).limit(LIMIT)) as Row[];
    return {
      data: rows.map((p) => {
        const tasks = ((one(p.board as Row)?.t_tasks ?? []) as Row[]).filter((t) => !t.parent_id && !t.archived_at);
        const done = tasks.filter((t) => t.status === "done").length;
        return {
          id: p.id, code: p.project_code, name: p.project_name, client: p.client, priority: p.priority, end_date: p.end_date,
          status: one(p.status as Row)?.status_name, board_id: one(p.board as Row)?.id ?? null,
          tasks_done: done, tasks_total: tasks.length, progress_pct: tasks.length ? Math.round((done / tasks.length) * 100) : null,
        };
      }),
      refs: rows.flatMap((p) => {
        const b = one(p.board as Row);
        return [
          { type: "project" as const, id: String(p.id), label: p.project_name },
          ...(b ? [{ type: "board" as const, id: String(b.id), label: p.project_name }] : []),
        ];
      }),
    };
  },
};

function strip(a: Args, keys: string[]): Args {
  return Object.fromEntries(keys.filter((k) => a[k]).map((k) => [k, a[k]]));
}

function overtimeQuery(c: SupabaseClient) {
  return c.from("t_overtime_business_trips").select(
    "id, type, date, end_date, start_time, end_time, duration_hours, status, activity_description, user_id, " +
    "submitter:profiles!t_overtime_business_trips_user_id_fkey(full_name)",
  );
}

function overtimeResult(rows: Row[]) {
  return {
    data: rows.map((r) => ({
      id: r.id, person_id: r.user_id, name: one(r.submitter as Row)?.full_name, type: r.type, date: r.date,
      end_date: r.end_date, start_time: r.start_time, end_time: r.end_time, hours: r.duration_hours,
      status: r.status, activity: r.activity_description,
    })),
    refs: rows.flatMap((r) => {
      const name = one(r.submitter as Row)?.full_name;
      return [{ type: "overtime" as const, id: String(r.id), label: `${r.type} ${name ?? ""} ${r.date}`.replace(/\s+/g, " ") }, person(r.user_id, name)];
    }),
  };
}

// RLS denials and query errors come back as data so the model says the data is unavailable instead of guessing.
export async function runReadTool(
  client: SupabaseClient,
  name: string,
  args: Args,
  userId: string,
): Promise<{ data: unknown; refs: Ref[] }> {
  const tool = TOOLS[name];
  if (!tool) return { data: { error: `unknown read tool ${name}` }, refs: [] };
  try {
    const r = await tool(client, args, userId);
    return { data: cut(r.data), refs: r.refs };
  } catch (e) {
    return { data: { error: `not available for this user: ${e instanceof Error ? e.message : String(e)}` }, refs: [] };
  }
}
