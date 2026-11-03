import { describe, it, expect } from "vitest";
import {
  runAiLoop, renderHistory, type LoopMessage, type LoopDeps, type Ref, type Call,
} from "../../../supabase/functions/_shared/aiLoop";
import { AI_TOOLS } from "../../../supabase/functions/_shared/aiCatalog";
import { REFUSAL_EN } from "../../../supabase/functions/_shared/aiGuard";

type Turn = { text?: string; calls?: Call[] };

function script(...turns: Turn[]) {
  const seen: LoopMessage[][] = [];
  const callModel = async (h: LoopMessage[]) => {
    seen.push(structuredClone(h));
    const t = turns.shift() ?? { text: "done" };
    return { text: t.text, calls: t.calls ?? [] };
  };
  return { seen, callModel };
}

function deps(
  model: ReturnType<typeof script>,
  o: { knownRefs?: Ref[]; readResults?: Record<string, { data: unknown; refs: Ref[] }>; allowed?: string[]; lang?: "id" | "en" } = {},
): LoopDeps {
  return {
    callModel: model.callModel,
    runReadTool: async (name) => o.readResults?.[name] ?? { data: [], refs: [] },
    allowed: new Set(o.allowed ?? AI_TOOLS.map((t) => t.name)),
    knownRefs: o.knownRefs ?? [],
    lang: o.lang ?? "en",
  };
}

const user: LoopMessage[] = [{ role: "user", text: "..." }];
const task = { board_id: 4, title: "Laporan", assignee_ids: ["u-budi"], due_date: "2026-11-03", steps: ["a"] };
const board: Ref[] = [{ type: "board", id: "4", label: "Website" }];
const budi: Ref = { type: "person", id: "u-budi", label: "Budi" };
const lastTool = (h: LoopMessage[]) => h[h.length - 1] as Extract<LoopMessage, { role: "tool" }>;

describe("runAiLoop", () => {
  it("rejects an invented id until the model looks it up", async () => {
    const model = script(
      { calls: [{ name: "create_task", args: task }] },
      { calls: [{ name: "find_people", args: { query: "budi" } }] },
      { calls: [{ name: "create_task", args: task }] },
    );
    const out = await runAiLoop(user, deps(model, {
      knownRefs: board,
      readResults: { find_people: { data: [], refs: [budi] } },
    }));
    expect(model.seen[1][model.seen[1].length - 1]).toMatchObject({ role: "tool" });
    expect(JSON.stringify(lastTool(model.seen[1]).results[0].response)).toContain("person:u-budi");
    expect(out.proposals).toHaveLength(1);
    expect(out.proposals[0]).toMatchObject({ tool: "create_task", status: "pending" });
    expect(out.proposals[0].id).toMatch(/^[0-9a-f-]{36}$/);
    expect(out.proposals[0].summary).toContain("Website");
    expect(out.proposals[0].summary).toContain("Budi");
    expect(out.refs).toEqual([budi]);
  });

  it("answers a tool outside allowed with an error and never proposes it", async () => {
    const model = script(
      { calls: [{ name: "delete_task", args: { task_id: 7 } }] },
      { text: "Cannot do that." },
    );
    const out = await runAiLoop(user, deps(model, {
      knownRefs: [{ type: "task", id: "7", label: "T" }],
      allowed: AI_TOOLS.filter((t) => t.name !== "delete_task").map((t) => t.name),
    }));
    expect(lastTool(model.seen[1]).results[0].response).toHaveProperty("error");
    expect(out.proposals).toEqual([]);
    expect(out.text).toBe("Cannot do that.");
  });

  it("answers an unknown tool with an error", async () => {
    const model = script({ calls: [{ name: "drop_db", args: {} }] }, { text: "ok" });
    const out = await runAiLoop(user, deps(model));
    expect(lastTool(model.seen[1]).results[0].response).toHaveProperty("error");
    expect(out.proposals).toEqual([]);
  });

  it("ends with a text answer after two failed validations of the same tool", async () => {
    const bad = { calls: [{ name: "request_leave", args: { type: "Cuti", start_date: "2026-11-10" } }] };
    const model = script(bad, bad, { text: "never" });
    const out = await runAiLoop(user, deps(model, { lang: "id" }));
    expect(model.seen).toHaveLength(2);
    expect(out.proposals).toEqual([]);
    expect(out.text).toContain("end_date");
    expect(out.text).not.toBe("never");
  });

  it("stops at the 6th step with the too complex text", async () => {
    const read = { calls: [{ name: "issues", args: {} }] };
    const model = script(read, read, read, read, read, read);
    const en = await runAiLoop(user, deps(model));
    expect(model.seen).toHaveLength(5);
    expect(en.text).toBe("That request is too complex, try splitting it into smaller ones.");
    const id = await runAiLoop(user, deps(script(read, read, read, read, read, read), { lang: "id" }));
    expect(id.text).toBe("Permintaan terlalu rumit, coba dipecah menjadi beberapa perintah.");
  });

  it("ends the loop on ask_choice with choices filled", async () => {
    const model = script(
      { calls: [{ name: "ask_choice", args: { question: "Which Budi?", options: ["Budi S", "Budi W"] } }] },
      { text: "never" },
    );
    const out = await runAiLoop(user, deps(model));
    expect(model.seen).toHaveLength(1);
    expect(out.text).toBe("Which Budi?");
    expect(out.choices).toEqual([{ label: "Budi S", reply: "Budi S" }, { label: "Budi W", reply: "Budi W" }]);
  });

  it("runs the read tools of one turn side by side and keeps result order", async () => {
    const model = script(
      { calls: [
        { name: "find_people", args: { query: "a" } },
        { name: "find_people", args: { query: "b" } },
        { name: "find_people", args: { query: "c" } },
      ] },
      { text: "Done." },
    );
    let running = 0, peak = 0;
    const d = deps(model);
    d.runReadTool = async (_name, args) => {
      running++; peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 20));
      running--;
      return { data: { q: args.query }, refs: [] };
    };
    const out = await runAiLoop(user, d);
    expect(peak).toBe(3);
    expect(lastTool(model.seen[1]).results.map((r: { response: unknown }) => (r.response as { data: { q: string } }).data.q)).toEqual(["a", "b", "c"]);
    expect(out.text).toBe("Done.");
  });

  it("refuses a navigate button for a page the user cannot open", async () => {
    const model = script(
      { calls: [{ name: "navigate", args: { page: "payroll", month: "2026-08", label: "Payroll" } }] },
      { text: "Data tidak tersedia." },
    );
    const out = await runAiLoop(user, { ...deps(model), pages: new Set(["dashboard", "leave"]) });
    expect(out.links).toEqual([]);
    expect(lastTool(model.seen[1]).results[0].response).toHaveProperty("error");
    expect(out.text).toBe("Data tidak tersedia.");
  });

  it("builds navigate paths from a page list and rejects free-form urls", async () => {
    const model = script(
      { calls: [
        { name: "navigate", args: { path: "//evil.com", label: "Evil" } },
        { name: "navigate", args: { page: "board", label: "Board" } },
        { name: "navigate", args: { page: "payroll", month: "2026-10", label: "Payroll" } },
      ] },
      { text: "Open payroll." },
    );
    const out = await runAiLoop(user, deps(model));
    expect(out.links).toEqual([{ path: "/payroll?month=2026-10", label: "Payroll" }]);
    const res = lastTool(model.seen[1]).results;
    expect(res[0].response).toHaveProperty("error");
    expect(res[1].response).toHaveProperty("error");
    expect(out.text).toBe("Open payroll.");
  });

  it("stops after the turn that collected proposals", async () => {
    const model = script(
      { text: "Here you go.", calls: [
        { name: "add_steps", args: { task_id: 7, steps: ["x"] } },
        { name: "comment_task", args: { task_id: 7, text: "hi" } },
      ] },
      { text: "never" },
    );
    const out = await runAiLoop(user, deps(model, { knownRefs: [{ type: "task", id: "7", label: "Laporan" }] }));
    expect(model.seen).toHaveLength(1);
    expect(out.proposals.map((p) => p.tool)).toEqual(["add_steps", "comment_task"]);
    expect(out.proposals[0].summary).toBe("Add 1 steps to Laporan");
    expect(out.text).toBe("Here you go.");
  });

  it("replaces code in the final text and keeps the proposals", async () => {
    const model = script({ text: "```py\nprint(1)\n```", calls: [{ name: "add_steps", args: { task_id: 7, steps: ["x"] } }] });
    const out = await runAiLoop(user, deps(model, { knownRefs: [{ type: "task", id: "7", label: "T" }] }));
    expect(out.text).toBe(REFUSAL_EN);
    expect(out.proposals).toHaveLength(1);
  });

  it("returns this turn's read refs capped at 100", async () => {
    const many: Ref[] = Array.from({ length: 150 }, (_, i) => ({ type: "person", id: `u${i}`, label: `P${i}` }));
    const model = script({ calls: [{ name: "find_people", args: { query: "a" } }] }, { text: "ok" });
    const out = await runAiLoop(user, deps(model, { knownRefs: board, readResults: { find_people: { data: [], refs: many } } }));
    expect(out.refs).toHaveLength(100);
    expect(out.refs.some((r) => r.type === "board")).toBe(false);
  });
});

describe("renderHistory", () => {
  it("turns proposal results into known refs and states status", () => {
    const { messages, knownRefs } = renderHistory([
      { role: "user", content: { text: "buat task", flags: ["injection_pattern"] } },
      { role: "assistant", content: {
        text: "Siap.",
        proposals: [
          { id: "p1", tool: "create_task", params: { board_id: 4, title: "Laporan" }, summary: "Create task \"Laporan\" on Website", status: "executed", result: { task_id: 91 } },
          { id: "p2", tool: "add_steps", params: { task_id: 5, steps: ["a"] }, summary: "Add 1 steps to 5", status: "failed", error: "denied" },
        ],
        choices: [], links: [], refs: board,
      } },
    ]);
    expect(messages[0]).toEqual({ role: "user", text: "buat task" });
    expect(messages[1].role).toBe("model");
    const text = (messages[1] as { text: string }).text;
    expect(text).toContain("executed");
    expect(text).toContain("91");
    expect(text).toContain("failed");
    expect(text).toContain("denied");
    expect(knownRefs).toEqual(expect.arrayContaining([
      board[0],
      expect.objectContaining({ type: "task", id: "91" }),
    ]));
  });
});
