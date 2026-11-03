import { describe, it, expect } from "vitest";
import {
  navPath, AI_TOOLS, getTool, validateParams, refsOf, isSafePath, cardModes, type AiTier,
} from "../../../supabase/functions/_shared/aiCatalog";

const tool = (n: string) => getTool(n)!;
const validTask = { board_id: 4, title: "T", assignee_ids: ["u1", "u2"], due_date: "2026-11-10", steps: ["a", "b"] };

describe("aiCatalog", () => {
  it("offers exactly the agreed write surface", () => {
    const names = (t: AiTier) => AI_TOOLS.filter((x) => x.tier === t).map((x) => x.name).sort();
    expect(names("write")).toEqual(["add_holiday","add_steps","comment_task","create_daily_report","create_task","request_leave","request_overtime","toggle_step","update_task"]);
    expect(names("critical")).toEqual(["delete_step","delete_task","review_leave","review_overtime","send_chat_message"]);
    expect(names("read")).toHaveLength(16);
    expect(names("read")).toContain("find_channels");
    expect(AI_TOOLS.filter((x) => x.terminal).map((x) => x.name)).toEqual(["ask_choice"]);
  });

  it("makes a big batch critical even in auto", () => {
    const six = Array(6).fill({ tool: "add_steps" });
    expect(cardModes(six, "auto")).toEqual(Array(6).fill("confirm"));
    expect(cardModes([{ tool: "create_task" }], "auto")).toEqual(["countdown"]);
    expect(cardModes([{ tool: "create_task" }, { tool: "delete_task" }], "auto")).toEqual(["countdown", "confirm"]);
    expect(cardModes([{ tool: "create_task" }], "ask")).toEqual(["confirm"]);
  });

  it("validates create_task", () => {
    const t = tool("create_task");
    expect(validateParams(t, validTask).ok).toBe(true);
    expect(validateParams(t, { ...validTask, due_date: "03-11-2026" }).ok).toBe(false);
    expect(validateParams(t, { ...validTask, title: "" }).ok).toBe(false);
    expect(validateParams(t, { ...validTask, steps: [""] }).ok).toBe(false);
    expect(validateParams(t, { ...validTask, steps: Array(21).fill("x") }).ok).toBe(false);
  });

  it("matches real payloads for update_task, leave, overtime, daily report", () => {
    expect(validateParams(tool("update_task"), { task_id: 1, priority: "urgent" }).ok).toBe(true);
    const leave = { start_date: "2026-11-10", end_date: "2026-11-11", reason: "x" };
    expect(validateParams(tool("request_leave"), leave).ok).toBe(false);
    expect(validateParams(tool("request_leave"), { ...leave, type: "Sakit" }).ok).toBe(true);
    expect(tool("request_leave").summary({ ...leave, type: "Sakit" })).toContain("Sakit");
    const ot = { type: "Overtime", date: "2026-11-10", start_time: "18:00", end_time: "20:30", activity_description: "x" };
    expect(validateParams(tool("request_overtime"), ot).ok).toBe(true);
    expect(validateParams(tool("request_overtime"), { ...ot, start_time: "6pm" }).ok).toBe(false);
    expect(validateParams(tool("request_overtime"), { ...ot, type: "Other" }).ok).toBe(false);
    const dr = { date: "2026-11-10", project_id: 2, task_desc: "x", progress_pct: 50, board_task_id: 9 };
    expect(validateParams(tool("create_daily_report"), dr).ok).toBe(true);
    expect(validateParams(tool("create_daily_report"), { ...dr, progress_pct: 101 }).ok).toBe(false);
    expect(validateParams(tool("create_daily_report"), { ...dr, project_id: undefined }).ok).toBe(false);
    expect(refsOf(tool("create_daily_report"), dr)).toEqual([{ type: "project", id: "2" }, { type: "task", id: "9" }]);
  });

  it("derives refs, one per array element", () => {
    const refs = refsOf(tool("create_task"), validTask);
    expect(refs).toEqual([
      { type: "board", id: "4" },
      { type: "person", id: "u1" },
      { type: "person", id: "u2" },
    ]);
  });

  it("requires permissions on mutating tools", () => {
    for (const t of AI_TOOLS.filter((x) => x.tier !== "read" && x.name !== "send_chat_message")) {
      expect(t.permission, t.name).not.toBeNull();
    }
    expect(tool("send_chat_message").permission).toBeNull();
    expect(tool("review_leave").permission).toEqual({ feature: "leave", action: "update" });
    expect(tool("add_holiday").permission).toEqual({ feature: "holidays", action: "create" });
  });

  it("summarises create_task with labels", () => {
    const s = tool("create_task").summary(validTask, (type, id) => (type === "board" ? "Sprint" : `Name-${id}`));
    expect(s).toContain("Sprint");
    expect(s).toContain("Name-u1");
    expect(s).toContain("Name-u2");
    expect(s).toContain("2026-11-10");
    expect(s).toContain("2");
    expect(tool("create_task").summary(validTask)).toContain("u1");
  });

  it("allows only safe in-app paths", () => {
    expect(isSafePath("/payroll?month=2026-08")).toBe(true);
    expect(isSafePath("/")).toBe(true);
    expect(isSafePath("/boards/3?task=5")).toBe(true);
    expect(isSafePath("https://x.com")).toBe(false);
    expect(isSafePath("//x.com")).toBe(false);
    expect(isSafePath("/unknown")).toBe(false);
  });

  it("exposes no forbidden tool names", () => {
    for (const t of AI_TOOLS) {
      if (t.name !== "payroll_status") expect(t.name).not.toContain("payroll");
      for (const bad of ["role", "permission", "user_account", "rate"]) expect(t.name).not.toContain(bad);
    }
  });
});

describe("navPath", () => {
  it("builds focused deep links and refuses a board without id", () => {
    expect(navPath({ page: "users", user_id: "u1" })).toBe("/master?tab=users&user=u1");
    expect(navPath({ page: "payroll", month: "2026-08", user_id: "u1" })).toBe("/payroll?month=2026-08&user=u1");
    expect(navPath({ page: "employees", employee_id: 7 })).toBe("/master?tab=employees&employee=7");
    expect(navPath({ page: "board", board_id: 3 })).toBe("/boards/3");
    expect(navPath({ page: "board" })).toBeNull();
    expect(navPath({ page: "leave" })).toBe("/leave");
  });
});
