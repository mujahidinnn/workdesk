// Shared AI tool catalog. Imported by the Edge Function and the browser, so no Deno APIs and no URL imports.
import { z } from "zod";

const NAV_PAGES = ["dashboard", "payroll", "users", "employees", "ai_settings", "master", "leave", "overtime",
  "attendance", "board", "my_tasks", "chat", "calendar", "daily_report", "profile"] as const;
type NavPage = (typeof NAV_PAGES)[number];
const NAV_BASE: Record<NavPage, string> = {
  dashboard: "/", payroll: "/payroll", users: "/master", employees: "/master", ai_settings: "/master",
  master: "/master", leave: "/leave", overtime: "/overtime", attendance: "/attendance", board: "/boards",
  my_tasks: "/my-tasks", chat: "/chat", calendar: "/calendar", daily_report: "/daily-report", profile: "/settings/profile",
};

export type AiTier = "read" | "write" | "critical";
export type RefType = "person" | "board" | "task" | "step" | "leave" | "overtime" | "channel" | "project";
export type Action = "create" | "read" | "update" | "delete";
export type LabelFn = (type: RefType, id: string) => string | undefined;
// Params are zod-validated before use; a loose record keeps the per-tool summaries readable.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Params = Record<string, any>;

export interface AiTool {
  name: string;
  tier: AiTier;
  permission: { feature: string; action: Action } | null;
  description: string;
  schema: z.ZodObject;
  // param name -> entity type; array params give one ref per element
  refs: Record<string, RefType>;
  terminal?: boolean;
  summary(params: Params, label?: LabelFn): string;
}

const personId = z.string().min(1);
const numId = z.number().int();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "use YYYY-MM-DD");
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "use HH:MM");
const text = z.string().min(1).max(2000);
const range = { from: date.optional(), to: date.optional() };
const priority = z.enum(["low", "medium", "high", "urgent"]);

const L = (label: LabelFn | undefined, type: RefType, id: unknown) =>
  label?.(type, String(id)) ?? String(id);
const names = (label: LabelFn | undefined, type: RefType, ids: unknown) =>
  ((ids as unknown[] | undefined) ?? []).map((i) => L(label, type, i)).join(", ");

const read = (
  name: string,
  description: string,
  shape: z.ZodRawShape,
  refs: Record<string, RefType> = {},
  permission: AiTool["permission"] = null,
): AiTool => ({
  name, tier: "read", permission, description, schema: z.object(shape), refs,
  summary: () => name,
});

export const AI_TOOLS: AiTool[] = [
  read("find_people", "Search employees by name (fuzzy). Returns id, name, position, division.", { query: z.string().min(1) }),
  read("find_channels", "List chat channels and direct messages the user belongs to, optionally filtered by name.", { query: z.string().optional() }),
  read("find_boards", "List boards the user can see, optionally filtered by member.", { member_id: personId.optional() }, { member_id: "person" }),
  read("list_tasks", "List board tasks filtered by assignee, board, status and due date range.", {
    assignee_id: personId.optional(), board_id: numId.optional(), status: z.string().optional(),
    due_from: date.optional(), due_to: date.optional(),
  }, { assignee_id: "person", board_id: "board" }),
  read("get_task", "Task detail: checklist, assignees, latest comments.", { task_id: numId }, { task_id: "task" }),
  read("work_summary", "One person over a date range: done, in review and running tasks, daily reports, blockers.", {
    person_id: personId, ...range,
  }, { person_id: "person" }),
  read("attendance", "Attendance recap for a date range, including late arrivals. Omit person_id to get everyone in one call.", { person_id: personId.optional(), ...range }, { person_id: "person" }),
  read("leave", "Leave requests in a date range. Omit person_id to get everyone in one call (no balance then). With person_id and no dates it also returns that person's annual leave balance.", { person_id: personId.optional(), ...range }, { person_id: "person" }),
  read("overtime", "Overtime and business trip requests.", { person_id: personId.optional(), ...range }, { person_id: "person" }),
  read("payroll_status", "Payroll row status (Draft/Finalized, Paid/Unpaid) for one person and month.", {
    person_id: personId, month: z.string().regex(/^\d{4}-\d{2}$/),
  }, { person_id: "person" }),
  read("pending_approvals", "Leave and overtime waiting for this user's approval.", {}),
  read("holidays", "Holidays within a date range.", range),
  read("issues", "Active blockers from daily reports.", {}),
  read("projects", "Projects and their progress.", {}),
  read("navigate", "Return a button that opens an app page. Use for sensitive actions and for details. Pick the page from the list; never write a URL. users and payroll can focus one person (user_id from find_people), employees one employee, payroll one month, board needs board_id.", {
    page: z.enum(NAV_PAGES), label: z.string().min(1).max(80),
    user_id: personId.optional(), employee_id: numId.optional(), board_id: numId.optional(),
    month: z.string().regex(/^\d{4}-\d{2}$/).optional(),
  }, { user_id: "person", board_id: "board" }),
  { ...read("ask_choice", "Ask the user to pick one option when the request is ambiguous.", {
    question: z.string().min(1), options: z.array(z.string().min(1)).min(2).max(6),
  }), terminal: true },

  {
    name: "create_task", tier: "write", permission: { feature: "board", action: "create" },
    description: "Create a task on a board with assignees, due date and checklist steps.",
    schema: z.object({
      board_id: numId, title: text.max(200), description: z.string().max(5000).optional(),
      assignee_ids: z.array(personId).max(20).optional(), due_date: date.optional(),
      steps: z.array(text.max(200)).max(20).optional(), parent_id: numId.optional(),
    }),
    refs: { board_id: "board", assignee_ids: "person", parent_id: "task" },
    summary: (p, l) => {
      const parts = [`Create task "${p.title}" on ${L(l, "board", p.board_id)}`];
      if (p.assignee_ids?.length) parts.push(`assigned to ${names(l, "person", p.assignee_ids)}`);
      if (p.due_date) parts.push(`due ${p.due_date}`);
      if (p.steps?.length) parts.push(`${p.steps.length} steps`);
      return parts.join(", ");
    },
  },
  {
    name: "update_task", tier: "write", permission: { feature: "board", action: "update" },
    description: "Change a task's title, description, due date or priority.",
    schema: z.object({
      task_id: numId, title: text.max(200).optional(), description: z.string().max(5000).optional(),
      due_date: date.optional(), priority: priority.optional(),
    }),
    refs: { task_id: "task" },
    summary: (p, l) => {
      const f = ["title", "description", "due_date", "priority"].filter((k) => p[k] !== undefined);
      return `Update ${L(l, "task", p.task_id)}: ${f.join(", ")}`;
    },
  },
  {
    name: "add_steps", tier: "write", permission: { feature: "board", action: "update" },
    description: "Add checklist steps to a task.",
    schema: z.object({ task_id: numId, steps: z.array(text.max(200)).min(1).max(20) }),
    refs: { task_id: "task" },
    summary: (p, l) => `Add ${p.steps.length} steps to ${L(l, "task", p.task_id)}`,
  },
  {
    name: "toggle_step", tier: "write", permission: { feature: "board", action: "update" },
    description: "Check or uncheck a checklist step.",
    schema: z.object({ step_id: numId, done: z.boolean() }),
    refs: { step_id: "step" },
    summary: (p, l) => `${p.done ? "Check" : "Uncheck"} step ${L(l, "step", p.step_id)}`,
  },
  {
    name: "comment_task", tier: "write", permission: { feature: "board", action: "update" },
    description: "Post a comment on a task.",
    schema: z.object({ task_id: numId, text }),
    refs: { task_id: "task" },
    summary: (p, l) => `Comment on ${L(l, "task", p.task_id)}: "${p.text}"`,
  },
  {
    name: "create_daily_report", tier: "write", permission: { feature: "daily-report", action: "create" },
    description: "Add an entry to the user's own daily report.",
    schema: z.object({
      date, project_id: numId, task_desc: text, progress_pct: z.number().int().min(0).max(100),
      problem_desc: z.string().max(2000).optional(), board_task_id: numId.optional(),
    }),
    refs: { project_id: "project", board_task_id: "task" },
    summary: (p, l) => `Daily report ${p.date} on ${L(l, "project", p.project_id)}: ${p.task_desc} (${p.progress_pct}%)`,
  },
  {
    name: "request_leave", tier: "write", permission: { feature: "leave", action: "create" },
    description: "Request leave for the user themselves.",
    schema: z.object({ type: z.enum(["Cuti", "Izin", "Sakit"]), start_date: date, end_date: date, reason: text }),
    refs: {},
    summary: (p) => `Request ${p.type} ${p.start_date} to ${p.end_date}: ${p.reason}`,
  },
  {
    name: "request_overtime", tier: "write", permission: { feature: "overtime-business-trip", action: "create" },
    description: "Request overtime for the user themselves.",
    schema: z.object({
      type: z.enum(["Overtime", "BusinessTrip_Local", "BusinessTrip_OutOfTown"]), date,
      end_date: date.optional(), start_time: time.optional(), end_time: time.optional(),
      project_id: numId.optional(), activity_description: text,
    }),
    refs: { project_id: "project" },
    summary: (p, l) => {
      const when = p.end_date ? `${p.date} to ${p.end_date}` : p.date;
      const hrs = p.start_time && p.end_time ? ` ${p.start_time}-${p.end_time}` : "";
      const proj = p.project_id ? ` (${L(l, "project", p.project_id)})` : "";
      return `Request ${p.type} ${when}${hrs}${proj}: ${p.activity_description}`;
    },
  },
  {
    name: "add_holiday", tier: "write", permission: { feature: "holidays", action: "create" },
    description: "Add a holiday.",
    schema: z.object({ date, name: z.string().min(1).max(200) }),
    refs: {},
    summary: (p) => `Add holiday ${p.date}: ${p.name}`,
  },

  {
    name: "delete_task", tier: "critical", permission: { feature: "board", action: "delete" },
    description: "Delete a task.",
    schema: z.object({ task_id: numId }),
    refs: { task_id: "task" },
    summary: (p, l) => `Delete ${L(l, "task", p.task_id)}`,
  },
  {
    name: "delete_step", tier: "critical", permission: { feature: "board", action: "delete" },
    description: "Delete a checklist step.",
    schema: z.object({ step_id: numId }),
    refs: { step_id: "step" },
    summary: (p, l) => `Delete step ${L(l, "step", p.step_id)}`,
  },
  {
    name: "review_leave", tier: "critical", permission: { feature: "leave", action: "update" },
    description: "Approve or reject a leave request.",
    schema: z.object({ leave_id: numId, decision: z.enum(["approve", "reject"]), note: z.string().max(1000).optional() }),
    refs: { leave_id: "leave" },
    summary: (p, l) => `${p.decision === "approve" ? "Approve" : "Reject"} leave ${L(l, "leave", p.leave_id)}${p.note ? `: ${p.note}` : ""}`,
  },
  {
    name: "review_overtime", tier: "critical", permission: { feature: "overtime-business-trip", action: "update" },
    description: "Approve or reject an overtime request.",
    schema: z.object({ overtime_id: numId, decision: z.enum(["approve", "reject"]), note: z.string().max(1000).optional() }),
    refs: { overtime_id: "overtime" },
    summary: (p, l) => `${p.decision === "approve" ? "Approve" : "Reject"} overtime ${L(l, "overtime", p.overtime_id)}${p.note ? `: ${p.note}` : ""}`,
  },
  {
    // chat has no feature key in m_features, so login is enough
    name: "send_chat_message", tier: "critical", permission: null,
    description: "Send a chat message to a channel on the user's behalf.",
    schema: z.object({ channel_id: numId, text }),
    refs: { channel_id: "channel" },
    summary: (p, l) => `Send to ${L(l, "channel", p.channel_id)}: "${p.text}"`,
  },
];

export const getTool = (name: string): AiTool | undefined => AI_TOOLS.find((t) => t.name === name);

export function validateParams(
  tool: AiTool,
  params: unknown,
): { ok: true; params: Params } | { ok: false; error: string } {
  const r = tool.schema.safeParse(params);
  if (r.success) return { ok: true, params: r.data as Params };
  return { ok: false, error: r.error.issues.map((i) => `${i.path.join(".") || "params"}: ${i.message}`).join("; ") };
}

export function refsOf(tool: AiTool, params: unknown): { type: RefType; id: string }[] {
  const out: { type: RefType; id: string }[] = [];
  for (const [key, type] of Object.entries(tool.refs)) {
    const v = (params as Record<string, unknown> | null | undefined)?.[key];
    for (const id of Array.isArray(v) ? v : [v]) {
      if (id !== undefined && id !== null) out.push({ type, id: String(id) });
    }
  }
  return out;
}

// Builds the in-app path for a navigate call, or null when a required id is missing.
export function navPath(p: { page: string; user_id?: string; employee_id?: number; board_id?: number; month?: string }): string | null {
  const q = new URLSearchParams();
  const base = NAV_BASE[p.page as NavPage];
  if (p.page === "board") return p.board_id == null ? null : `/boards/${p.board_id}`;
  if (p.page === "users") q.set("tab", "users");
  if (p.page === "employees") q.set("tab", "employees");
  if (p.page === "ai_settings") q.set("tab", "ai");
  if (p.page === "payroll" && p.month) q.set("month", p.month);
  if ((p.page === "users" || p.page === "payroll") && p.user_id) q.set("user", p.user_id);
  if (p.page === "employees" && p.employee_id != null) q.set("employee", String(p.employee_id));
  const qs = q.toString();
  return base == null ? null : qs ? `${base}?${qs}` : base;
}

const SAFE_PATHS = ["/", "/payroll", "/master", "/leave", "/overtime", "/attendance", "/my-tasks", "/chat", "/calendar", "/daily-report", "/settings/profile"];

export function isSafePath(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) return false;
  const base = path.split(/[?#]/)[0];
  return SAFE_PATHS.includes(base) || base.startsWith("/boards/");
}

// More than 5 write proposals in one answer turns the whole batch critical.
export function cardModes(proposals: { tool: string }[], mode: "ask" | "auto"): ("confirm" | "countdown")[] {
  const writes = proposals.filter((p) => getTool(p.tool)?.tier === "write").length;
  return proposals.map((p) =>
    mode === "auto" && writes <= 5 && getTool(p.tool)?.tier === "write" ? "countdown" : "confirm");
}
