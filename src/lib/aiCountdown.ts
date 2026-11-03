// Auto mode countdowns. Lives in memory only, so a reload drops every pending run
// and the card falls back to waiting for Run.
export class CountdownScheduler {
  private timers = new Map<string, { handle: ReturnType<typeof setTimeout>; endsAt: number }>();

  /** Starting an id that is already counting down is a no-op. */
  start(id: string, ms: number, run: () => void): void {
    if (this.timers.has(id)) return;
    const handle = setTimeout(() => {
      this.timers.delete(id);
      run();
    }, ms);
    this.timers.set(id, { handle, endsAt: Date.now() + ms });
  }

  cancel(id: string): void {
    const t = this.timers.get(id);
    if (!t) return;
    clearTimeout(t.handle);
    this.timers.delete(id);
  }

  isRunning(id: string): boolean {
    return this.timers.has(id);
  }

  remaining(id: string): number {
    const t = this.timers.get(id);
    return t ? Math.max(0, t.endsAt - Date.now()) : 0;
  }
}
