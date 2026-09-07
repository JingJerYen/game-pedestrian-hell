// AABB（軸對齊方框）碰撞：兩個方框在 X、Y、Z 三個軸上都有重疊才算撞到。
// 這就是整個遊戲的碰撞系統，不需要物理引擎。

import type * as THREE from "three";
import { TUNING } from "./tuning";

export interface Size3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export function aabbHit(
  posA: THREE.Vector3,
  sizeA: Size3,
  posB: THREE.Vector3,
  sizeB: Size3,
): boolean {
  const s = TUNING.hitboxShrink;
  return (
    Math.abs(posA.x - posB.x) < ((sizeA.x + sizeB.x) / 2) * s &&
    Math.abs(posA.y - posB.y) < ((sizeA.y + sizeB.y) / 2) * s &&
    Math.abs(posA.z - posB.z) < ((sizeA.z + sizeB.z) / 2) * s
  );
}
