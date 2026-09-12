// 塊狀街屋產生器（只在 npm run export:buildings 時跑，不進遊戲）：
// 全部是方塊和圓柱＋純色，該貼圖的面是「貼圖槽」（命名為 decal_<槽名> 的網格），
// export.ts 匯出時把 PNG 以「外部檔案」的方式接到槽上（GLB 只記路徑，遊戲載入時抓 PNG，
// 同一張 PNG 多棟共用只下載一次）。
//
// 每棟的構造（正面朝 +Z、地面 y=0、面寬置中、往 -Z 延伸）：
//   一樓 店面：內縮成騎樓，兩根柱子，內牆貼「storefront」；騎樓上緣一片微凸的橫幅板貼「banner」；
//         正面一角一片垂直牆面凸出的方形薄片招牌，兩面貼「cube」。
//   二樓以上 民宅：每層正面兩個凸出的鐵窗方塊貼「window」；一片直立長條招牌凸出牆面，
//         兩側面貼「vsign」。左右側牆也有鐵窗方塊（路口轉角看得到）。
//   屋頂：女兒牆＋圓柱不鏽鋼水塔立在小方柱上。
// 每款的數字在 specs.ts 的表；共用的尺寸和顏色在下面 KIT。

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";

// 共用尺寸與顏色（公尺）——所有款式一樣的部分
export const KIT = {
  floorHeight: 3.2,
  depth: 8,
  arcadeDepth: 1.6, // 一樓騎樓內縮多深
  pillar: 0.45, // 騎樓柱子寬
  bannerT: 0.12, // 橫幅招牌板凸出多少
  plate: { size: 1.0, thick: 0.1, out: 1.0 }, // 方形薄片招牌：邊長、厚度、凸出牆面多少
  vsign: { thick: 0.25, height: 3.6, depth: 0.9 }, // 直立長條招牌：厚度、高度、凸出牆面多少
  vsignGap: 0.35, // 兩片直立招牌之間的空隙
  cage: { w: 1.3, h: 1.5, out: 0.4 }, // 鐵窗方塊：寬、高、凸出多少
  tank: { r: 0.6, h: 1.2, base: 0.7, baseH: 0.8 }, // 水塔：半徑、高、方柱邊長、方柱高
  trimColor: 0x6b6560, // 樓板線／水塔座
  cageColor: 0x555a60, // 鐵窗方塊
  signBoxColor: 0xf5f5f5, // 招牌板／薄片／長條的底色（貼圖蓋在上面）
  tankColor: 0xc8ccd0, // 不鏽鋼水塔
};
export type DecalSlot = "storefront" | "banner" | "cube" | "vsign" | "window";

// ── 蓋一棟 ──

const UNIT_BOX = new THREE.BoxGeometry(1, 1, 1);
const UNIT_CYL = new THREE.CylinderGeometry(1, 1, 1, 16);
const UNIT_PLANE = new THREE.PlaneGeometry(1, 1);

// 把一塊純色幾何（縮放、擺位、可旋轉）塞進 parts；顏色寫進頂點色，最後合併成一個網格
function addBlock(
  parts: THREE.BufferGeometry[],
  base: THREE.BufferGeometry,
  color: THREE.Color,
  size: [number, number, number],
  pos: [number, number, number],
): void {
  const g = base.clone();
  g.applyMatrix4(new THREE.Matrix4().makeScale(...size).setPosition(...pos));
  const n = g.attributes.position.count;
  const colors = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) {
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  parts.push(g);
}

// 貼圖面片：貼在某個面上、面向 normal（+z / +x / -x），中心 pos，大小 w×h；依槽分組
type Facing = "z" | "x" | "-x";
function addDecal(
  decals: Map<DecalSlot, THREE.BufferGeometry[]>,
  slot: DecalSlot,
  facing: Facing,
  pos: [number, number, number],
  w: number,
  h: number,
): void {
  const g = UNIT_PLANE.clone();
  const m = new THREE.Matrix4().makeScale(w, h, 1);
  const rot = new THREE.Matrix4();
  if (facing === "x") rot.makeRotationY(Math.PI / 2);
  else if (facing === "-x") rot.makeRotationY(-Math.PI / 2);
  g.applyMatrix4(rot.multiply(m).setPosition(...pos));
  let list = decals.get(slot);
  if (!list) decals.set(slot, (list = []));
  list.push(g);
}

export interface Shophouse {
  root: THREE.Group; // 正面 +Z 貼在 z=0，地面 y=0，面寬置中
  width: number; // 面寬（沿路方向）
}

// 一款的規格（specs.ts 的表）：明寫的數字直接用，鐵窗的小偏移用 seed 決定（同 seed 永遠同結果）
export interface ShophouseSpec {
  name: string; // 輸出檔名（不含 .glb）
  floors: number; // 樓層數
  width: number; // 面寬（公尺）
  depth?: number; // 深度（預設 KIT.depth）
  wallColor: number; // 牆面磁磚色
  signCorner: "left" | "right"; // 方形薄片招牌在哪個角（直立招牌在另一角）
  bannerH: number; // 橫幅板高度
  bannerLift: number; // 橫幅板底離騎樓上緣多高
  plateLift: number; // 薄片招牌底離橫幅板頂多高
  vsignLift: number; // 直立招牌底離二樓地板多高
  vsign2Lift?: number; // 第二片直立招牌（貼著第一片旁邊、往內一點）底離二樓地板多高；省略 = 只有一片
  cageJitter: number; // 鐵窗位置的隨機偏移上限（0 = 整齊排好）
  seed: number; // 鐵窗偏移的亂數種子
  store?: string; // 店家資料夾名（public/assets/decals/stores/<store>/），四個店家槽貼它的圖
  windows?: string; // 鐵窗圖名（public/assets/decals/windows/<windows>.png）
}

// mulberry32：可餵種子的亂數，同 seed 同結果
function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeShophouse(spec: ShophouseSpec): Shophouse {
  const s = KIT;
  const rng = seeded(spec.seed);
  const rnd = (a: number, b: number) => a + (b - a) * rng();
  const floors = spec.floors;
  const w = spec.width;
  const d = spec.depth ?? s.depth;
  const fh = s.floorHeight;
  const H = floors * fh;
  const wall = new THREE.Color(spec.wallColor);
  const dark = new THREE.Color(s.trimColor);
  const cage = new THREE.Color(s.cageColor);
  const signBody = new THREE.Color(s.signBoxColor);
  const cubeSide: 1 | -1 = spec.signCorner === "right" ? 1 : -1; // 薄片招牌在哪個角，直立招牌在另一角
  const EPS = 0.012; // 貼圖面片離牆面一點點，免得閃爍

  const parts: THREE.BufferGeometry[] = [];
  const decals = new Map<DecalSlot, THREE.BufferGeometry[]>();

  // 一樓：騎樓（內縮）＋兩根柱子＋店面內牆
  const a = s.arcadeDepth;
  addBlock(parts, UNIT_BOX, wall, [w, fh, d - a], [0, fh / 2, -a - (d - a) / 2]);
  for (const sx of [-1, 1]) {
    addBlock(parts, UNIT_BOX, wall, [s.pillar, fh, a], [sx * (w / 2 - s.pillar / 2), fh / 2, -a / 2]);
  }
  const shopW = w - 2 * s.pillar - 0.2;
  addDecal(decals, "storefront", "z", [0, fh / 2, -a + EPS], shopW, fh - 0.3);

  // 二樓以上：一整塊
  addBlock(parts, UNIT_BOX, wall, [w, H - fh, d], [0, fh + (H - fh) / 2, -d / 2]);
  // 樓板線（深色細條，讓樓層有分界）
  for (let f = 2; f <= floors; f++) {
    addBlock(parts, UNIT_BOX, dark, [w + 0.04, 0.12, 0.06], [0, f * fh - 0.06, 0.03]);
  }

  // 橫幅招牌板：騎樓上緣、微凸；高度與離地每款不同
  const bannerH = spec.bannerH;
  const bannerY = fh + spec.bannerLift + bannerH / 2;
  addBlock(parts, UNIT_BOX, signBody, [w, bannerH, s.bannerT], [0, bannerY, s.bannerT / 2]);
  addDecal(decals, "banner", "z", [0, bannerY, s.bannerT + EPS], w - 0.1, bannerH - 0.1);

  // 方形薄片招牌：一角、垂直牆面凸出，兩面貼圖（沿街可讀）；高度每款不同
  const pl = s.plate;
  const plX = cubeSide * (w / 2 - pl.thick / 2 - 0.1);
  const plY = bannerY + bannerH / 2 + spec.plateLift + pl.size / 2;
  addBlock(parts, UNIT_BOX, signBody, [pl.thick, pl.size, pl.out], [plX, plY, pl.out / 2 + 0.05]);
  addDecal(decals, "cube", "x", [plX + pl.thick / 2 + EPS, plY, pl.out / 2 + 0.05], pl.out - 0.06, pl.size - 0.06);
  addDecal(decals, "cube", "-x", [plX - pl.thick / 2 - EPS, plY, pl.out / 2 + 0.05], pl.out - 0.06, pl.size - 0.06);

  // 直立長條招牌：另一角，凸出牆面；兩側面貼圖（沿街看得到）；掛的高度每款不同。
  // 有 vsign2Lift 就在旁邊（往內 vsignGap）再掛一片，高的樓常見兩三片擠在一起
  const v = s.vsign;
  const addVsign = (x: number, lift: number) => {
    const y = fh + lift + v.height / 2;
    addBlock(parts, UNIT_BOX, signBody, [v.thick, v.height, v.depth], [x, y, v.depth / 2 + 0.1]);
    addDecal(decals, "vsign", "x", [x + v.thick / 2 + EPS, y, v.depth / 2 + 0.1], v.depth - 0.06, v.height - 0.08);
    addDecal(decals, "vsign", "-x", [x - v.thick / 2 - EPS, y, v.depth / 2 + 0.1], v.depth - 0.06, v.height - 0.08);
  };
  const vX = -cubeSide * (w / 2 - v.thick / 2 - 0.15);
  addVsign(vX, spec.vsignLift);
  if (spec.vsign2Lift !== undefined) addVsign(vX + cubeSide * (v.thick + s.vsignGap), spec.vsign2Lift);

  // 鐵窗方塊：二樓以上每層正面兩個、左右側面各兩個；每個位置都帶一點隨機偏移
  const g = s.cage;
  const jit = () => rnd(-spec.cageJitter, spec.cageJitter);
  for (let f = 1; f < floors; f++) {
    const yBase = f * fh + fh * 0.5;
    for (const sx of [-1, 1]) {
      const x = sx * w * 0.25 + jit();
      const y = yBase + jit() * 0.6;
      addBlock(parts, UNIT_BOX, cage, [g.w, g.h, g.out], [x, y, g.out / 2]);
      addDecal(decals, "window", "z", [x, y, g.out + EPS], g.w - 0.08, g.h - 0.08);
    }
    for (const sx of [-1, 1]) {
      for (const zBase of [-d * 0.3, -d * 0.7]) {
        const zc = zBase + jit();
        const y = yBase + jit() * 0.6;
        const x = sx * (w / 2 + g.out / 2);
        addBlock(parts, UNIT_BOX, cage, [g.out, g.h, g.w], [x, y, zc]);
        addDecal(decals, "window", sx === 1 ? "x" : "-x", [sx * (w / 2 + g.out + EPS), y, zc], g.w - 0.08, g.h - 0.08);
      }
    }
  }

  // 屋頂：女兒牆＋水塔
  addBlock(parts, UNIT_BOX, wall, [w + 0.1, 0.6, 0.2], [0, H + 0.3, -0.1]);
  for (const sx of [-1, 1]) addBlock(parts, UNIT_BOX, wall, [0.2, 0.6, d], [sx * (w / 2 - 0.05), H + 0.3, -d / 2]);
  const t = s.tank;
  addBlock(parts, UNIT_BOX, dark, [t.base, t.baseH, t.base], [w * 0.2, H + t.baseH / 2, -d * 0.5]);
  addBlock(parts, UNIT_CYL, new THREE.Color(s.tankColor), [t.r, t.h, t.r], [w * 0.2, H + t.baseH + t.h / 2, -d * 0.5]);

  const root = new THREE.Group();
  const body = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ vertexColors: true }));
  body.name = "body";
  root.add(body);
  for (const [slot, list] of decals) {
    const mesh = new THREE.Mesh(mergeGeometries(list), new THREE.MeshLambertMaterial({ color: 0xffffff }));
    mesh.name = `decal_${slot}`; // 貼圖在遊戲載入時才由 applyDecals 貼上
    root.add(mesh);
  }
  return { root, width: w };
}

