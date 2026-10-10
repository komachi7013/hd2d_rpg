import type { State } from '../simulation/state';
export interface Position {
  x: number;
  y: number;
  z: number;
}
export class PartyPlacement {
  companion: Position = { x: 0, y: 0, z: 0 };
  private trail: { x: number; z: number }[] = [];
  private previous: {
    map: State['map'];
    battle: boolean;
    lilia: boolean;
    x: number;
    z: number;
  } | null = null;
  companionDirection = 3;
  reset() {
    this.previous = null;
    this.trail = [];
  }
  update(state: State, inBattle: boolean, _dt: number) {
    const previous = this.previous;
    const snap =
      !previous ||
      previous.map !== state.map ||
      previous.battle !== inBattle ||
      previous.lilia !== state.lilia ||
      Math.hypot(state.x - previous.x, state.z - previous.z) > 1.5;
    const player = inBattle
      ? { x: -3, y: 0, z: 0 }
      : { x: state.x, y: 0.05, z: state.z };
    const old = { ...this.companion };
    if (inBattle) this.companion = { x: -5, y: 0, z: 2 };
    else if (!state.lilia) this.companion = { x: 2, y: 0, z: -13 };
    else {
      if (snap) {
        this.trail = [
          { x: state.x, z: state.z + 1.6 },
          { x: state.x, z: state.z },
        ];
        this.companionDirection = 3;
      } else {
        const last = this.trail.at(-1)!;
        if (Math.hypot(last.x - state.x, last.z - state.z) > 0.001)
          this.trail.push({ x: state.x, z: state.z });
      }
      let distance = 1.6;
      let point = this.trail[0];
      for (let i = this.trail.length - 1; i > 0; i--) {
        const a = this.trail[i],
          b = this.trail[i - 1],
          segment = Math.hypot(a.x - b.x, a.z - b.z);
        if (segment >= distance) {
          const ratio = distance / segment;
          point = {
            x: a.x + (b.x - a.x) * ratio,
            z: a.z + (b.z - a.z) * ratio,
          };
          this.trail = this.trail.slice(i - 1);
          break;
        }
        distance -= segment;
      }
      this.companion = { ...point, y: 0.05 };
      const dx = point.x - old.x,
        dz = point.z - old.z;
      if (!snap && Math.hypot(dx, dz) > 0.001)
        this.companionDirection =
          Math.abs(dx) > Math.abs(dz) ? (dx < 0 ? 1 : 2) : dz < 0 ? 3 : 0;
    }
    this.previous = {
      map: state.map,
      battle: inBattle,
      lilia: state.lilia,
      x: state.x,
      z: state.z,
    };
    return {
      snap,
      player,
      companion: { ...this.companion },
      companionDirection: this.companionDirection,
      companionMoving:
        !snap &&
        Math.hypot(this.companion.x - old.x, this.companion.z - old.z) > 0.001,
      camera: inBattle
        ? { x: 0, y: 0, z: 0 }
        : { x: state.x, y: 0, z: state.z - 2 },
    };
  }
}
