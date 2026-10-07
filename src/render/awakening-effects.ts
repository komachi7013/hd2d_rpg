/** Real-time, one-shot presentation state; independent of dialogue or turn input. */
export class AwakeningEffects {
  private startedAt: number | null = null;
  start(now: number) {
    this.startedAt = now;
  }
  reset() {
    this.startedAt = null;
  }
  sample(now: number): {
    phase: 'pendant' | 'awakening' | null;
    progress: number;
  } {
    if (this.startedAt === null) return { phase: null, progress: 0 };
    const elapsed = now - this.startedAt;
    if (elapsed < 1500)
      return { phase: 'pendant', progress: Math.max(0, elapsed / 1500) };
    if (elapsed < 3000)
      return { phase: 'awakening', progress: (elapsed - 1500) / 1500 };
    return { phase: null, progress: 1 };
  }
}
