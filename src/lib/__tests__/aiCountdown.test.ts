import { describe, it, expect, vi, afterEach } from "vitest";
import { CountdownScheduler } from "../aiCountdown";

describe("CountdownScheduler", () => {
  afterEach(() => vi.useRealTimers());

  it("runs once, can be cancelled, and dies with the page", () => {
    vi.useFakeTimers();
    const s = new CountdownScheduler(); const run = vi.fn();
    s.start("p1", 5000, run); s.start("p1", 5000, run);
    vi.advanceTimersByTime(4999); expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1); expect(run).toHaveBeenCalledTimes(1);
    s.start("p2", 5000, run); s.cancel("p2"); vi.advanceTimersByTime(6000);
    expect(run).toHaveBeenCalledTimes(1);
    expect(new CountdownScheduler().isRunning("p1")).toBe(false); // a reload starts empty
  });

  it("reports remaining time and stops running after firing", () => {
    vi.useFakeTimers();
    const s = new CountdownScheduler();
    s.start("p", 5000, () => {});
    vi.advanceTimersByTime(2000);
    expect(s.isRunning("p")).toBe(true);
    expect(s.remaining("p")).toBe(3000);
    vi.advanceTimersByTime(3000);
    expect(s.isRunning("p")).toBe(false);
    expect(s.remaining("p")).toBe(0);
  });
});
