// 靜止路障：違停車、機車堆、攤販……世界裡不會動的東西。
// 碰到不會死，只是「擋住」——擋前進（clampScroll）也擋橫移（blocksAt）。

import * as THREE from "three";
import { TUNING, colX } from "./tuning";
import { aabbHit, type Size3 } from "./collision";

interface Obstacle {
  mesh: THREE.Mesh;
  size: Size3;
  col: number; // 0 = 人行道、1.. = 車道
}

const SIDEWALK_COLORS = [0x6b6b70, 0x8a7a5c, 0x5c7a8a]; // 之後換成違停機車/攤販 sprite
const PARKED_CAR_COLORS = [0x9aa3ad, 0x7d8a99, 0xb0a08c];

export class Obstacles {
  private readonly list: Obstacle[] = [];
  private nextSpawnAt = 10; // 走到第幾公尺會出現下一個路障

  constructor(private readonly scene: THREE.Scene) {}

  // dz = 這一幀世界捲了多少；maxDist = 目前最遠走到幾公尺（用它排程生成）
  update(dz: number, maxDist: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.mesh.position.z += dz;
      if (o.mesh.position.z > 30) {
        this.scene.remove(o.mesh);
        this.list.splice(i, 1);
      }
    }
    if (maxDist >= this.nextSpawnAt) {
      this.spawn();
      this.nextSpawnAt =
        maxDist +
        THREE.MathUtils.lerp(TUNING.obstacleGapMin, TUNING.obstacleGapMax, Math.random());
    }
  }

  private spawn(): void {
    const t = TUNING;
    const onRoad = Math.random() < t.obstacleRoadChance;
    const col = onRoad ? 1 : 0; // 車道路障只出現在最靠人行道的路邊車道
    const size = onRoad ? t.vehicles.car.size : t.sidewalkObstacleSize; // 違停以汽車為準
    const colors = onRoad ? PARKED_CAR_COLORS : SIDEWALK_COLORS;
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshLambertMaterial({
        color: colors[Math.floor(Math.random() * colors.length)],
      }),
    );
    mesh.position.set(colX(col), size.y / 2, -t.obstacleSpawnZ);
    this.scene.add(mesh);
    this.list.push({ mesh, size, col });
  }

  // 前方（或後退時後方）有路障就把這一幀的捲動量夾住，讓玩家貼著路障停下
  clampScroll(playerPos: THREE.Vector3, playerSize: Size3, dz: number): number {
    const s = TUNING.hitboxShrink;
    for (const o of this.list) {
      const halfX = ((playerSize.x + o.size.x) / 2) * s;
      if (Math.abs(o.mesh.position.x - playerPos.x) >= halfX) continue;
      const halfZ = ((playerSize.z + o.size.z) / 2) * s;
      const zo = o.mesh.position.z - playerPos.z;
      if (dz > 0 && zo < 0) dz = Math.min(dz, Math.max(0, -halfZ - zo));
      if (dz < 0 && zo > 0) dz = Math.max(dz, Math.min(0, halfZ - zo));
    }
    return dz;
  }

  // 玩家想橫移到的位置會不會撞進路障
  blocksAt(pos: THREE.Vector3, size: Size3): boolean {
    return this.list.some((o) => aabbHit(pos, size, o.mesh.position, o.size));
  }

  // 目前有路障佔著的車道（迎面車生成時避開，才不會出現車穿過違停車的畫面）
  occupiedRoadCols(): ReadonlySet<number> {
    const cols = new Set<number>();
    for (const o of this.list) if (o.col >= 1) cols.add(o.col);
    return cols;
  }

  reset(): void {
    for (const o of this.list) this.scene.remove(o.mesh);
    this.list.length = 0;
    this.nextSpawnAt = 10;
  }
}
