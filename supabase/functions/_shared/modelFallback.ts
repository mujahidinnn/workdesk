// Picks which Gemini model answers. Free-tier capacity is per model, so a busy model (429 or 503)
// hands the request to the next one in GEMINI_MODEL. A history signed by one model was accepted
// by another in a live check, so the switch is allowed mid-loop too.
export interface FallbackState { i: number }

export async function callWithFallback<T>(opts: {
  models: string[];
  state: FallbackState;
  call: (model: string) => Promise<T>;
  isBusy: (e: unknown) => boolean;
  canRetry: () => boolean;
  sleep?: (ms: number) => Promise<void>;
}): Promise<T> {
  const { models, state, call, isBusy, canRetry } = opts;
  const sleep = opts.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  let retried = false;
  for (;;) {
    try {
      return await call(models[state.i]);
    } catch (e) {
      if (!isBusy(e)) throw e;
      if (state.i < models.length - 1) { state.i++; continue; }
      // Out of models: one short retry, only if the request deadline allows it.
      if (retried || !canRetry()) throw e;
      retried = true;
      await sleep(1000);
    }
  }
}

// Page buttons the assistant may offer, keyed by the feature a user needs to open that page.
export const NAV_FEATURE: Record<string, string | null> = {
  dashboard: null, profile: null, chat: null,
  payroll: "payroll", users: "master", employees: "master", ai_settings: "master", master: "master",
  leave: "leave", overtime: "overtime-business-trip", attendance: "attendance",
  board: "board", my_tasks: "board", calendar: "holidays", daily_report: "daily-report",
};
