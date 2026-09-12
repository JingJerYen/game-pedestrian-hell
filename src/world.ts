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
  LAYOUT,
  buildingLineX,
  type Side,
} from "./tuning";
import {
  makeBuilding,
  restyleBuilding,
  buildingModelsReady,
  type BuildingParts,
  makeRoadMark,
  roadMarkMaterial,
  sidewalkMaterial,
  makeSidewalkMark,
  SIDEWALK_MARK_LENGTH,
  makeBusZone,
  makeBackdrop,
  makeGround,
  type Backdrop,
} from "./skins";

const ROAD_LENGTH = 220; // 路面長度（夠長到看不見盡頭就好）
const DASH_SPACING = 6; // 車道虛線間距
const WRAP_Z = 30; // 捲過這個 Z 就繞回最遠處

interface RowBuilding {
  parts: BuildingParts;
  len: number; // 面寬（沿路方向的長度）
}

export class World {
  readonly scene = new THREE.Scene();
  private readonly scrolling: THREE.Mesh[] = []; // 會捲動循環的東西（車道虛線）
  // 路旁建築：兩側各一排連棟街屋，一棟接一棟沒有空隙。整棟捲到鏡頭後面就接到
  // 最遠那棟後面（順便換一棟新的）。進路口範圍／讓位給目的地建築時隱藏。
  private readonly rows: { side: -1 | 1; list: RowBuilding[] }[] = [];
  private buildingModelsApplied = false; // 建築模型載好後把整排色塊一次換成模型
  private readonly backdrop: Backdrop; // 馬路盡頭的大背景圖
  private backdropIndex = 0; // 目前用的是 sets 的第幾張
  private readonly markGroups: THREE.Group[] = []; // 路面標記（慢/50）：一組=一側車道各一字
  private readonly sidewalkMarks: THREE.Mesh[] = []; // 人行道上的「人行道」字
  private readonly sidewalks: THREE.Mesh[] = []; // 左右人行道鋪面
  private readonly edgeLines: THREE.Mesh[] = []; // 路邊白線
  private readonly roadMaterial: THREE.MeshLambertMaterial; // 柏油（asphalt/none 樣式的人行道也用它）
  private readonly busZones: THREE.Group[] = []; // 公車停靠區：外側車道貼路邊線的長條

  constructor() {
    const t = TUNING;
    const LW = t.laneWidth;
    const roadLeft = -LW / 2; // 迎面車道左緣（左人行道右緣）
    const sidewalkWidth = LW + 0.8;
    const roadZ = -ROAD_LENGTH / 2 + WRAP_Z;

    // 天空與霧的顏色由 setBackdrop 依背景圖設定（每張圖配自己的霧色）
    this.scene.background = new THREE.Color(0x87b5d9);
    this.scene.fog = new THREE.Fog(0x87b5d9, 60, 160); // 遠處霧化，遮住物件生成/消失

    // 光：一盞環境半球光 + 一盞太陽平行光（固定白天；夜景只換背景圖，燈光不動）
    this.scene.add(new THREE.HemisphereLight(0xffffff, 0x666677, 1.1));
    const sun = new THREE.DirectionalLight(0xffffff, 1.4);
    sun.position.set(-20, 30, -10);
    this.scene.add(sun);

    // 大地面：鋪滿整個可見範圍（不捲動，看不出來在動）
    this.scene.add(makeGround(1200));

    // 遠景大背景圖：以鏡頭為圓心的弧面，立在霧的盡頭之外，不捲動；x 每幀跟著鏡頭（updateBackdrop）
    this.backdrop = makeBackdrop();
    this.backdrop.group.position.z = t.cameraDistance; // 圓心放在鏡頭的 z
    this.scene.add(this.backdrop.group);
    this.setBackdrop(0);


    // 柏油路面（迎面車道＋雙黃線區＋對向車道）
    this.roadMaterial = new THREE.MeshLambertMaterial({ color: 0x3a3a3e });
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(BG_RIGHT - roadLeft, ROAD_LENGTH),
      this.roadMaterial,
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
      this.sidewalks.push(sidewalk);
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
      this.edgeLines.push(line);
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

    // 路旁建築：從鏡頭後方（WRAP_Z）開始一棟接一棟往遠處排，排滿整段路
    for (const side of [-1, 1] as const) {
      const list: RowBuilding[] = [];
      let nearZ = WRAP_Z; // 下一棟的近端要貼在這裡
      while (WRAP_Z - nearZ < ROAD_LENGTH) {
        const b: RowBuilding = { parts: makeBuilding(), len: 0 };
        this.restyleRowBuilding(b, side);
        b.parts.root.position.z = nearZ - b.len / 2;
        nearZ -= b.len;
        this.scene.add(b.parts.root);
        list.push(b);
      }
      this.rows.push({ side, list });
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

  // 套用 LAYOUT 的人行道配置（每關開始時呼叫）。左右各自：
  // normal = 綠鋪面墊高＋「人行道」字；asphalt = 同樣墊高但柏油色、沒有字；
  // none = 那側整條人行道消失，建築挪到車道邊（路邊白線留著，是車道的邊線）
  applySidewalks(): void {
    (["left", "right"] as const).forEach((side, i) => {
      const style = LAYOUT[side];
      const sw = this.sidewalks[i];
      sw.visible = style !== "none";
      sw.material = style === "normal" ? sidewalkMaterial() : this.roadMaterial;
    });
    for (const mark of this.sidewalkMarks) mark.visible = false; // update() 會依側別再打開
    // 建築前緣貼到新的線上
    for (const { side, list } of this.rows) {
      const x = buildingLineX(side === -1 ? "left" : "right");
      for (const b of list) b.parts.root.position.x = x;
    }
  }

  // 這一側的「人行道」字要不要顯示（只有綠鋪面樣式才有字）
  private marksOn(side: Side): boolean {
    return LAYOUT[side] === "normal";
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

  // 換背景（每關開始時呼叫）：第 index 張（超出就輪回去），連天空和霧的顏色一起換
  setBackdrop(index: number): void {
    const sets = TUNING.backdrop.sets;
    if (!sets.length) return;
    this.backdropIndex = ((index % sets.length) + sets.length) % sets.length;
    const set = sets[this.backdropIndex];
    const sky = new THREE.Color(set.sky);
    (this.scene.background as THREE.Color).copy(sky);
    (this.scene.fog as THREE.Fog).color.copy(sky);
    this.backdrop.show(set.image, sky, set.horizonRatio ?? TUNING.backdrop.horizonRatio);
  }

  // 換下一張背景（測試熱鍵 2）
  nextBackdrop(): void {
    this.setBackdrop(this.backdropIndex + 1);
  }

  // debug overlay 用：目前背景是第幾張／共幾張、檔名
  get backdropInfo(): string {
    const sets = TUNING.backdrop.sets;
    if (!sets.length) return "none";
    return `${this.backdropIndex + 1}/${sets.length} ${sets[this.backdropIndex].image}`;
  }

  // 每幀在鏡頭定位之後呼叫：背景圖跟著鏡頭橫移一部分（follow=1 就像貼在螢幕上）
  updateBackdrop(cameraX: number): void {
    this.backdrop.group.position.x = cameraX * TUNING.backdrop.follow;
  }

  // 重組一棟街屋（外觀與尺寸由 skins.ts 決定），正面貼齊人行道外緣
  private restyleRowBuilding(b: RowBuilding, side: -1 | 1): void {
    // 左側建築正面朝 +X（馬路在右邊）、右側朝 -X；root 原點放在人行道外緣那條線上
    b.len = restyleBuilding(b.parts, side === -1 ? 1 : -1);
    b.parts.root.position.x = buildingLineX(side === -1 ? "left" : "right");
    b.parts.root.position.y = 0;
  }

  // 整排重排：把每棟依目前順序重新首尾相接（換成模型後面寬變了，要重排才不會有縫）
  private relayoutRow(list: RowBuilding[], side: -1 | 1): void {
    const sorted = [...list].sort((a, b) => b.parts.root.position.z - a.parts.root.position.z);
    let nearZ = sorted[0].parts.root.position.z + sorted[0].len / 2;
    for (const b of sorted) {
      this.restyleRowBuilding(b, side);
      b.parts.root.position.z = nearZ - b.len / 2;
      nearZ -= b.len;
    }
  }

  // 「人行道」字要放哪一側：只挑綠鋪面的那側（兩側都不是就隨便放，反正會被隱藏）
  private randomSidewalkX(): number {
    const cols: number[] = [];
    if (this.marksOn("left")) cols.push(0);
    if (this.marksOn("right")) cols.push(RIGHT_SIDEWALK_COL);
    if (cols.length === 0) cols.push(0, RIGHT_SIDEWALK_COL);
    return colX(cols[Math.floor(Math.random() * cols.length)]);
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
    if (!this.buildingModelsApplied && buildingModelsReady()) {
      this.buildingModelsApplied = true;
      for (const { side, list } of this.rows) this.relayoutRow(list, side);
    }
    for (const { side, list } of this.rows) {
      for (const b of list) b.parts.root.position.z += dz;
      // 整棟捲到鏡頭後面 → 接到最遠那棟後面（換一棟新的）；倒著走則反過來接到最近那棟前面
      for (let guard = list.length; guard > 0; guard--) {
        let near = list[0];
        let far = list[0];
        for (const b of list) {
          if (b.parts.root.position.z > near.parts.root.position.z) near = b;
          if (b.parts.root.position.z < far.parts.root.position.z) far = b;
        }
        if (near.parts.root.position.z - near.len / 2 > WRAP_Z) {
          const farEdge = far.parts.root.position.z - far.len / 2;
          this.restyleRowBuilding(near, side);
          near.parts.root.position.z = farEdge - near.len / 2;
        } else if (far.parts.root.position.z + far.len / 2 < WRAP_Z - ROAD_LENGTH) {
          const nearEdge = near.parts.root.position.z + near.len / 2;
          this.restyleRowBuilding(far, side);
          far.parts.root.position.z = nearEdge + far.len / 2;
        } else break;
      }
      const sideName = side === -1 ? "left" : "right";
      for (const b of list) {
        const half = b.len / 2 + 0.5; // 面寬的一半 + 緩衝
        const z = b.parts.root.position.z;
        const yieldToDestination =
          destinationZone !== null &&
          destinationZone.side === sideName &&
          Math.abs(z - destinationZone.z) < destinationZone.margin + half;
        b.parts.root.visible = !nearZone(z, half) && !yieldToDestination;
      }
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
      mark.visible = this.marksOn(side) && !nearZone(mark.position.z, halfMark) && !onParking;
    }
  }
}
