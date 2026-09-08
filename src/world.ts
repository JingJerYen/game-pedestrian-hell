// 場景、光、道路佈局與路旁建築。
// 佈局（左到右）：【左人行道】【迎面車道×N】【雙黃線】【對向車道×N】【右人行道】
// 核心原則：玩家不動；main.ts 每幀給一個 dz（世界捲動量），這裡的東西照著捲。

import * as THREE from "three";
import { TUNING, colX, ROAD_RIGHT, BG_LEFT, BG_RIGHT, LAST_ROAD_COL } from "./tuning";
import { makeBuilding, makeSlowMark } from "./skins";

const ROAD_LENGTH = 220; // 路面長度（夠長到看不見盡頭就好）
const DASH_SPACING = 6; // 車道虛線間距
const BUILDING_SPACING = 14; // 路旁建築間距
const WRAP_Z = 30; // 捲過這個 Z 就繞回最遠處

export class World {
  readonly scene = new THREE.Scene();
  private readonly scrolling: THREE.Mesh[] = []; // 會捲動循環的東西（車道虛線）
  private readonly buildings: THREE.Mesh[] = []; // 建築另外管理：進路口範圍要隱藏
  private readonly slowMarks: THREE.Mesh[] = []; // 「慢」字：循環時換隨機車道

  constructor() {
    const t = TUNING;
    const LW = t.laneWidth;
    const roadLeft = -LW / 2; // 迎面車道左緣（左人行道右緣）
    const sidewalkWidth = LW + 0.8;
    const roadZ = -ROAD_LENGTH / 2 + WRAP_Z;

    this.scene.background = new THREE.Color(0x87b5d9); // 天空
    this.scene.fog = new THREE.Fog(0x87b5d9, 60, 160); // 遠處霧化，遮住物件生成/消失

    // 光：一盞環境半球光 + 一盞太陽平行光
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-20, 30, -10);
    this.scene.add(sun);

    // 柏油路面（迎面車道＋雙黃線區＋對向車道）
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(BG_RIGHT - roadLeft, ROAD_LENGTH),
      new THREE.MeshLambertMaterial({ color: 0x3a3a3e }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set((roadLeft + BG_RIGHT) / 2, 0, roadZ);
    this.scene.add(road);

    // 左右人行道（微微墊高的淺灰長條）
    const sidewalkGeo = new THREE.BoxGeometry(sidewalkWidth, 0.08, ROAD_LENGTH);
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x8b8b90 });
    for (const centerX of [
      roadLeft - sidewalkWidth / 2,
      BG_RIGHT + sidewalkWidth / 2,
    ]) {
      const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
      sidewalk.position.set(centerX, 0.04, roadZ);
      this.scene.add(sidewalk);
    }

    // 雙黃線（取代分隔島；行人可以直接跨越）
    const yellowGeo = new THREE.PlaneGeometry(0.1, ROAD_LENGTH);
    const yellowMat = new THREE.MeshBasicMaterial({ color: 0xd8b012 });
    const centerX = (ROAD_RIGHT + BG_LEFT) / 2;
    for (const offset of [-0.12, 0.12]) {
      const line = new THREE.Mesh(yellowGeo, yellowMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(centerX + offset, 0.012, roadZ);
      this.scene.add(line);
    }

    // 車道虛線（迎面車道之間 + 對向車道之間）
    const dashXs: number[] = [];
    for (let c = 2; c <= t.roadLanes; c++) dashXs.push(colX(c) - LW / 2);
    for (let i = 1; i < t.bgLanes; i++) dashXs.push(BG_LEFT + i * LW);
    const dashGeo = new THREE.PlaneGeometry(0.15, 2.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    for (const x of dashXs) {
      for (let i = 0; i < Math.ceil(ROAD_LENGTH / DASH_SPACING); i++) {
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.01, WRAP_Z - i * DASH_SPACING);
        this.scene.add(dash);
        this.scrolling.push(dash);
      }
    }

    // 路旁建築（外觀由 skins.ts 的 makeBuilding 決定）：兩側人行道外
    const buildingCount = Math.ceil(ROAD_LENGTH / BUILDING_SPACING);
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < buildingCount; i++) {
        const w = 4 + Math.random() * 4;
        const h = 4 + Math.random() * 10;
        const x =
          side === -1
            ? roadLeft - sidewalkWidth - 1.5 - w / 2
            : BG_RIGHT + sidewalkWidth + 1.5 + w / 2;
        const building = makeBuilding(w, h, 8);
        building.position.set(x, h / 2, WRAP_Z - i * BUILDING_SPACING);
        this.scene.add(building);
        this.buildings.push(building);
      }
    }

    // 路面「慢」字（裝飾）：幾個循環使用，繞回遠處時換一條隨機車道
    for (let i = 0; i < t.slowMarkCount; i++) {
      const mark = makeSlowMark();
      mark.position.x = this.randomLaneX();
      mark.position.z = WRAP_Z - Math.random() * ROAD_LENGTH;
      this.scene.add(mark);
      this.slowMarks.push(mark);
    }
  }

  private randomLaneX(): number {
    return colX(1 + Math.floor(Math.random() * LAST_ROAD_COL));
  }

  // 每一幀把會捲動的東西推 dz；捲過頭就繞回另一端（前進後退都要能繞）。
  // intersectionCenters：目前路口的中心 Z——建築和「慢」字跟路口重疊時要隱藏
  // （切換發生在遠處的霧裡，玩家看不到跳變）。
  // destinationZone：目的地建築佔的位置——同側的一般建築讓位隱藏。
  update(
    dz: number,
    intersectionCenters: readonly number[],
    destinationZone: { z: number; side: "left" | "right"; margin: number } | null,
  ): void {
    const zoneHalf = TUNING.intersection.roadDepth / 2;
    const wrap = (mesh: THREE.Mesh): boolean => {
      mesh.position.z += dz;
      if (mesh.position.z > WRAP_Z) {
        mesh.position.z -= ROAD_LENGTH;
        return true;
      }
      if (mesh.position.z < WRAP_Z - ROAD_LENGTH) {
        mesh.position.z += ROAD_LENGTH;
        return true;
      }
      return false;
    };
    const nearZone = (z: number, margin: number) =>
      intersectionCenters.some((c) => Math.abs(z - c) < zoneHalf + margin);

    for (const mesh of this.scrolling) wrap(mesh);
    for (const building of this.buildings) {
      wrap(building);
      const side = building.position.x < 0 ? "left" : "right";
      const yieldToDestination =
        destinationZone !== null &&
        destinationZone.side === side &&
        Math.abs(building.position.z - destinationZone.z) <
          destinationZone.margin + 4;
      building.visible =
        !nearZone(building.position.z, 5) && !yieldToDestination; // 建築縱深 8 的一半 + 緩衝
    }
    for (const mark of this.slowMarks) {
      if (wrap(mark)) mark.position.x = this.randomLaneX();
      mark.visible = !nearZone(mark.position.z, 2.5);
    }
  }
}
