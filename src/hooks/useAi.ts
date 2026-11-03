import { useCallback, useRef } from "react";
import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { useAuth } from "@/context/auth";
import i18n from "@/lib/i18n";
import { positionBetween } from "@/lib/position";
import { useAiPanel } from "@/components/ai/AiProvider";
import { getTool, validateParams } from "../../supabase/functions/_shared/aiCatalog.ts";
import { assignUser, createTask, deleteTask, invalidateBoard, updateTask } from "./useBoardTasks";
import { addStep, deleteStep, invalidateSteps, updateStep } from "./useTaskSteps";
import { addTaskComment } from "./useTaskComments";
import { createDailyTask, DAILY_TASKS_QK } from "./useDailyTasks";
import { approveLeave, createLeaveRequest, LEAVE_QK, rejectLeave } from "./useLeaveRequests";
import { approveOvertime, createOvertime, OVERTIME_QK, rejectOvertime } from "./useOvertimeRecords";
import { createHoliday, HOLIDAYS_QK } from "./useHolidays";
import { messagesKey, sendChatMessage } from "./useChat";

export type ProposalStatus = "pending" | "executing" | "executed" | "cancelled" | "failed";

export interface AiProposal {
  id: string;
  tool: string;
  params: Record<string, unknown>;
  summary: string;
  status: ProposalStatus;
  status_at?: string;
  result?: Record<string, unknown>;
  error?: string;
}

export interface AiAssistantContent {
  text: string;
  proposals: AiProposal[];
  choices: { label: string; reply: string }[];
  links: { path: string; label: string }[];
  refs: { type: string; id: string; label: string }[];
}

export interface AiUserContent {
  text: string;
  flags?: string[];
}

export type AiMessage =
  | { id: number; conversation_id: number; role: "assistant"; content: AiAssistantContent; created_at: string }
  | { id: number; conversation_id: number; role: "user"; content: AiUserContent; created_at: string };

export interface AiConversation {
  id: number;
  title: string | null;
  created_at: string;
  updated_at: string;
}

export interface AiQuota {
  used: number;
  limit: number;
}

export interface AiSendResult {
  conversationId: number;
  message: { id: number; role: "assistant"; content: AiAssistantContent };
  quota: AiQuota | null;
}

export const AI_CONVERSATIONS_QK = ["ai-conversations"] as const;
export const aiMessagesKey = (conversationId: number | null) => ["ai-messages", conversationId] as const;
const AI_QUOTA_QK = ["ai-quota"] as const;
const AI_SETTINGS_QK = ["ai-settings"] as const;

const SEND_TIMEOUT_MS = 30_000;
// A proposal stuck in executing longer than this was cut off (tab closed mid-run).
export const STALE_EXECUTING_MS = 2 * 60_000;

export const isStaleExecuting = (p: AiProposal, now = Date.now()) =>
  p.status === "executing" && !!p.status_at && now - Date.parse(p.status_at) > STALE_EXECUTING_MS;

const errMessage = (e: unknown) =>
  e instanceof Error ? e.message : ((e as { message?: string })?.message ?? String(e));


export function useAiConversations() {
  return useQuery<AiConversation[]>({
    queryKey: AI_CONVERSATIONS_QK,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_ai_conversations")
        .select("id, title, created_at, updated_at")
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });
}

export function useDeleteAiConversation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { error, count } = await supabase.from("t_ai_conversations").delete({ count: "exact" }).eq("id", id);
      if (error) throw error;
      if (count === 0) throw new Error("Conversation not found");
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: AI_CONVERSATIONS_QK }),
    onError: (e: Error) => toast.error(e.message),
  });
}

export function useAiMessages(conversationId: number | null) {
  return useQuery<AiMessage[]>({
    queryKey: aiMessagesKey(conversationId),
    enabled: conversationId != null,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("t_ai_messages")
        .select("id, conversation_id, role, content, created_at")
        .eq("conversation_id", conversationId!)
        .order("id");
      if (error) throw error;
      return data as unknown as AiMessage[];
    },
  });
}

export function useAiQuota() {
  return useQuery<AiQuota>({
    queryKey: AI_QUOTA_QK,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("ai_quota_today");
      if (error) throw error;
      return data as unknown as AiQuota;
    },
  });
}

/** Admin setting for Master Hub. Update is refused by RLS without master:update. */
export function useAiSettings() {
  const qc = useQueryClient();
  const query = useQuery({
    queryKey: AI_SETTINGS_QK,
    queryFn: async () => {
      const { data, error } = await supabase.from("m_ai_settings").select("daily_limit").single();
      if (error) throw error;
      return data;
    },
  });
  const update = useMutation({
    mutationFn: async (dailyLimit: number) => {
      const { error, count } = await supabase
        .from("m_ai_settings")
        .update({ daily_limit: dailyLimit }, { count: "exact" })
        .eq("id", true);
      if (error) throw error;
      if (count === 0) throw new Error("You cannot change this setting");
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: AI_SETTINGS_QK }),
        qc.invalidateQueries({ queryKey: AI_QUOTA_QK }),
      ]),
    onError: (e: Error) => toast.error(e.message),
  });
  return { ...query, update };
}

export function useAiMode() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const key = ["ai-mode", user?.id] as const;
  const query = useQuery({
    queryKey: key,
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase.from("profiles").select("ai_mode").eq("id", user!.id).single();
      if (error) throw error;
      return data.ai_mode as "ask" | "auto";
    },
  });
  const setMode = useMutation({
    mutationFn: async (mode: "ask" | "auto") => {
      const { error } = await supabase.from("profiles").update({ ai_mode: mode }).eq("id", user!.id);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: key }),
    onError: (e: Error) => toast.error(e.message),
  });
  return { mode: query.data ?? "ask", isLoading: query.isLoading, setMode };
}


export type AiErrorCode =
  | "invalid"
  | "too_long"
  | "quota"
  | "not_configured"
  | "model_busy"
  | "blocked"
  | "not_found"
  | "unauthorized"
  | "timeout"
  | "aborted"
  | "unknown";

export class AiRequestError extends Error {
  constructor(
    public code: AiErrorCode,
    public info: { limit?: number; conversationId?: number } = {},
    message?: string,
  ) {
    super(message ?? code);
  }
}

const STATUS_CODE: Record<number, AiErrorCode> = { 401: "unauthorized", 404: "not_found" };
const KNOWN_CODES = new Set<string>(["invalid", "too_long", "quota", "not_configured", "model_busy", "blocked"]);

async function toAiError(error: { context?: unknown; message: string }): Promise<AiRequestError> {
  const res = error.context instanceof Response ? error.context : null;
  const body = res ? await res.json().catch(() => null) : null;
  const code: AiErrorCode = KNOWN_CODES.has(body?.error)
    ? body.error
    : (res && STATUS_CODE[res.status]) || "unknown";
  return new AiRequestError(code, { limit: body?.limit, conversationId: body?.conversationId }, body?.error ?? error.message);
}

/** Posts a prompt. `stop()` aborts the wait; the request also gives up after 30 s. */
export function useSendPrompt() {
  const qc = useQueryClient();
  const ctrl = useRef<AbortController | null>(null);
  const mutation = useMutation<AiSendResult, AiRequestError, { text: string; conversationId: number | null }>({
    mutationFn: async ({ text, conversationId }) => {
      const c = new AbortController();
      ctrl.current = c;
      let timedOut = false;
      const timer = setTimeout(() => {
        timedOut = true;
        c.abort();
      }, SEND_TIMEOUT_MS);
      const aborted = () => new AiRequestError(timedOut ? "timeout" : "aborted");
      try {
        const { data, error } = await supabase.functions.invoke<AiSendResult>("ai-command", {
          body: { text, conversationId, lang: i18n.language?.startsWith("en") ? "en" : "id" },
          signal: c.signal,
        });
        if (c.signal.aborted) throw aborted();
        if (error) throw await toAiError(error);
        return data!;
      } catch (e) {
        if (e instanceof AiRequestError) throw e;
        if (c.signal.aborted) throw aborted();
        throw new AiRequestError("unknown", {}, errMessage(e));
      } finally {
        clearTimeout(timer);
        if (ctrl.current === c) ctrl.current = null;
      }
    },
    onSettled: (data, error, vars) => {
      const convId = data?.conversationId ?? error?.info.conversationId ?? vars.conversationId;
      qc.invalidateQueries({ queryKey: AI_CONVERSATIONS_QK });
      qc.invalidateQueries({ queryKey: AI_QUOTA_QK });
      if (convId != null) qc.invalidateQueries({ queryKey: aiMessagesKey(convId) });
    },
  });
  const stop = useCallback(() => ctrl.current?.abort(), []);
  return { ...mutation, stop };
}


// Params already passed the catalog's zod schema, which is the real type check.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Params = Record<string, any>;
type Executor = (params: Params, qc: QueryClient) => Promise<Record<string, unknown>>;
const VIA = { via: "ai" } as const;

async function sessionUserId(): Promise<string> {
  const { data } = await supabase.auth.getSession();
  const id = data.session?.user.id;
  if (!id) throw new Error("Not signed in");
  return id;
}

async function taskBoardId(taskId: number): Promise<number> {
  const { data, error } = await supabase.from("t_tasks").select("board_id").eq("id", taskId).single();
  if (error) throw error;
  return data.board_id;
}

async function stepTask(stepId: number): Promise<{ taskId: number; boardId: number }> {
  const { data, error } = await supabase.from("t_task_steps").select("task_id").eq("id", stepId).single();
  if (error) throw error;
  return { taskId: data.task_id, boardId: await taskBoardId(data.task_id) };
}

async function lastStepPosition(taskId: number): Promise<number | null> {
  const { data, error } = await supabase
    .from("t_task_steps")
    .select("position")
    .eq("task_id", taskId)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  return data[0]?.position ?? null;
}

async function addSteps(taskId: number, titles: string[], after: number | null) {
  let pos = after;
  for (const title of titles) {
    pos = positionBetween(pos, null);
    await addStep(taskId, { title, position: pos });
  }
}

/** Places a root task last in the board's first column, or a subtask last under its parent. */
async function newTaskSlot(boardId: number, parentId?: number) {
  if (parentId != null) {
    const { data, error } = await supabase
      .from("t_tasks")
      .select("position")
      .eq("parent_id", parentId)
      .order("position", { ascending: false })
      .limit(1);
    if (error) throw error;
    return { parent_id: parentId, column_id: null, position: positionBetween(data[0]?.position ?? null, null) };
  }
  const { data: col, error: colErr } = await supabase
    .from("t_board_columns")
    .select("id")
    .eq("board_id", boardId)
    .order("position")
    .limit(1)
    .single();
  if (colErr) throw colErr;
  const { data, error } = await supabase
    .from("t_tasks")
    .select("position")
    .eq("column_id", col.id)
    .is("parent_id", null)
    .order("position", { ascending: false })
    .limit(1);
  if (error) throw error;
  return { parent_id: null, column_id: col.id, position: positionBetween(data[0]?.position ?? null, null) };
}

export const EXECUTORS: Record<string, Executor> = {
  async create_task(p, qc) {
    const slot = await newTaskSlot(p.board_id, p.parent_id);
    const task = await createTask(p.board_id, {
      title: p.title,
      description: p.description ?? null,
      due_date: p.due_date ?? null,
      ...slot,
    });
    try {
      for (const userId of p.assignee_ids ?? []) await assignUser(task.id, userId);
      await addSteps(task.id, p.steps ?? [], null);
    } catch (e) {
      // The task exists now; say so, so nobody runs the proposal again for it.
      throw new Error(`Task #${task.task_no} was created, but: ${errMessage(e)}`);
    } finally {
      await invalidateBoard(qc, p.board_id, task.id);
    }
    return { task_id: task.id, task_no: task.task_no, board_id: p.board_id };
  },

  async update_task(p, qc) {
    const { task_id, ...patch } = p;
    const boardId = await taskBoardId(task_id);
    await updateTask({ id: task_id, ...patch });
    await invalidateBoard(qc, boardId, task_id);
    return { task_id, board_id: boardId };
  },

  async add_steps(p, qc) {
    const boardId = await taskBoardId(p.task_id);
    await addSteps(p.task_id, p.steps, await lastStepPosition(p.task_id));
    await invalidateSteps(qc, boardId, p.task_id);
    return { task_id: p.task_id, board_id: boardId };
  },

  async toggle_step(p, qc) {
    const { taskId, boardId } = await stepTask(p.step_id);
    await updateStep({ id: p.step_id, is_done: p.done });
    await invalidateSteps(qc, boardId, taskId);
    return { step_id: p.step_id, task_id: taskId, board_id: boardId };
  },

  async comment_task(p, qc) {
    const userId = await sessionUserId();
    await addTaskComment("board", { taskId: p.task_id, userId, comment: p.text, mentions: [] });
    await Promise.all([
      qc.invalidateQueries({ queryKey: ["task-comments", "board", p.task_id] }),
      qc.invalidateQueries({ queryKey: ["problems-log"] }),
      qc.invalidateQueries({ queryKey: ["task-activity", p.task_id] }),
    ]);
    return { task_id: p.task_id };
  },

  async create_daily_report(p, qc) {
    const userId = await sessionUserId();
    const { data: prof, error } = await supabase.from("profiles").select("employee_id").eq("id", userId).single();
    if (error) throw error;
    if (prof.employee_id == null) throw new Error("Your account is not linked to an employee");
    const row = await createDailyTask(
      {
        date: p.date,
        employee_id: prof.employee_id,
        project_id: p.project_id,
        task_desc: p.task_desc,
        progress_pct: p.progress_pct,
        problem_desc: p.problem_desc ?? null,
        is_resolved: false,
        board_task_id: p.board_task_id ?? null,
      },
      VIA,
    );
    await Promise.all([
      qc.invalidateQueries({ queryKey: [...DAILY_TASKS_QK] }),
      qc.invalidateQueries({ queryKey: ["dashboard-summary"] }),
      qc.invalidateQueries({ queryKey: ["tasks-per-project"] }),
    ]);
    return { daily_task_id: row.id, date: row.date };
  },

  async request_leave(p, qc) {
    const row = await createLeaveRequest(
      { user_id: await sessionUserId(), type: p.type, start_date: p.start_date, end_date: p.end_date, reason: p.reason },
      VIA,
    );
    await qc.invalidateQueries({ queryKey: [...LEAVE_QK] });
    return { leave_id: row.id };
  },

  async request_overtime(p, qc) {
    // Same shape as OvertimePage: times and end date only apply to Overtime.
    const isOvertime = p.type === "Overtime";
    const row = await createOvertime(
      {
        user_id: await sessionUserId(),
        type: p.type,
        date: p.date,
        end_date: isOvertime ? (p.end_date ?? null) : null,
        start_time: isOvertime ? (p.start_time ?? null) : null,
        end_time: isOvertime ? (p.end_time ?? null) : null,
        project_id: p.project_id ?? null,
        activity_description: p.activity_description.trim(),
        status: "Pending",
      },
      VIA,
    );
    await qc.invalidateQueries({ queryKey: [...OVERTIME_QK] });
    return { overtime_id: row.id };
  },

  async add_holiday(p, qc) {
    const row = await createHoliday({ date: p.date, name: p.name }, VIA);
    await qc.invalidateQueries({ queryKey: [...HOLIDAYS_QK] });
    return { holiday_id: row.id };
  },

  async delete_task(p, qc) {
    const boardId = await taskBoardId(p.task_id);
    await deleteTask(p.task_id);
    await invalidateBoard(qc, boardId);
    return { task_id: p.task_id, board_id: boardId };
  },

  async delete_step(p, qc) {
    const { taskId, boardId } = await stepTask(p.step_id);
    await deleteStep(p.step_id);
    await invalidateSteps(qc, boardId, taskId);
    return { step_id: p.step_id, task_id: taskId, board_id: boardId };
  },

  async review_leave(p, qc) {
    if (p.decision === "approve") {
      await approveLeave(p.leave_id, VIA);
      await Promise.all([
        qc.invalidateQueries({ queryKey: [...LEAVE_QK] }),
        qc.invalidateQueries({ queryKey: ["attendance"] }),
      ]);
    } else {
      await rejectLeave(p.leave_id, p.note ?? "", VIA);
      await qc.invalidateQueries({ queryKey: [...LEAVE_QK] });
    }
    return { leave_id: p.leave_id, decision: p.decision };
  },

  async review_overtime(p, qc) {
    if (p.decision === "approve") await approveOvertime(p.overtime_id, VIA);
    else await rejectOvertime(p.overtime_id, p.note ?? "", VIA);
    await qc.invalidateQueries({ queryKey: [...OVERTIME_QK] });
    return { overtime_id: p.overtime_id, decision: p.decision };
  },

  async send_chat_message(p, qc) {
    await sendChatMessage({
      senderId: await sessionUserId(),
      channelId: p.channel_id,
      body: p.text,
      replyToId: null,
      mentions: [],
      mentionsEveryone: false,
      files: [],
    });
    await qc.invalidateQueries({ queryKey: messagesKey(p.channel_id) });
    return { channel_id: p.channel_id };
  },
};


async function setProposalStatus(
  messageId: number,
  proposalId: string,
  status: Exclude<ProposalStatus, "pending">,
  result?: Record<string, unknown>,
): Promise<boolean> {
  const { data, error } = await supabase.rpc("ai_set_proposal_status", {
    p_message_id: messageId,
    p_proposal_id: proposalId,
    p_status: status,
    p_result: result as Json | undefined,
  });
  if (error) throw error;
  return data === true;
}

export type ExecuteOutcome =
  | { status: "executed"; result: Record<string, unknown> }
  | { status: "failed"; error: string }
  | { status: "lost" };

export function useExecuteProposal() {
  const qc = useQueryClient();
  return useMutation<ExecuteOutcome, Error, { messageId: number; proposal: AiProposal }>({
    mutationFn: async ({ messageId, proposal }) => {
      // Re-check in the browser: the stored tool name and params are not trusted.
      const tool = getTool(proposal.tool);
      const run = EXECUTORS[proposal.tool];
      const check = tool && run
        ? validateParams(tool, proposal.params)
        : { ok: false as const, error: `Unknown action ${proposal.tool}` };

      if (!(await setProposalStatus(messageId, proposal.id, "executing"))) {
        await qc.invalidateQueries({ queryKey: ["ai-messages"] });
        toast.info(i18n.t("ai.alreadyRun"));
        return { status: "lost" };
      }
      let outcome: ExecuteOutcome;
      try {
        if ("error" in check) throw new Error(check.error);
        outcome = { status: "executed", result: await run(check.params, qc) };
      } catch (e) {
        outcome = { status: "failed", error: errMessage(e) };
      }
      // Recorded outside the try, so a failed status write never marks a done action as failed.
      try {
        if (outcome.status === "executed") {
          await setProposalStatus(messageId, proposal.id, "executed", outcome.result);
        } else if (outcome.status === "failed") {
          await setProposalStatus(messageId, proposal.id, "failed", { error: outcome.error });
        }
      } finally {
        await qc.invalidateQueries({ queryKey: ["ai-messages"] });
      }
      return outcome;
    },
    onError: (e) => toast.error(e.message),
  });
}

export function useCancelProposal() {
  const qc = useQueryClient();
  const { scheduler } = useAiPanel();
  return useMutation<boolean, Error, { messageId: number; proposalId: string }>({
    mutationFn: async ({ messageId, proposalId }) => {
      scheduler.cancel(proposalId);
      return setProposalStatus(messageId, proposalId, "cancelled");
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["ai-messages"] }),
    onError: (e) => toast.error(e.message),
  });
}
