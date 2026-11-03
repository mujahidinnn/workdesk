import { describe, expect, it, vi } from "vitest";
import { callWithFallback, NAV_FEATURE } from "../../../supabase/functions/_shared/modelFallback.ts";

class Busy extends Error {}
const run = (over: Partial<Parameters<typeof callWithFallback<string>>[0]> & { script: (string | Error)[] }) => {
  const calls: string[] = [];
  const state = { i: 0 };
  const queue = [...over.script];
  const p = callWithFallback<string>({
    models: ["a", "b", "c"], state,
    call: async (m) => { calls.push(m); const n = queue.shift()!; if (n instanceof Error) throw n; return n; },
    isBusy: (e) => e instanceof Busy, canRetry: () => true, sleep: async () => {}, ...over,
  });
  return { p, calls, state };
};

describe("callWithFallback", () => {
  it("moves to the next model when one is busy, and stays there", async () => {
    const r = run({ script: [new Busy(), "ok"] });
    expect(await r.p).toBe("ok");
    expect(r.calls).toEqual(["a", "b"]);
    expect(r.state.i).toBe(1);
  });

  it("keeps the chosen model for later calls of the same request", async () => {
    const r = run({ script: [new Busy(), new Busy(), "first"] });
    expect(await r.p).toBe("first");
    expect(r.state.i).toBe(2);
  });

  it("gives up after the last model, retrying once only when there is time", async () => {
    const r = run({ script: [new Busy(), new Busy(), new Busy(), new Busy()] });
    await expect(r.p).rejects.toBeInstanceOf(Busy);
    expect(r.calls).toEqual(["a", "b", "c", "c"]);
    const noTime = run({ canRetry: () => false, script: [new Busy(), new Busy(), new Busy()] });
    await expect(noTime.p).rejects.toBeInstanceOf(Busy);
    expect(noTime.calls).toEqual(["a", "b", "c"]);
  });

  it("rethrows errors that are not capacity problems at once", async () => {
    const sleep = vi.fn();
    const r = run({ sleep, script: [new Error("bad request")] });
    await expect(r.p).rejects.toThrow("bad request");
    expect(r.calls).toEqual(["a"]);
  });
});

describe("NAV_FEATURE", () => {
  it("gates payroll and master pages and leaves the dashboard open", () => {
    expect(NAV_FEATURE.payroll).toBe("payroll");
    expect(NAV_FEATURE.users).toBe("master");
    expect(NAV_FEATURE.dashboard).toBeNull();
  });
});
