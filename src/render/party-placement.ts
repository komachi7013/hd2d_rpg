import type { State } from '../simulation/state';
export interface Position {
  x: number;
  y: number;
  z: number;
}
export class PartyPlacement {
  companion: Position = { x: 0, y: 0, z: 0 };
  private previous: {
    map: State['map'];
    battle: boolean;
    lilia: boolean;
    x: number;
    z: number;
  } | null = null;
  reset() {
    this.previous = null;
  }
  update(state: State, inBattle: boolean, dt: number) {
    const previous = this.previous;
    const snap =
      !previous ||
      previous.map !== state.map ||
      previous.battle !== inBattle ||
      previous.lilia !== state.lilia ||
      Math.hypot(state.x - previous.x, state.z - previous.z) > 1.5;
    const player: Position = inBattle
      ? { x: -3, y: 0, z: 0 }
      : { x: state.x, y: 0.05, z: state.z };
    const target: Position = inBattle
      ? { x: -5, y: 0, z: 2 }
      : state.lilia
        ? { x: state.x - 1.2, y: 0.05, z: state.z + 1.6 }
        : { x: 2, y: 0, z: -13 };
    if (snap || inBattle || !state.lilia) this.companion = { ...target };
    else {
      const alpha = Math.min(1, dt * 4);
      this.companion.x += (target.x - this.companion.x) * alpha;
      this.companion.y += (target.y - this.companion.y) * alpha;
      this.companion.z += (target.z - this.companion.z) * alpha;
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
      camera: inBattle
        ? { x: 0, y: 0, z: 0 }
        : { x: state.x, y: 0, z: state.z - 2 },
    };
  }
}
