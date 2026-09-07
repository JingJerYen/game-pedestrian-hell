// 場景、光、道路佈局與路旁建築。
// 佈局（左到右）：【人行道】【迎面車道×N】【分隔島＋欄杆】【對向車道×N】
// 核心原則：玩家不動；main.ts 每幀給一個 dz（世界捲動量），這裡的東西照著捲。

import * as THREE from "three";
import { TUNING, colX, ROAD_RIGHT, BG_LEFT } from "./tuning";

const ROAD_LENGTH = 220; // 路面長度（夠長到看不見盡頭就好）
const DASH_SPACING = 6; // 車道虛線間距
const POST_SPACING = 4; // 分隔島欄杆間距
const BUILDING_SPACING = 14; // 路旁建築間距
const WRAP_Z = 30; // 捲過這個 Z 就繞回最遠處

export class World {
  readonly scene = new THREE.Scene();
  private readonly scrolling: THREE.Mesh[] = []; // 所有會捲動循環的東西

  constructor() {
    const t = TUNING;
    const LW = t.laneWidth;
    const roadLeft = -LW / 2; // 迎面車道左緣（人行道右緣）
    const bgRight = BG_LEFT + t.bgLanes * LW; // 對向車道右緣
    const sidewalkWidth = LW + 0.8;
    const sidewalkCenter = roadLeft - sidewalkWidth / 2;
    const roadZ = -ROAD_LENGTH / 2 + WRAP_Z;

    this.scene.background = new THREE.Color(0x87b5d9); // 天空
    this.scene.fog = new THREE.Fog(0x87b5d9, 60, 160); // 遠處霧化，遮住物件生成/消失

    // 光：一盞環境半球光 + 一盞太陽平行光
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-20, 30, -10);
    this.scene.add(sun);

    // 柏油路面（涵蓋迎面車道、分隔島底、對向車道）
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(bgRight - roadLeft, ROAD_LENGTH),
      new THREE.MeshLambertMaterial({ color: 0x3a3a3e }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.set((roadLeft + bgRight) / 2, 0, roadZ);
    this.scene.add(road);

    // 人行道（微微墊高的淺灰長條）
    const sidewalk = new THREE.Mesh(
      new THREE.BoxGeometry(sidewalkWidth, 0.08, ROAD_LENGTH),
      new THREE.MeshLambertMaterial({ color: 0x8b8b90 }),
    );
    sidewalk.position.set(sidewalkCenter, 0.04, roadZ);
    this.scene.add(sidewalk);

    // 分隔島（水泥座 + 綠色欄杆柱，欄杆柱會捲動循環）
    const medianCenter = (ROAD_RIGHT + BG_LEFT) / 2;
    const median = new THREE.Mesh(
      new THREE.BoxGeometry(t.medianWidth, 0.25, ROAD_LENGTH),
      new THREE.MeshLambertMaterial({ color: 0x9d9d95 }),
    );
    median.position.set(medianCenter, 0.125, roadZ);
    this.scene.add(median);

    const postGeo = new THREE.BoxGeometry(0.12, 0.85, 0.12);
    const postMat = new THREE.MeshLambertMaterial({ color: 0x2e8b57 });
    for (let i = 0; i < Math.ceil(ROAD_LENGTH / POST_SPACING); i++) {
      const post = new THREE.Mesh(postGeo, postMat);
      post.position.set(medianCenter, 0.25 + 0.425, WRAP_Z - i * POST_SPACING);
      this.scene.add(post);
      this.scrolling.push(post);
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

    // 路旁建築（隨機大小色塊，讓移動感更明顯）：左邊貼著人行道、右邊在對向車道外
    const buildingCount = Math.ceil(ROAD_LENGTH / BUILDING_SPACING);
    for (const side of [-1, 1] as const) {
      for (let i = 0; i < buildingCount; i++) {
        const w = 4 + Math.random() * 4;
        const h = 4 + Math.random() * 10;
        const x =
          side === -1
            ? sidewalkCenter - sidewalkWidth / 2 - 1.5 - w / 2
            : bgRight + 1.5 + w / 2;
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, 8),
          new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(Math.random(), 0.25, 0.55),
          }),
        );
        building.position.set(x, h / 2, WRAP_Z - i * BUILDING_SPACING);
        this.scene.add(building);
        this.scrolling.push(building);
      }
    }
  }

  // 每一幀把會捲動的東西推 dz；捲過頭就繞回另一端（前進後退都要能繞）
  update(dz: number): void {
    for (const mesh of this.scrolling) {
      mesh.position.z += dz;
      if (mesh.position.z > WRAP_Z) mesh.position.z -= ROAD_LENGTH;
      else if (mesh.position.z < WRAP_Z - ROAD_LENGTH) mesh.position.z += ROAD_LENGTH;
    }
  }
}
