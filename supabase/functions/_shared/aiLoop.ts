// Provider-agnostic model loop. Runs in the Edge Function only; no Deno APIs, no URL imports, no fetch.
import { getTool, validateParams, refsOf, isSafePath, navPath, type RefType } from "./aiCatalog.ts";
import { guardText } from "./aiGuard.ts";

export type Ref = { type: RefType; id: string; label: string };
export type Call = { name: string; args: Record<string, unknown> };
export type LoopMessage =
  | { role: "user" | "model"; text?: string; calls?: Call[] }
  | { role: "tool"; results: { name: string; response: unknown }[] };

export interface LoopDeps {
  callModel(history: LoopMessage[]): Promise<{ text?: string; calls: Call[] }>;
  runReadTool(name: string, args: Record<string, unknown>): Promise<{ data: unknown; refs: Ref[] }>;
  allowed: Set<string>;
  /** Pages navigate may point at for this user. Unset means any page in the catalog. */
  pages?: Set<string>;
  knownRefs: Ref[];
  lang: "id" | "en";
}

export interface Proposal { id: string; tool: string; params: Record<string, unknown>; summary: string; status: "pending" }

export interface AssistantContent {
  text: string;
  proposals: Proposal[];
  choices: { label: string; reply: string }[];
  links: { path: string; label: string }[];
  refs: Ref[];
}

const MAX_STEPS = 5;
const MAX_REFS = 100;
const TOO_COMPLEX = {
  id: "Permintaan terlalu rumit, coba dipecah menjadi beberapa perintah.",
  en: "That request is too complex, try splitting it into smaller ones.",
};

const key = (r: { type: string; id: string }) => `${r.type}:${r.id}`;

export async function runAiLoop(history: LoopMessage[], deps: LoopDeps): Promise<AssistantContent> {
  const h = [...history];
  const labels = new Map(deps.knownRefs.map((r) => [key(r), r.label]));
  const turnRefs = new Map<string, Ref>();
  const failures = new Map<string, number>();
  const out: AssistantContent = { text: "", proposals: [], choices: [], links: [], refs: [] };
  const finish = (text: string) => {
    out.text = guardText(text, deps.lang).text;
    out.refs = [...turnRefs.values()].slice(0, MAX_REFS);
    return out;
  };

  for (let step = 0; step < MAX_STEPS; step++) {
    const res = await deps.callModel(h);
    const calls = res.calls ?? [];
    h.push({ role: "model", text: res.text, calls });
    if (!calls.length) return finish(res.text ?? "");

    // Read tools only look things up, so one turn's reads run side by side. Run one after another,
    // a "who is on leave" question that asked per person took long enough to hit the deadline.
    const reads = new Map<number, ReturnType<LoopDeps["runReadTool"]>>();
    calls.forEach((call, i) => {
      const tool = getTool(call.name);
      if (!tool || tool.tier !== "read" || tool.name === "navigate" || tool.name === "ask_choice") return;
      if (!deps.allowed.has(call.name)) return;
      const v = validateParams(tool, call.args);
      if ("error" in v) return;
      const pending = deps.runReadTool(tool.name, v.params);
      pending.catch(() => undefined); // an early return below must not leave an unhandled rejection
      reads.set(i, pending);
    });

    const results: { name: string; response: unknown }[] = [];
    let terminal = false;
    for (const [i, call] of calls.entries()) {
      const fail = (error: string) => results.push({ name: call.name, response: { error } });
      const tool = getTool(call.name);
      if (!tool || !deps.allowed.has(call.name)) { fail(`tool ${call.name} is not available`); continue; }

      const v = validateParams(tool, call.args);
      if ("error" in v) {
        const n = (failures.get(tool.name) ?? 0) + 1;
        failures.set(tool.name, n);
        if (n >= 2) {
          return finish(deps.lang === "id"
            ? `Data belum lengkap untuk ${tool.name}: ${v.error}`
            : `Missing details for ${tool.name}: ${v.error}`);
        }
        fail(v.error);
        continue;
      }
      const p = v.params;

      if (tool.name === "ask_choice") {
        out.choices = (p.options as string[]).map((o) => ({ label: o, reply: o }));
        res.text = p.question;
      } else if (tool.name === "navigate") {
        const path = navPath(p as Parameters<typeof navPath>[0]);
        if (deps.pages && !deps.pages.has(p.page)) {
          fail(`the ${p.page} page is not available to this user; do not offer a button for it`);
        } else if (path && isSafePath(path)) {
          out.links.push({ path, label: p.label });
          results.push({ name: call.name, response: { ok: true, note: "The button is shown. Now answer in text." } });
        } else fail("board needs board_id");
      } else if (tool.tier === "read") {
        const r = await reads.get(i)!;
        for (const ref of r.refs) { turnRefs.set(key(ref), ref); labels.set(key(ref), ref.label); }
        results.push({ name: call.name, response: { data: r.data } });
      } else {
        const unknown = refsOf(tool, p).map(key).filter((k) => !labels.has(k));
        if (unknown.length) {
          fail(`unknown ids ${unknown.join(", ")}; look them up with a read tool, never invent ids`);
          continue;
        }
        out.proposals.push({
          id: crypto.randomUUID(), tool: tool.name, params: p, status: "pending",
          summary: tool.summary(p, (type, id) => labels.get(`${type}:${id}`)),
        });
      }
      if (tool.terminal) terminal = true;
    }

    if (terminal || out.proposals.length) return finish(res.text ?? "");
    h.push({ role: "tool", results });
  }
  return finish(TOO_COMPLEX[deps.lang]);
}

// Proposal results like {task_id: 91} become known refs for the next prompt.
const RESULT_TYPES: Record<string, RefType> = {
  task_id: "task", board_id: "board", step_id: "step", leave_id: "leave",
  overtime_id: "overtime", channel_id: "channel", project_id: "project", person_id: "person",
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function renderHistory(rows: { role: "user" | "assistant"; content: any }[]): { messages: LoopMessage[]; knownRefs: Ref[] } {
  const messages: LoopMessage[] = [];
  const known = new Map<string, Ref>();
  const add = (r: Ref) => known.set(key(r), r);

  for (const { role, content } of rows) {
    if (role === "user") { messages.push({ role: "user", text: String(content?.text ?? "") }); continue; }
    const lines = [String(content?.text ?? "")];
    for (const p of content?.proposals ?? []) {
      let line = `[proposal ${p.tool} status=${p.status}: ${p.summary}`;
      if (p.result) line += ` result=${JSON.stringify(p.result)}`;
      if (p.error) line += ` error=${p.error}`;
      lines.push(line + "]");
      for (const [k, v] of Object.entries(p.result ?? {})) {
        const type = RESULT_TYPES[k];
        if (!type) continue;
        for (const id of Array.isArray(v) ? v : [v]) {
          if (id !== null && id !== undefined) add({ type, id: String(id), label: String(p.params?.title ?? p.summary) });
        }
      }
    }
    const refs: Ref[] = content?.refs ?? [];
    refs.forEach(add);
    if (refs.length) lines.push(`[refs ${refs.map((r) => `${key(r)} ${r.label}`).join("; ")}]`);
    messages.push({ role: "model", text: lines.filter(Boolean).join("\n") });
  }
  return { messages, knownRefs: [...known.values()] };
}
