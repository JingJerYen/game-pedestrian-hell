// 靜止路障：違停車、機車堆、攤販、超長的機車停車格……世界裡不會動的東西。
// 碰到不會死，只是「擋住」——擋前進（clampScroll）也擋橫移（blocksAt）。
// 兩側人行道、兩側路邊車道都會出現；不會生成在路口範圍內。

import * as THREE from "three";
import {
  TUNING,
  colX,
  LAST_ROAD_COL,
  RIGHT_SIDEWALK_COL,
  type LevelConfig,
} from "./tuning";
import { aabbHit, type Size3 } from "./collision";
import type { Intersections } from "./intersections";

interface Obstacle {
  mesh: THREE.Mesh;
  size: Size3;
  col: number; // 0 / RIGHT_SIDEWALK_COL = 人行道；1 / LAST_ROAD_COL = 路邊車道
}

const SIDEWALK_COLORS = [0x6b6b70, 0x8a7a5c, 0x5c7a8a]; // 之後換成違停機車/攤販 sprite
const LONG_COLOR = 0x50555e; // 超長路障（之後鋪機車停車格皮）
const PARKED_CAR_COLORS = [0x9aa3ad, 0x7d8a99, 0xb0a08c];

export class Obstacles {
  private readonly list: Obstacle[] = [];
  private nextSpawnAt = 10; // 走到第幾公尺會出現下一個路障

  constructor(private readonly scene: THREE.Scene) {}

  // dz = 這一幀世界捲了多少；maxDist = 本關最遠走到幾公尺（用它排程生成）
  update(
    dz: number,
    maxDist: number,
    level: LevelConfig,
    intersections: Intersections,
  ): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      o.mesh.position.z += dz;
      if (o.mesh.position.z - o.size.z / 2 > 30) {
        this.scene.remove(o.mesh);
        this.list.splice(i, 1);
      }
    }
    if (maxDist >= this.nextSpawnAt) {
      // 生成點撞到路口就先跳過，過幾公尺再試（路口範圍內不放路障）
      if (intersections.nearZone(-TUNING.obstacleSpawnZ, 10)) {
        this.nextSpawnAt = maxDist + 5;
        return;
      }
      this.spawn(level);
      this.nextSpawnAt =
        maxDist +
        THREE.MathUtils.lerp(level.obstacleGapMin, level.obstacleGapMax, Math.random());
    }
  }

  private spawn(level: LevelConfig): void {
    const t = TUNING;
    const onRoad = Math.random() < level.obstacleRoadChance;
    let col: number;
    let size: Size3;
    let color: number;
    if (onRoad) {
      // 違停車：左右兩側靠人行道的路邊車道
      col = Math.random() < 0.5 ? 1 : LAST_ROAD_COL;
      size = t.vehicles.car.size;
      color = PARKED_CAR_COLORS[Math.floor(Math.random() * PARKED_CAR_COLORS.length)];
    } else {
      // 人行道路障：左右兩側都有，偶爾是超長版（機車停車格）
      col = Math.random() < 0.5 ? 0 : RIGHT_SIDEWALK_COL;
      const long = Math.random() < t.sidewalkLongChance;
      size = long ? t.sidewalkLongObstacleSize : t.sidewalkObstacleSize;
      color = long
        ? LONG_COLOR
        : SIDEWALK_COLORS[Math.floor(Math.random() * SIDEWALK_COLORS.length)];
    }
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(colX(col), size.y / 2, -t.obstacleSpawnZ);
    this.scene.add(mesh);
    this.list.push({ mesh, size, col });
  }

  // 路口生成時清掉跟它重疊的路障（先生成的路障擋在後生成的路口上時用）
  removeNear(z: number, margin: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      if (Math.abs(o.mesh.position.z - z) < margin + o.size.z / 2) {
        this.scene.remove(o.mesh);
        this.list.splice(i, 1);
      }
    }
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

  // 同向車避開違停用：這條 x 附近、z 再往前（更小）range 公尺內有沒有路障
  hasObstacleAhead(x: number, z: number, range: number): boolean {
    return this.list.some(
      (o) =>
        Math.abs(o.mesh.position.x - x) < 1.2 &&
        o.mesh.position.z < z &&
        z - o.mesh.position.z < range,
    );
  }

  // 玩家想橫移到的位置會不會撞進路障
  blocksAt(pos: THREE.Vector3, size: Size3): boolean {
    return this.list.some((o) => aabbHit(pos, size, o.mesh.position, o.size));
  }

  // 目前有路障佔著的車道（車輛生成時避開，才不會出現車穿過違停車的畫面）
  occupiedRoadCols(): ReadonlySet<number> {
    const cols = new Set<number>();
    for (const o of this.list) {
      if (o.col >= 1 && o.col <= LAST_ROAD_COL) cols.add(o.col);
    }
    return cols;
  }

  // debug overlay 用
  get count(): number {
    return this.list.length;
  }

  reset(): void {
    for (const o of this.list) this.scene.remove(o.mesh);
    this.list.length = 0;
    this.nextSpawnAt = 10;
  }
}
