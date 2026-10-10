import { maps, enemies, type MapId, type EnemyId } from './data';
export const townMaps = ['village', 'merca'] as const;
export const isTown = (map: MapId) =>
  (townMaps as readonly string[]).includes(map);
export const mapHalfWidth = (map: MapId) => (isTown(map) ? 18 : 5);
export interface Footprint {
  x: number;
  z: number;
  r?: number;
  halfX?: number;
  halfZ?: number;
}
export function intersects(
  x: number,
  z: number,
  shape: Footprint,
  padding = 0.3,
): boolean {
  return shape.r !== undefined
    ? Math.hypot(shape.x - x, shape.z - z) < shape.r + padding
    : Math.abs(shape.x - x) < (shape.halfX ?? 0) + padding &&
        Math.abs(shape.z - z) < (shape.halfZ ?? 0) + padding;
}
export function npcPatrol(time: number) {
  const t = ((time % 12) + 12) % 12;
  if (t < 3) return { offset: 0, direction: 0, moving: false };
  if (t < 5) return { offset: (t - 3) * 0.7, direction: 2, moving: true };
  if (t < 8) return { offset: 1.4, direction: 0, moving: false };
  if (t < 10)
    return { offset: 1.4 - (t - 8) * 0.7, direction: 1, moving: true };
  return { offset: 0, direction: 0, moving: false };
}
export class EncounterMovement {
  positions = new Map<EnemyId, { x: number; z: number }>();
  reset(map: MapId) {
    this.positions.clear();
    for (const e of maps[map].encounters)
      this.positions.set(e.id, { x: e.x, z: e.z });
  }
  update(
    map: MapId,
    x: number,
    z: number,
    dt: number,
    defeated: EnemyId[],
    walkable: (x: number, z: number) => boolean,
  ) {
    if (!['entrance', 'depths'].includes(map)) return;
    for (const e of maps[map].encounters) {
      if (e.id === 'rescue' || enemies[e.id].boss || defeated.includes(e.id))
        continue;
      const p = this.positions.get(e.id)!;
      const dx = x - p.x,
        dz = z - p.z,
        d = Math.hypot(dx, dz);
      if (d > 7 || d < 1.2) continue;
      const step = Math.min(dt * 1.25, d - 1.2),
        nx = p.x + (dx / d) * step,
        nz = p.z + (dz / d) * step;
      if (walkable(nx, p.z)) p.x = nx;
      if (walkable(p.x, nz)) p.z = nz;
    }
  }
}
