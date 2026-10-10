import type { MapId } from '../simulation/data';
export interface TownBuilding {
  asset: string;
  x: number;
  z: number;
  size: number;
  halfX: number;
  halfZ: number;
}
export function townBuildings(map: MapId): TownBuilding[] {
  const city = map === 'merca';
  return [
    { asset: 'townShop', x: 9, z: 20, size: 10, halfX: 3.2, halfZ: 2 },
    { asset: 'townHouse', x: -13, z: 21, size: 9, halfX: 2.8, halfZ: 2 },
    {
      asset: city ? 'warehouse' : 'cottage',
      x: -13,
      z: 5,
      size: 10,
      halfX: 3.2,
      halfZ: 2,
    },
    { asset: 'townHouse', x: 10, z: 5, size: 9, halfX: 2.8, halfZ: 2 },
    { asset: 'townShop', x: -13, z: -10, size: 10, halfX: 3.2, halfZ: 2 },
    { asset: 'townManor', x: 10, z: -11, size: 12, halfX: 3.8, halfZ: 2.4 },
    { asset: 'cottage', x: -13, z: -22, size: 9, halfX: 2.8, halfZ: 2 },
  ];
}
export const townCrossroads = [14, 0, -16];
export const riverX = -7;
export const riverHalfWidth = 2;
export const bridgeZ = [14, -16];
export function riverBlocked(
  map: MapId,
  x: number,
  z: number,
  padding = 0.3,
): boolean {
  return (
    map === 'merca' &&
    Math.abs(x - riverX) < riverHalfWidth + padding &&
    !bridgeZ.some((bz) => Math.abs(z - bz) < 1.45 - padding)
  );
}
