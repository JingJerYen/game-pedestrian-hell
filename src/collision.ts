// AABB（軸對齊方框）碰撞：兩個方框在 X、Y、Z 三個軸上都有重疊才算撞到。
// 這就是整個遊戲的碰撞系統，不需要物理引擎。

import type * as THREE from "three";
import { TUNING } from "./tuning";

export interface Size3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

// 會「擋住」玩家的方塊（靜止路障、騎樓柱子）：中心點＋尺寸
export interface Blocker {
  readonly pos: { readonly x: number; readonly y: number; readonly z: number };
  readonly size: Size3;
}

// 前方（或後退時後方）有方塊就把這一幀的捲動量夾住，讓玩家貼著它停下。
// shrink 用 TUNING.obstacleBlockShrink：貼齊視覺，不然玩家會半個身體陷進去
export function clampScrollBy(
  list: readonly Blocker[],
  playerPos: THREE.Vector3,
  playerSize: Size3,
  dz: number,
  shrink: number,
): number {
  for (const o of list) {
    const halfX = ((playerSize.x + o.size.x) / 2) * shrink;
    if (Math.abs(o.pos.x - playerPos.x) >= halfX) continue;
    const halfZ = ((playerSize.z + o.size.z) / 2) * shrink;
    const zo = o.pos.z - playerPos.z;
    if (dz > 0 && zo < 0) dz = Math.min(dz, Math.max(0, -halfZ - zo));
    if (dz < 0 && zo > 0) dz = Math.max(dz, Math.min(0, halfZ - zo));
  }
  return dz;
}

// 玩家想橫移到的位置會不會撞進這些方塊（同樣貼齊視覺）
export function blockedBy(list: readonly Blocker[], pos: THREE.Vector3, size: Size3, shrink: number): boolean {
  return list.some((o) => aabbHit(pos, size, o.pos, o.size, shrink));
}

// shrink 不傳就用 TUNING.hitboxShrink（致死判定從寬）；
// 靜止路障的「擋住」判定要貼齊視覺，傳 TUNING.obstacleBlockShrink
export function aabbHit(
  posA: THREE.Vector3,
  sizeA: Size3,
  posB: { readonly x: number; readonly y: number; readonly z: number },
  sizeB: Size3,
  shrink?: number,
): boolean {
  const s = shrink ?? TUNING.hitboxShrink;
  return (
    Math.abs(posA.x - posB.x) < ((sizeA.x + sizeB.x) / 2) * s &&
    Math.abs(posA.y - posB.y) < ((sizeA.y + sizeB.y) / 2) * s &&
    Math.abs(posA.z - posB.z) < ((sizeA.z + sizeB.z) / 2) * s
  );
}
