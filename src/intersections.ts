// 路口：一條橫向小路打斷主路。永遠綠燈、橫向路本身沒有車；
// 唯一的威脅是路邊車道的車在這裡右轉、掃過斑馬線（轉彎邏輯在 traffic.ts）。
// 斑馬線都是視覺裝飾，不影響任何判定。

import * as THREE from "three";
import {
  TUNING,
  colX,
  ROAD_LEFT,
  ROAD_RIGHT,
  BG_LEFT,
  BG_RIGHT,
  RIGHT_SIDEWALK_COL,
  WALK_MIN_X,
  WALK_MAX_X,
  type LevelConfig,
} from "./tuning";
import {
  makeZebraAcross,
  makeZebraForward,
  makeTrafficLight,
  makeScooterBox,
  makeStopLine,
} from "./skins";

// 共用幾何與材質（每個路口只是重複引用，生成/移除都很便宜）
const ASPHALT = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
const SIDE_ROAD_GEO = new THREE.PlaneGeometry(
  WALK_MAX_X - WALK_MIN_X + 40,
  TUNING.intersection.roadDepth,
);

export class Intersections {
  private readonly list: THREE.Group[] = [];
  private nextAt: number = TUNING.intersection.firstAt;

  constructor(private readonly scene: THREE.Scene) {}

  // onSpawn：路口生成時回呼（main.ts 用它清掉撞到路口的路障）
  update(
    dz: number,
    maxDist: number,
    level: LevelConfig,
    onSpawn: (centerZ: number) => void,
  ): void {
    const t = TUNING.intersection;
    for (let i = this.list.length - 1; i >= 0; i--) {
      const group = this.list[i];
      group.position.z += dz;
      if (group.position.z > 60) {
        this.scene.remove(group);
        this.list.splice(i, 1);
      }
    }
    if (maxDist >= this.nextAt) {
      this.spawnAt(-t.spawnZ);
      onSpawn(-t.spawnZ);
      const min = level.intersectionEveryMin ?? t.everyMin;
      const max = level.intersectionEveryMax ?? t.everyMax;
      this.nextAt = maxDist + min + Math.random() * (max - min);
    }
  }

  private spawnAt(z: number): void {
    const depth = TUNING.intersection.roadDepth;
    const group = new THREE.Group();

    // 橫向小路（墊高一點蓋過人行道與標線，視覺上就是「路被打斷」）
    const sideRoad = new THREE.Mesh(SIDE_ROAD_GEO, ASPHALT);
    sideRoad.rotation.x = -Math.PI / 2;
    sideRoad.position.set((WALK_MIN_X + WALK_MAX_X) / 2, 0.1, 0);
    group.add(sideRoad);

    // 橫越主路的斑馬線：路口近側、遠側各一條，
    // 和左右兩條縱向的合起來是台灣路口常見的「口」字型
    const roadLeft = colX(1) - TUNING.laneWidth / 2;
    for (const zOffset of [-(depth / 2 - 1.6), depth / 2 - 1.6]) {
      const zebra = makeZebraAcross(roadLeft, BG_RIGHT);
      zebra.position.z = zOffset;
      group.add(zebra);
    }

    // 行人直行的斑馬線（左右人行道的延伸段，右轉車就是掃這裡）
    for (const x of [colX(0), colX(RIGHT_SIDEWALK_COL)]) {
      group.add(makeZebraForward(x, depth));
    }

    // 行人紅綠燈（永遠綠燈）：立在路口「對面」兩角——過馬路時正對著你，
    // 跟現實一樣（行人燈在你要走去的那一頭）
    for (const x of [WALK_MIN_X - 0.6, WALK_MAX_X + 0.6]) {
      const light = makeTrafficLight();
      light.position.set(x, 0, -(depth / 2 + 0.6));
      group.add(light);
    }

    // 機車停等區＋停止線：依台灣法規，從車的方向看是
    // 停止線 → 機車停等區 → 斑馬線 → 路口（機車排在汽車前面等）。
    // 迎面車從遠方(-Z)來 → 畫在遠側，停等區的字轉 180 度給它們讀；
    // 同向車從你背後(+Z)來 → 畫在近側。
    const boxDepth = 2.4; // 停等區縱深
    const boxZ = depth / 2 + 1.5; // 停等區中心離路口邊緣多遠（在斑馬線之外的主路面上）
    const stopLineZ = boxZ + boxDepth / 2 + 0.7; // 停止線在停等區後方
    for (const side of [-1, 1] as const) {
      // side = -1 迎面（遠側）、+1 同向（近側）
      const left = side === -1 ? ROAD_LEFT : BG_LEFT;
      const right = side === -1 ? ROAD_RIGHT : BG_RIGHT;
      const box = makeScooterBox(right - left, boxDepth);
      box.position.set((left + right) / 2, 0, side * boxZ);
      if (side === -1) box.rotation.y = Math.PI;
      group.add(box);
      const stopLine = makeStopLine(right - left);
      stopLine.position.x = (left + right) / 2; // y 已在 factory 裡墊高，別蓋掉
      stopLine.position.z = side * stopLineZ;
      group.add(stopLine);
    }

    group.position.z = z;
    this.scene.add(group);
    this.list.push(group);
  }

  // 目前所有路口的中心 Z（traffic 判斷「到路口了沒」用）
  centers(): number[] {
    return this.list.map((g) => g.position.z);
  }

  // z 是否落在任何路口範圍內（外加 margin）
  nearZone(z: number, margin: number): boolean {
    const half = TUNING.intersection.roadDepth / 2 + margin;
    return this.list.some((g) => Math.abs(g.position.z - z) < half);
  }

  get count(): number {
    return this.list.length;
  }

  reset(): void {
    for (const group of this.list) this.scene.remove(group);
    this.list.length = 0;
    this.nextAt = TUNING.intersection.firstAt;
  }
}
