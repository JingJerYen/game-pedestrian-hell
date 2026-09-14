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
import { blockedBy, clampScrollBy, type Blocker, type Size3 } from "./collision";
import type { Intersections } from "./intersections";
import { makeParkingPavement } from "./skins";
import { makeVehicleMesh, makePropMesh } from "./vehicleskins";
import { ROAD_LEFT, BG_RIGHT, WALK_MIN_X, WALK_MAX_X, LAYOUT } from "./tuning";

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

const PROP_FALLBACK_COLOR = 0x6b6b70; // 道具模型還沒載好時的色塊色
const PARKED_CAR_COLORS = [0x9aa3ad, 0x7d8a99, 0xb0a08c];

// 一段停車格路段的規格（先抽好再排程，才能算出跟上一段之間要留多少空隙）
interface ParkingPlan {
  kind: "scooter" | "car";
  stalls: number;
  len: number; // = stalls × stallDepth
}

function rollParkingPlan(): ParkingPlan {
  const t = TUNING.parking;
  const kind: "scooter" | "car" = Math.random() < t.carChance ? "car" : "scooter";
  const p = t.types[kind];
  const stalls = p.stallsMin + Math.floor(Math.random() * (p.stallsMax - p.stallsMin + 1));
  return { kind, stalls, len: stalls * p.stallDepth };
}

// asphalt 側：一段長 len 的停車格後面要留多長的空隙（依覆蓋率反推，再隨機浮動）
function gapAfter(len: number): number {
  const t = TUNING.parking;
  const coverage = Math.min(Math.max(t.asphaltCoverage, 0.05), 1);
  const jitter = 1 + (Math.random() * 2 - 1) * t.asphaltGapJitter;
  return len * (1 / coverage - 1) * Math.max(jitter, 0);
}

// asphalt 側連續鋪停車格用：每一側自己的排程狀態
interface AsphaltSide {
  col: number;
  nextAt: number; // 走到第幾公尺鋪下一段
  plan: ParkingPlan; // 下一段長什麼樣（已抽好）
}

// 從 tuning.sidewalkProps 依 weight 抽一款道具
function pickProp(): { name: string; size: Size3 } {
  const entries = Object.entries(TUNING.sidewalkProps);
  let r = Math.random() * entries.reduce((sum, [, p]) => sum + p.weight, 0);
  for (const [name, p] of entries) {
    r -= p.weight;
    if (r <= 0) return { name, size: p.size };
  }
  const [name, p] = entries[entries.length - 1];
  return { name, size: p.size };
}

export class Obstacles {
  private readonly list: Obstacle[] = [];
  private readonly pavements: Pavement[] = [];
  private nextSpawnAt = 10; // 走到第幾公尺會出現下一個路障（normal 側路障池／路邊違停）
  // asphalt 側的連續停車格排程（每關 reset 時依 LAYOUT 重建；normal / none 側不在裡面）
  private asphalt: AsphaltSide[] = [];

  constructor(private readonly scene: THREE.Scene) {}

  // dz = 這一幀世界捲了多少；maxDist = 本關最遠走到幾公尺（用它排程生成）；
  // occupied(x0, x1, z0, z1) = 這塊區域現在有沒有車（main 接到 traffic）——
  // 有的話這次不生，過一公尺再試，不然路障會直接砸在車或腳踏車身上
  update(
    dz: number,
    maxDist: number,
    level: LevelConfig,
    intersections: Intersections,
    occupied: (x0: number, x1: number, z0: number, z1: number) => boolean,
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
    this.updatePool(maxDist, level, intersections, occupied);
    this.updateAsphalt(maxDist, intersections, occupied);
  }

  // 一般路障池：路邊違停，或 normal 側人行道的單顆路障／停車格路段（依關卡的間距排程）
  private updatePool(
    maxDist: number,
    level: LevelConfig,
    intersections: Intersections,
    occupied: (x0: number, x1: number, z0: number, z1: number) => boolean,
  ): void {
    if (maxDist < this.nextSpawnAt) return;
    // 生成點撞到路口就先跳過，過幾公尺再試（路口範圍內不放路障）
    if (intersections.nearZone(-TUNING.obstacleSpawnZ, 10)) {
      this.nextSpawnAt = maxDist + 5;
      return;
    }
    const r = this.spawn(level, occupied);
    if (!r.ok) {
      this.nextSpawnAt = maxDist + r.retryAfter; // 生成點有車 / 空隙不夠：等一下再試
      return;
    }
    this.nextSpawnAt =
      maxDist +
      r.extraGap +
      THREE.MathUtils.lerp(level.obstacleGapMin, level.obstacleGapMax, Math.random());
  }

  // asphalt 側：停車格一段接一段鋪。每側各自排程，段與段之間的空隙由
  // TUNING.parking.asphaltCoverage 決定（空隙 = 下一段長度 × (1/覆蓋率 − 1)，再隨機浮動），
  // 長期下來停車格佔整條人行道的長度比例就會落在覆蓋率附近
  private updateAsphalt(
    maxDist: number,
    intersections: Intersections,
    occupied: (x0: number, x1: number, z0: number, z1: number) => boolean,
  ): void {
    const t = TUNING.parking;
    const zs = -TUNING.obstacleSpawnZ; // 這段的中心（z 越負越前面）
    const ixHalf = TUNING.intersection.roadDepth / 2 + t.asphaltIntersectionMargin;
    for (const a of this.asphalt) {
      if (maxDist < a.nextAt) continue;
      let plan = a.plan;
      const back = zs + plan.len / 2; // 這段的後緣（靠玩家那頭）——裁短時後緣不動、只縮前緣
      // 跟路口重疊？skipDist = 整段要往前挪多少才會完全過了路口；
      // fitLen = 後緣不動、只裁短的話最多能留多長（路口在前方才有可能 > 0）
      let skipDist = 0;
      let fitLen = Infinity;
      for (const zc of intersections.centers()) {
        const overlaps = zc + ixHalf > zs - plan.len / 2 && zc - ixHalf < back;
        if (!overlaps) continue;
        skipDist = Math.max(skipDist, back + ixHalf - zc);
        fitLen = Math.min(fitLen, back - (zc + ixHalf));
      }
      let centerZ = zs;
      if (skipDist > 0) {
        // 裁短塞進路口前：汽車格塞不下就改試機車格（格子淺，比較塞得進零碎空位）
        const fitted = this.fitPlan(plan.kind, fitLen) ?? (plan.kind === "car" ? this.fitPlan("scooter", fitLen) : null);
        if (!fitted) {
          a.nextAt = maxDist + skipDist; // 塞不下：整段挪到路口另一邊
          continue;
        }
        plan = fitted;
        centerZ = back - plan.len / 2;
      }
      const r = this.spawnParking(a.col, plan, occupied, centerZ);
      if (!r.ok) {
        a.nextAt = maxDist + r.retryAfter;
        continue;
      }
      const gap = gapAfter(plan.len);
      a.plan = rollParkingPlan();
      // 這段後緣在 maxDist + back 對應的位置；下一段中心 = 後緣 + 空隙 + 下一段前半
      a.nextAt = maxDist + (back - zs) + gap + a.plan.len / 2;
    }
  }

  // 開場預鋪：從出發點前方 asphaltPrefillFrom 公尺起一段接一段鋪到路障生成點，
  // 之後由 updateAsphalt 接手。不看路口（第一個路口在 firstAt + spawnZ 公尺處，遠在生成點之外；
  // 而且 main 是先 reset 路障再 reset 路口，此時路口清單還是上一關的）
  private prefillAsphalt(a: AsphaltSide): void {
    const t = TUNING;
    let back = -t.parking.asphaltPrefillFrom; // 下一段的後緣（z）
    for (;;) {
      const centerZ = back - a.plan.len / 2;
      if (centerZ < -t.obstacleSpawnZ) break; // 到生成點了：剩下交給 updateAsphalt
      const r = this.spawnParking(a.col, a.plan, () => false, centerZ);
      if (!r.ok) break; // 開場沒車、沒別的路障，理論上不會失敗
      back = centerZ - a.plan.len / 2 - gapAfter(a.plan.len);
      a.plan = rollParkingPlan();
    }
    // 下一段中心要走到生成點（z = −obstacleSpawnZ）才鋪：算它現在離生成點多遠
    a.nextAt = Math.max(0, -(back - a.plan.len / 2) - t.obstacleSpawnZ);
  }

  // 長度 fitLen 的空位最多能鋪幾格 kind 停車格；不到 asphaltFitMinStalls 就回 null
  private fitPlan(kind: "scooter" | "car", fitLen: number): ParkingPlan | null {
    const t = TUNING.parking;
    const p = t.types[kind];
    const stalls = Math.min(p.stallsMax, Math.floor(fitLen / p.stallDepth));
    if (stalls < t.asphaltFitMinStalls[kind]) return null;
    return { kind, stalls, len: stalls * p.stallDepth };
  }

  // ok = 生成了，extraGap = 這次額外吃掉的縱深（停車格路段比較長，下一個路障要多讓開一點）；
  // 不 ok = 什麼都沒生，retryAfter = 再走幾公尺後重試
  private spawn(
    level: LevelConfig,
    occupied: (x0: number, x1: number, z0: number, z1: number) => boolean,
  ): { ok: true; extraGap: number } | { ok: false; retryAfter: number } {
    const t = TUNING;
    const z = -t.obstacleSpawnZ;
    // 違停車：左右兩側靠人行道的路邊車道，車頭順著該側車流方向。
    // 只放在「該側至少兩線」的路邊車道——只有一線的話違停會把整條路堵死
    const roadCols: number[] = [];
    if (t.roadLanes >= 2) roadCols.push(1);
    if (t.bgLanes >= 2) roadCols.push(LAST_ROAD_COL);
    if (roadCols.length > 0 && Math.random() < level.obstacleRoadChance) {
      const col = roadCols[Math.floor(Math.random() * roadCols.length)];
      const halfLen = t.vehicles.car.size.z / 2;
      const blocked = this.canPlace(col, halfLen, occupied);
      if (blocked) return blocked;
      this.addParkedCar(col, colX(col), z, t.vehicles.car.size, col === 1 ? 0 : Math.PI);
      return { ok: true, extraGap: 0 };
    }
    // 人行道：單顆路障，或整段停車格路段（半邊換成停車格鋪面）。
    // 只挑 normal 綠鋪面那側（asphalt 側由 updateAsphalt 自己連續鋪停車格；none 側沒有人行道）；
    // 兩側都不是 normal 就這輪不生
    const sides: number[] = [];
    if (LAYOUT.left === "normal") sides.push(0);
    if (LAYOUT.right === "normal") sides.push(RIGHT_SIDEWALK_COL);
    if (sides.length === 0) return { ok: false, retryAfter: 4 };
    const col = sides[Math.floor(Math.random() * sides.length)];
    if (Math.random() < t.parking.chance) return this.spawnParking(col, rollParkingPlan(), occupied);
    if (Math.random() < t.sidewalkScooterChance) {
      // 路障池：一台亂停在人行道上的 Gogoro——沿路停（只擋半邊，繞得過）或橫停（擋住整條）
      const b = t.parking.types.scooter.blockSize; // x 長 z 窄 = 橫停
      const across = Math.random() < 0.5;
      const size: Size3 = across ? b : { x: b.z, y: b.y, z: b.x };
      const blocked = this.canPlace(col, size.z / 2, occupied);
      if (blocked) return blocked;
      const rot = across
        ? (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2)
        : Math.random() < 0.5 ? 0 : Math.PI;
      this.addParkedScooter(col, colX(col), z, size, rot);
      return { ok: true, extraGap: 0 };
    }
    // 道具模型（變電箱…）：依 weight 抽一款；轉 90° 讓寬邊沿著路，所以碰撞箱的 x/z 對調
    const prop = pickProp();
    const size: Size3 = { x: prop.size.z, y: prop.size.y, z: prop.size.x };
    const blocked = this.canPlace(col, size.z / 2, occupied);
    if (blocked) return blocked;
    this.addProp(col, colX(col), z, prop.name, size, (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2));
    return { ok: true, extraGap: 0 };
  }

  // 這一欄、以生成點為中心 ±halfLen 的路障現在能不能放：
  // 有車在那 → 過 1 公尺再試；跟上一個路障是同側的「人行道 ↔ 違停」組合而空隙不夠
  // → 等到空隙夠再試。可以放就回傳 null
  private canPlace(
    col: number,
    halfLen: number,
    occupied: (x0: number, x1: number, z0: number, z1: number) => boolean,
    z = -TUNING.obstacleSpawnZ,
  ): { ok: false; retryAfter: number } | null {
    if (this.colOccupied(col, z, halfLen, occupied)) return { ok: false, retryAfter: 1 };
    // 跟現存路障的關係：同一欄不能疊在一起；同一側「人行道 ↔ 違停」要留 passGap
    // （停車格路段很長，以中心點生成時前半段會伸進上一個路障的位置，所以要逐一檢查）
    const isSidewalk = (c: number) => c === 0 || c === RIGHT_SIDEWALK_COL;
    let need = 0;
    for (const o of this.list) {
      const sameSide = (o.col <= 1) === (col <= 1);
      if (!sameSide) continue;
      const gap = o.mesh.position.z - o.size.z / 2 - (z + halfLen);
      const want =
        o.col === col ? 0.5 : isSidewalk(o.col) !== isSidewalk(col) ? TUNING.bike.passGap : 0;
      need = Math.max(need, want - gap);
    }
    return need > 0 ? { ok: false, retryAfter: need } : null;
  }

  // 這一欄、z 前後 halfLen（外加餘裕）的範圍內有沒有車
  private colOccupied(
    col: number,
    z: number,
    halfLen: number,
    occupied: (x0: number, x1: number, z0: number, z1: number) => boolean,
  ): boolean {
    const half = TUNING.laneWidth / 2;
    let x0: number, x1: number;
    if (col === 0) [x0, x1] = [WALK_MIN_X, ROAD_LEFT];
    else if (col === RIGHT_SIDEWALK_COL) [x0, x1] = [BG_RIGHT, WALK_MAX_X];
    else [x0, x1] = [colX(col) - half, colX(col) + half];
    const m = TUNING.obstacleSpawnMargin;
    return occupied(x0 - m.x, x1 + m.x, z - halfLen - m.z, z + halfLen + m.z);
  }

  // 停車格路段：人行道「靠馬路那半邊」換成停車格條（機車格瘦窄／汽車格長條），
  // 剩下靠建築那邊仍是走道。每一格獨立擲骰決定有沒有停車，車輛貼齊格子。
  private spawnParking(
    col: number,
    plan: ParkingPlan,
    occupied: (x0: number, x1: number, z0: number, z1: number) => boolean,
    centerZ = -TUNING.obstacleSpawnZ, // asphalt 側裁短塞路口前時會往玩家這頭挪
  ): { ok: true; extraGap: number } | { ok: false; retryAfter: number } {
    const t = TUNING;
    const { kind, stalls, len } = plan;
    const p = t.parking.types[kind];
    const blocked = this.canPlace(col, len / 2, occupied, centerZ);
    if (blocked) return blocked;
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
        // 停車格汽車：Kenney 模型，車頭隨機朝前朝後（路邊停車的日常）。
        // 貼著停車格靠建築那側的邊緣停（差 edgeGap），縫留在靠馬路那側
        const b = t.parking.types.car.blockSize;
        const gap = t.parking.types.car.edgeGap + b.x / 2;
        const carX = col === 0 ? ROAD_LEFT - p.stripWidth + gap : BG_RIGHT + p.stripWidth - gap;
        this.addParkedCar(
          col,
          carX,
          stallZ,
          p.blockSize,
          Math.random() < 0.5 ? 0 : Math.PI,
        );
      } else {
        // 機車格：一格一台橫停的 Gogoro（車頭隨機朝建築或朝馬路），缺模型時退回色塊
        this.addParkedScooter(
          col,
          stripX,
          stallZ,
          p.blockSize,
          (Math.random() < 0.5 ? 1 : -1) * (Math.PI / 2),
        );
      }
    }
    return { ok: true, extraGap: len / 2 };
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

  // 停放的機車：模型車頭朝 +Z，rotationY = ±90° 橫停（碰撞箱 x 長 z 窄）、0/180° 沿路停
  private addParkedScooter(col: number, x: number, z: number, size: Size3, rotationY: number): void {
    const mesh = makeVehicleMesh("parkedScooter", 0xdddddd); // 缺模型時是淺灰色塊
    mesh.position.set(x, size.y / 2, z);
    mesh.rotation.y = rotationY;
    this.scene.add(mesh);
    this.list.push({ mesh, size, col });
  }

  // 人行道道具：模型正面朝 +Z，rotationY = ±90° 讓寬邊沿路（size 已是轉過之後的碰撞箱）
  private addProp(col: number, x: number, z: number, name: string, size: Size3, rotationY: number): void {
    const mesh = makePropMesh(name, PROP_FALLBACK_COLOR);
    mesh.position.set(x, size.y / 2, z);
    mesh.rotation.y = rotationY;
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
    return clampScrollBy(this.blockers(), playerPos, playerSize, dz, TUNING.obstacleBlockShrink);
  }

  // 路障當成「擋住玩家的方塊」清單（演算法在 collision.ts，跟騎樓柱子共用）
  private blockers(): Blocker[] {
    return this.list.map((o) => ({ pos: o.mesh.position, size: o.size }));
  }

  // 車輛避讓用：x 這條線上、「行進方向」前方 range 公尺內有沒有路障。
  // halfWidth = 來問的那台車的半寬（含餘裕）：橫向要「兩個半寬加起來」以內才算擋到，
  // 腳踏車偏到人行道邊緣時才不會漏判、直接騎進停車格。
  // travelDir：+1 = 往 +Z 開（迎面車/左側腳踏車）、-1 = 往 -Z 開（同向）。
  // 把路障當成一段區間看：要「完全超過尾端＋2 公尺餘裕」才算過了——
  // 不然繞到一半就切回來，會從長路障（機車停車格）的後半段穿過去。
  hasObstacleAhead(
    x: number,
    halfWidth: number,
    z: number,
    range: number,
    travelDir: 1 | -1,
  ): boolean {
    return this.list.some((o) => {
      if (Math.abs(o.mesh.position.x - x) >= halfWidth + o.size.x / 2) return false;
      const centerAhead = (o.mesh.position.z - z) * travelDir;
      const half = o.size.z / 2;
      return centerAhead + half > -2 && centerAhead - half < range;
    });
  }

  // 玩家想橫移到的位置會不會撞進路障（同樣貼齊視覺）
  blocksAt(pos: THREE.Vector3, size: Size3): boolean {
    return blockedBy(this.blockers(), pos, size, TUNING.obstacleBlockShrink);
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
    // 依這關的 LAYOUT 決定哪幾側要連續鋪停車格（main 先設好 LAYOUT 再呼叫 reset）
    this.asphalt = [];
    if (LAYOUT.left === "asphalt")
      this.asphalt.push({ col: 0, nextAt: 0, plan: rollParkingPlan() });
    if (LAYOUT.right === "asphalt")
      this.asphalt.push({ col: RIGHT_SIDEWALK_COL, nextAt: 0, plan: rollParkingPlan() });
    for (const a of this.asphalt) this.prefillAsphalt(a);
  }
}
