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
import { makeParkingPavement } from "./skins";
import { makeVehicleMesh } from "./vehicleskins";
import { ROAD_LEFT, BG_RIGHT } from "./tuning";

interface Obstacle {
  mesh: THREE.Object3D; // 外觀（3D 模型或方塊）；原點＝碰撞箱中心
  size: Size3;
  col: number; // 0 / RIGHT_SIDEWALK_COL = 人行道；1 / LAST_ROAD_COL = 路邊車道
}

// 停車格路段的「鋪面」：純裝飾、不擋人（擋人的是格子裡的機車堆，在 list 裡）
interface Pavement {
  mesh: THREE.Object3D;
  halfLen: number;
  col: number;
}

const SIDEWALK_COLORS = [0x6b6b70, 0x8a7a5c, 0x5c7a8a]; // 之後換成違停機車/攤販 sprite
const PARKED_CAR_COLORS = [0x9aa3ad, 0x7d8a99, 0xb0a08c];

export class Obstacles {
  private readonly list: Obstacle[] = [];
  private readonly pavements: Pavement[] = [];
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
    for (let i = this.pavements.length - 1; i >= 0; i--) {
      const p = this.pavements[i];
      p.mesh.position.z += dz;
      if (p.mesh.position.z - p.halfLen > 30) {
        this.scene.remove(p.mesh);
        this.pavements.splice(i, 1);
      }
    }
    if (maxDist >= this.nextSpawnAt) {
      // 生成點撞到路口就先跳過，過幾公尺再試（路口範圍內不放路障）
      if (intersections.nearZone(-TUNING.obstacleSpawnZ, 10)) {
        this.nextSpawnAt = maxDist + 5;
        return;
      }
      const extraGap = this.spawn(level);
      this.nextSpawnAt =
        maxDist +
        extraGap +
        THREE.MathUtils.lerp(level.obstacleGapMin, level.obstacleGapMax, Math.random());
    }
  }

  // 回傳這次生成額外吃掉的縱深（停車格路段比較長，下一個路障要多讓開一點）
  private spawn(level: LevelConfig): number {
    const t = TUNING;
    if (Math.random() < level.obstacleRoadChance) {
      // 違停車：左右兩側靠人行道的路邊車道，車頭順著該側車流方向
      const col = Math.random() < 0.5 ? 1 : LAST_ROAD_COL;
      this.addParkedCar(
        col,
        colX(col),
        -t.obstacleSpawnZ,
        t.vehicles.car.size,
        col === 1 ? 0 : Math.PI,
      );
      return 0;
    }
    // 人行道：單顆路障，或整段停車格路段（半邊換成停車格鋪面）
    const col = Math.random() < 0.5 ? 0 : RIGHT_SIDEWALK_COL;
    if (Math.random() < t.parking.chance) return this.spawnParking(col);
    this.addBlock(
      col,
      colX(col),
      -t.obstacleSpawnZ,
      t.sidewalkObstacleSize,
      SIDEWALK_COLORS[Math.floor(Math.random() * SIDEWALK_COLORS.length)],
    );
    return 0;
  }

  // 停車格路段：人行道「靠馬路那半邊」換成停車格條（機車格瘦窄／汽車格長條），
  // 剩下靠建築那邊仍是走道。每一格獨立擲骰決定有沒有停車，車輛貼齊格子。
  private spawnParking(col: number): number {
    const t = TUNING;
    const kind: "scooter" | "car" =
      Math.random() < t.parking.carChance ? "car" : "scooter";
    const p = t.parking.types[kind];
    const stalls =
      p.stallsMin + Math.floor(Math.random() * (p.stallsMax - p.stallsMin + 1));
    const len = stalls * p.stallDepth;
    const centerZ = -t.obstacleSpawnZ;
    // 停車格條貼齊人行道靠馬路的內緣
    const stripX =
      col === 0 ? ROAD_LEFT - p.stripWidth / 2 : BG_RIGHT + p.stripWidth / 2;

    const pavement = makeParkingPavement(kind, stalls, p.stallDepth, p.stripWidth);
    pavement.position.set(stripX, 0, centerZ);
    this.scene.add(pavement);
    this.pavements.push({ mesh: pavement, halfLen: len / 2, col });

    for (let i = 0; i < stalls; i++) {
      if (Math.random() >= p.occupancy) continue;
      const stallZ = centerZ - len / 2 + (i + 0.5) * p.stallDepth;
      if (kind === "car") {
        // 停車格汽車：Kenney 模型，車頭隨機朝前朝後（路邊停車的日常）
        this.addParkedCar(
          col,
          stripX,
          stallZ,
          p.blockSize,
          Math.random() < 0.5 ? 0 : Math.PI,
        );
      } else {
        // 機車格：維持方塊，等二輪模型到位再換
        this.addBlock(
          col,
          stripX,
          stallZ,
          p.blockSize,
          SIDEWALK_COLORS[Math.floor(Math.random() * SIDEWALK_COLORS.length)],
        );
      }
    }
    return len / 2;
  }

  // 停放的汽車：走跟車流同一套外觀管線（Kenney 模型，缺模型退回色塊）
  private addParkedCar(
    col: number,
    x: number,
    z: number,
    size: Size3,
    rotationY: number,
  ): void {
    const color =
      PARKED_CAR_COLORS[Math.floor(Math.random() * PARKED_CAR_COLORS.length)];
    const mesh = makeVehicleMesh("car", color);
    mesh.position.set(x, size.y / 2, z);
    mesh.rotation.y = rotationY;
    this.scene.add(mesh);
    this.list.push({ mesh, size, col });
  }

  private addBlock(
    col: number,
    x: number,
    z: number,
    size: Size3,
    color: number,
  ): void {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(size.x, size.y, size.z),
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, size.y / 2, z);
    this.scene.add(mesh);
    this.list.push({ mesh, size, col });
  }

  // world.ts 用：停車格路段的位置（該處的「人行道」字要隱藏）
  parkingZones(): { z: number; side: "left" | "right"; halfLen: number }[] {
    return this.pavements.map((p) => ({
      z: p.mesh.position.z,
      side: p.col === 0 ? "left" : "right",
      halfLen: p.halfLen,
    }));
  }

  // 路口生成時清掉跟它重疊的路障與停車格鋪面（先生成的擋在後生成的路口上時用）
  removeNear(z: number, margin: number): void {
    for (let i = this.list.length - 1; i >= 0; i--) {
      const o = this.list[i];
      if (Math.abs(o.mesh.position.z - z) < margin + o.size.z / 2) {
        this.scene.remove(o.mesh);
        this.list.splice(i, 1);
      }
    }
    for (let i = this.pavements.length - 1; i >= 0; i--) {
      const p = this.pavements[i];
      if (Math.abs(p.mesh.position.z - z) < margin + p.halfLen) {
        this.scene.remove(p.mesh);
        this.pavements.splice(i, 1);
      }
    }
  }

  // 前方（或後退時後方）有路障就把這一幀的捲動量夾住，讓玩家貼著路障停下
  // （用 obstacleBlockShrink：貼齊視覺，不然玩家會半個身體陷進路障）
  clampScroll(playerPos: THREE.Vector3, playerSize: Size3, dz: number): number {
    const s = TUNING.obstacleBlockShrink;
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

  // 車輛避讓用：這條 x 附近、「行進方向」前方 range 公尺內有沒有路障。
  // travelDir：+1 = 往 +Z 開（迎面車/迎面腳踏車）、-1 = 往 -Z 開（同向）。
  // 把路障當成一段區間看：要「完全超過尾端＋2 公尺餘裕」才算過了——
  // 不然繞到一半就切回來，會從長路障（機車停車格）的後半段穿過去。
  hasObstacleAhead(x: number, z: number, range: number, travelDir: 1 | -1): boolean {
    return this.list.some((o) => {
      if (Math.abs(o.mesh.position.x - x) >= 1.2) return false;
      const centerAhead = (o.mesh.position.z - z) * travelDir;
      const half = o.size.z / 2;
      return centerAhead + half > -2 && centerAhead - half < range;
    });
  }

  // 玩家想橫移到的位置會不會撞進路障（同樣貼齊視覺）
  blocksAt(pos: THREE.Vector3, size: Size3): boolean {
    return this.list.some((o) =>
      aabbHit(pos, size, o.mesh.position, o.size, TUNING.obstacleBlockShrink),
    );
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
    for (const p of this.pavements) this.scene.remove(p.mesh);
    this.pavements.length = 0;
    this.nextSpawnAt = 10;
  }
}
