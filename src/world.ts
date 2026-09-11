// 場景、光、道路佈局與路旁建築。
// 佈局（左到右）：【左人行道】【迎面車道×N】【雙黃線】【對向車道×N】【右人行道】
// 核心原則：玩家不動；main.ts 每幀給一個 dz（世界捲動量），這裡的東西照著捲。

import * as THREE from "three";
import {
  TUNING,
  colX,
  ROAD_LEFT,
  ROAD_RIGHT,
  BG_LEFT,
  BG_RIGHT,
  RIGHT_SIDEWALK_COL,
} from "./tuning";
import {
  makeBuilding,
  makeRoadMark,
  roadMarkMaterial,
  sidewalkMaterial,
  makeSidewalkMark,
  SIDEWALK_MARK_LENGTH,
  makeBusZone,
} from "./skins";

const ROAD_LENGTH = 220; // 路面長度（夠長到看不見盡頭就好）
const DASH_SPACING = 6; // 車道虛線間距
const BUILDING_SPACING = 14; // 路旁建築間距
const WRAP_Z = 30; // 捲過這個 Z 就繞回最遠處

export class World {
  readonly scene = new THREE.Scene();
  private readonly scrolling: THREE.Mesh[] = []; // 會捲動循環的東西（車道虛線）
  private readonly buildings: THREE.Mesh[] = []; // 建築另外管理：進路口範圍要隱藏
  private readonly markGroups: THREE.Group[] = []; // 路面標記（慢/50）：一組=一側車道各一字
  private readonly sidewalkMarks: THREE.Mesh[] = []; // 人行道上的「人行道」字
  private readonly busZones: THREE.Group[] = []; // 公車停靠區：外側車道貼路邊線的長條

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

    // 左右人行道（微微墊高的綠色長條；鋪面外觀在 skins.ts 的 sidewalkMaterial）
    const sidewalkGeo = new THREE.BoxGeometry(sidewalkWidth, 0.08, ROAD_LENGTH);
    for (const centerX of [
      roadLeft - sidewalkWidth / 2,
      BG_RIGHT + sidewalkWidth / 2,
    ]) {
      const sidewalk = new THREE.Mesh(sidewalkGeo, sidewalkMaterial());
      sidewalk.position.set(centerX, 0.04, roadZ);
      this.scene.add(sidewalk);
    }

    // 路邊白線：人行道與車道的交界，連續不間斷
    // （路口的橫向路面墊得比較高，會自然把線蓋掉，視覺上就是線在路口中斷）
    const edgeGeo = new THREE.PlaneGeometry(0.15, ROAD_LENGTH);
    const edgeMat = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
    for (const x of [roadLeft + 0.1, BG_RIGHT - 0.1]) {
      const line = new THREE.Mesh(edgeGeo, edgeMat);
      line.rotation.x = -Math.PI / 2;
      line.position.set(x, 0.011, roadZ);
      this.scene.add(line);
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
            ? roadLeft - sidewalkWidth - t.buildingGap - w / 2
            : BG_RIGHT + sidewalkWidth + t.buildingGap + w / 2;
        const building = makeBuilding(w, h, 8);
        building.position.set(x, h / 2, WRAP_Z - i * BUILDING_SPACING);
        this.scene.add(building);
        this.buildings.push(building);
      }
    }

    // 路面標記（慢/速限50，裝飾）：成對出現在同一側的每條車道、同一個 z，
    // 字向跟著該側車行方向。循環使用，繞回遠處時重抽側別和字。
    for (let i = 0; i < t.roadMarkPairs; i++) {
      const group = new THREE.Group();
      for (let j = 0; j < Math.max(t.roadLanes, t.bgLanes); j++) {
        group.add(makeRoadMark(t.roadMarkLabels[0]));
      }
      this.assignMarkGroup(group);
      group.position.z = WRAP_Z - Math.random() * ROAD_LENGTH;
      this.scene.add(group);
      this.markGroups.push(group);
    }

    // 人行道「人行道」字（裝飾）：循環使用，繞回遠處時換隨機一側
    for (let i = 0; i < t.sidewalkMarkCount; i++) {
      const mark = makeSidewalkMark();
      this.scene.add(mark);
      this.sidewalkMarks.push(mark);
    }
    this.resetSidewalkMarks();

    // 公車停靠區（裝飾）：循環使用，繞回遠處時換隨機一側
    for (let i = 0; i < t.busZone.count; i++) {
      const zone = makeBusZone(LW * t.busZone.widthRatio, t.busZone.length);
      this.assignBusZone(zone);
      zone.position.z = WRAP_Z - Math.random() * ROAD_LENGTH;
      this.scene.add(zone);
      this.busZones.push(zone);
    }
  }

  // 重抽公車停靠區的側別：貼著該側的路邊線，迎面側整組轉 180 度讓字向跟車行方向
  private assignBusZone(zone: THREE.Group): void {
    const width = TUNING.laneWidth * TUNING.busZone.widthRatio;
    const left = Math.random() < 0.5;
    zone.position.x = left ? ROAD_LEFT + width / 2 : BG_RIGHT - width / 2;
    zone.rotation.y = left ? Math.PI : 0;
  }

  // 每關開場把「人行道」字擺回玩家眼前（左側緊鄰出生點、右側稍遠），
  // 讓玩家從第一眼就認得綠鋪面是人行道；其餘的隨機散佈
  resetSidewalkMarks(): void {
    this.sidewalkMarks.forEach((mark, i) => {
      if (i === 0) {
        mark.position.x = colX(0);
        mark.position.z = -6;
      } else if (i === 1) {
        mark.position.x = colX(RIGHT_SIDEWALK_COL);
        mark.position.z = -12;
      } else {
        mark.position.x = this.randomSidewalkX();
        mark.position.z = WRAP_Z - Math.random() * ROAD_LENGTH;
      }
    });
  }

  private randomSidewalkX(): number {
    return colX(Math.random() < 0.5 ? 0 : RIGHT_SIDEWALK_COL);
  }

  // 重抽一組路面標記：隨機側別（左=迎面/右=同向）、隨機字（慢/50）
  private assignMarkGroup(group: THREE.Group): void {
    const t = TUNING;
    const labels = t.roadMarkLabels;
    const material = roadMarkMaterial(labels[Math.floor(Math.random() * labels.length)]);
    const left = Math.random() < 0.5;
    const laneCount = left ? t.roadLanes : t.bgLanes;
    const firstCol = left ? 1 : t.roadLanes + 1;
    group.children.forEach((child, i) => {
      const mark = child as THREE.Mesh;
      if (i >= laneCount) {
        mark.visible = false;
        return;
      }
      mark.visible = true;
      mark.material = material;
      mark.position.x = colX(firstCol + i);
      // 字向跟車行方向：迎面車朝 +Z 開，字的上緣也朝 +Z——
      // 所以玩家看迎面側的字是顛倒的，這才是現實中的樣子
      mark.rotation.z = left ? Math.PI : 0;
    });
  }

  // 每一幀把會捲動的東西推 dz；捲過頭就繞回另一端（前進後退都要能繞）。
  // intersectionCenters：目前路口的中心 Z——建築和「慢」字跟路口重疊時要隱藏
  // （切換發生在遠處的霧裡，玩家看不到跳變）。
  // destinationZone：目的地建築佔的位置——同側的一般建築讓位隱藏。
  // parkingZones：停車格路段的位置——「人行道」字撞到就隱藏（黑鋪面上不該有綠鋪面的字）。
  update(
    dz: number,
    intersectionCenters: readonly number[],
    destinationZone: { z: number; side: "left" | "right"; margin: number } | null,
    parkingZones: readonly { z: number; side: "left" | "right"; halfLen: number }[],
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
    for (const group of this.markGroups) {
      group.position.z += dz;
      let wrapped = false;
      if (group.position.z > WRAP_Z) {
        group.position.z -= ROAD_LENGTH;
        wrapped = true;
      } else if (group.position.z < WRAP_Z - ROAD_LENGTH) {
        group.position.z += ROAD_LENGTH;
        wrapped = true;
      }
      if (wrapped) this.assignMarkGroup(group);
      group.visible = !nearZone(group.position.z, 2.5);
    }
    for (const zone of this.busZones) {
      zone.position.z += dz;
      let wrapped = false;
      if (zone.position.z > WRAP_Z) {
        zone.position.z -= ROAD_LENGTH;
        wrapped = true;
      } else if (zone.position.z < WRAP_Z - ROAD_LENGTH) {
        zone.position.z += ROAD_LENGTH;
        wrapped = true;
      }
      if (wrapped) this.assignBusZone(zone);
      // 長條的一半 + 緩衝，跟路口重疊就隱藏
      zone.visible = !nearZone(zone.position.z, TUNING.busZone.length / 2 + 2);
    }
    for (const mark of this.sidewalkMarks) {
      if (wrap(mark)) mark.position.x = this.randomSidewalkX();
      const side = mark.position.x < 0 ? "left" : "right";
      const halfMark = SIDEWALK_MARK_LENGTH / 2 + 0.2; // 字長的一半 + 緩衝
      const onParking = parkingZones.some(
        (zone) =>
          zone.side === side &&
          Math.abs(mark.position.z - zone.z) < zone.halfLen + halfMark,
      );
      mark.visible = !nearZone(mark.position.z, halfMark) && !onParking;
    }
  }
}
