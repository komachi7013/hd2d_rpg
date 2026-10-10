import type { BattlePhase } from '../simulation/state';
export const IMPACT_MS = 380;
export const ACTION_MS = 950;
export const BETWEEN_ACTIONS_MS = 300;
/** Presentation clock: combat rules remain synchronous and deterministic. */
export class CombatPlayback {
  private index = 0;
  private started = 0;
  private impacted = false;
  private active = false;
  done = false;
  constructor(
    readonly phases: BattlePhase[],
    readonly start: (phase: BattlePhase) => void,
    readonly impact: (phase: BattlePhase) => void,
    readonly complete: () => void,
  ) {}
  update(now: number) {
    if (this.done) return;
    const phase = this.phases[this.index];
    if (!phase) {
      this.done = true;
      this.complete();
      return;
    }
    if (!this.active) {
      this.active = true;
      this.started = now;
      this.impacted = false;
      this.start(phase);
    }
    const elapsed = now - this.started;
    if (!this.impacted && elapsed >= IMPACT_MS) {
      this.impacted = true;
      this.impact(phase);
    }
    if (elapsed >= ACTION_MS + BETWEEN_ACTIONS_MS) {
      this.index++;
      this.active = false;
      if (this.index >= this.phases.length) {
        this.done = true;
        this.complete();
      }
    }
  }
}
