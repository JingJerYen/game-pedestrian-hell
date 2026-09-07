// 場景、光、路面、車道線與路旁建築。
// 核心原則：玩家不動，是這裡的東西往 +Z（鏡頭方向）捲動。

import * as THREE from "three";
import { TUNING } from "./tuning";

const ROAD_LENGTH = 220; // 路面長度（夠長到看不見盡頭就好）
const DASH_SPACING = 6; // 車道虛線的間距
const BUILDING_SPACING = 14; // 路旁建築的間距

export class World {
  readonly scene = new THREE.Scene();
  private readonly dashes: THREE.Mesh[] = [];
  private readonly buildings: THREE.Mesh[] = [];

  constructor() {
    const { laneCount, laneWidth } = TUNING;
    const roadWidth = laneCount * laneWidth;

    this.scene.background = new THREE.Color(0x87b5d9); // 天空
    this.scene.fog = new THREE.Fog(0x87b5d9, 60, 160); // 遠處霧化，遮住物件生成/消失

    // 光：一盞環境半球光 + 一盞太陽平行光
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-20, 30, -10);
    this.scene.add(sun);

    // 柏油路面
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(roadWidth, ROAD_LENGTH),
      new THREE.MeshLambertMaterial({ color: 0x3a3a3e }),
    );
    road.rotation.x = -Math.PI / 2;
    road.position.z = -ROAD_LENGTH / 2 + 30;
    this.scene.add(road);

    // 路面兩側的「人行道」（淺灰）——台灣哏：人行道存在，但你走不了
    const sidewalkGeo = new THREE.PlaneGeometry(3, ROAD_LENGTH);
    const sidewalkMat = new THREE.MeshLambertMaterial({ color: 0x8b8b90 });
    for (const side of [-1, 1]) {
      const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMat);
      sidewalk.rotation.x = -Math.PI / 2;
      sidewalk.position.set(side * (roadWidth / 2 + 1.5), 0.02, road.position.z);
      this.scene.add(sidewalk);
    }

    // 車道虛線（白色小長條，捲動 + 循環回收來製造前進感）
    const dashGeo = new THREE.PlaneGeometry(0.15, 2.2);
    const dashMat = new THREE.MeshBasicMaterial({ color: 0xdddddd });
    const dashCount = Math.ceil(ROAD_LENGTH / DASH_SPACING);
    for (let lane = 1; lane < laneCount; lane++) {
      const x = (lane - laneCount / 2) * laneWidth;
      for (let i = 0; i < dashCount; i++) {
        const dash = new THREE.Mesh(dashGeo, dashMat);
        dash.rotation.x = -Math.PI / 2;
        dash.position.set(x, 0.03, 25 - i * DASH_SPACING);
        this.scene.add(dash);
        this.dashes.push(dash);
      }
    }

    // 路旁建築（隨機大小色塊，讓速度感更明顯）
    const buildingCount = Math.ceil(ROAD_LENGTH / BUILDING_SPACING);
    for (const side of [-1, 1]) {
      for (let i = 0; i < buildingCount; i++) {
        const w = 4 + Math.random() * 4;
        const h = 4 + Math.random() * 10;
        const building = new THREE.Mesh(
          new THREE.BoxGeometry(w, h, 8),
          new THREE.MeshLambertMaterial({
            color: new THREE.Color().setHSL(Math.random(), 0.25, 0.55),
          }),
        );
        building.position.set(
          side * (roadWidth / 2 + 5 + w / 2),
          h / 2,
          25 - i * BUILDING_SPACING,
        );
        this.scene.add(building);
        this.buildings.push(building);
      }
    }
  }

  // 每一幀把會捲動的東西往 +Z 推，超過鏡頭後方就繞回最遠處
  update(dt: number): void {
    const dz = TUNING.scrollSpeed * dt;
    for (const dash of this.dashes) {
      dash.position.z += dz;
      if (dash.position.z > 30) dash.position.z -= ROAD_LENGTH;
    }
    for (const building of this.buildings) {
      building.position.z += dz;
      if (building.position.z > 30) building.position.z -= ROAD_LENGTH;
    }
  }
}
