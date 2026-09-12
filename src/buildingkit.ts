// 塊狀街屋產生器：全部是方塊和圓柱＋純色，該貼圖的面留「貼圖槽」（命名為 decal_<槽名> 的網格）。
// 用法有兩段：
//   1. `npm run export:buildings` 用這裡的 makeShophouse 蓋幾款、匯出成
//      public/assets/models/buildings/shophouse-N.glb（可以拿去 Blender 修、重複使用）。
//   2. 遊戲載入那些 GLB（skins.ts BUILDING_MODELS），applyDecals 把每個 decal_<槽名> 網格貼上
//      public/assets/decals/ 裡登記的 PNG（每棟隨機抽）；PNG 還沒到的槽先貼畫著文字的佔位圖。
//
// 每棟的構造（正面朝 +Z、地面 y=0、面寬置中、往 -Z 延伸）：
//   一樓 店面：內縮成騎樓，兩根柱子，內牆貼「storefront」；騎樓上緣一片微凸的橫幅板貼「banner」；
//         正面一角一顆凸出的方塊招牌，兩側面和正面貼「cube」。
//   二樓以上 民宅：每層正面兩個凸出的鐵窗方塊貼「window」；二三樓之間一片直立長條招牌
//         凸出牆面，兩側面貼「vsign」。左右側牆也有鐵窗方塊（路口轉角看得到）。
//   屋頂：女兒牆＋圓柱不鏽鋼水塔立在小方柱上。
// 效能：純色部分合併成一個網格（頂點色），每個貼圖槽合併成一個網格，一棟 6 個 draw call。

import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TUNING } from "./tuning";

export type DecalSlot = "storefront" | "banner" | "cube" | "vsign" | "window";

// PNG 檔名（相對 public/assets/decals/）。每個槽一個池，蓋房子時隨機抽
const DECAL_FILES: Record<DecalSlot, string[]> = {
  storefront: [], // 店面正面（玻璃門、貨架），寬扁約 4:1
  banner: [], // 橫幅招牌（店名＋logo），約 5:1
  cube: [], // 方塊招牌的側面，正方形
  vsign: [], // 直立長條招牌，約 1:4（直排字）
  window: [], // 鐵窗（格子＋窗簾/冷氣），約 1:1
};

// 佔位圖：底色＋槽名，PNG 到位前用
function placeholderTexture(label: string, w: number, h: number, color: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = "rgba(0,0,0,0.35)";
  ctx.lineWidth = Math.max(4, w / 40);
  ctx.strokeRect(0, 0, w, h);
  ctx.fillStyle = "#222";
  ctx.font = `bold ${Math.floor(Math.min(w, h) * 0.35)}px sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  if (h > w * 1.5) {
    // 直式：一個字一行
    const chars = label.split("");
    const step = h / (chars.length + 1);
    chars.forEach((ch, i) => ctx.fillText(ch, w / 2, step * (i + 1)));
  } else ctx.fillText(label, w / 2, h / 2);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
const PLACEHOLDERS: Record<DecalSlot, () => THREE.Texture> = {
  storefront: () => placeholderTexture("店面", 512, 160, "#cfe3f0"),
  banner: () => placeholderTexture("橫幅招牌", 640, 128, "#f4e3a1"),
  cube: () => placeholderTexture("方塊", 256, 256, "#f2b8a0"),
  vsign: () => placeholderTexture("直立招牌", 128, 512, "#c9e6c0"),
  window: () => placeholderTexture("鐵窗", 256, 256, "#dcdcdc"),
};

// 每個槽可用的貼圖（載好的 PNG；沒有就一張佔位圖）
const decalPool: Record<DecalSlot, THREE.Texture[]> = {
  storefront: [],
  banner: [],
  cube: [],
  vsign: [],
  window: [],
};
let decalsLoaded = false; // PNG 全部載完（或沒有 PNG 可載）
let decalsPending = 0;

export function preloadDecals(): void {
  if (decalsPending > 0 || decalsLoaded) return;
  const loader = new THREE.TextureLoader();
  const base = `${import.meta.env.BASE_URL}assets/decals/`;
  for (const slot of Object.keys(DECAL_FILES) as DecalSlot[]) {
    for (const file of DECAL_FILES[slot]) {
      decalsPending++;
      loader.load(
        base + file,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          decalPool[slot].push(tex);
          if (--decalsPending === 0) decalsLoaded = true;
        },
        undefined,
        () => {
          console.warn(`貼圖載入失敗：decals/${file}`);
          if (--decalsPending === 0) decalsLoaded = true;
        },
      );
    }
  }
  if (decalsPending === 0) decalsLoaded = true;
}
export function decalsReady(): boolean {
  return decalsLoaded;
}
// 這個槽抽一張 PNG；沒有 PNG 就回傳 null（留白：槽面維持底色）。
// 想看槽在哪裡，把 SHOW_PLACEHOLDERS 改 true 就會貼上寫著槽名的佔位圖
const SHOW_PLACEHOLDERS = false;
const placeholderCache = new Map<DecalSlot, THREE.Texture>();
function pickDecal(slot: DecalSlot): THREE.Texture | null {
  const pool = decalPool[slot];
  if (pool.length > 0) return pool[Math.floor(Math.random() * pool.length)];
  if (!SHOW_PLACEHOLDERS) return null;
  let ph = placeholderCache.get(slot);
  if (!ph) placeholderCache.set(slot, (ph = PLACEHOLDERS[slot]()));
  return ph;
}

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

export function makeShophouse(): Shophouse {
  const s = TUNING.shophouse;
  const rnd = (a: number, b: number) => THREE.MathUtils.lerp(a, b, Math.random());
  const floors = s.floorsMin + Math.floor(Math.random() * (s.floorsMax - s.floorsMin + 1));
  const w = rnd(s.widthMin, s.widthMax);
  const d = s.depth;
  const fh = TUNING.buildings.floorHeight;
  const H = floors * fh;
  const wall = new THREE.Color(s.wallColors[Math.floor(Math.random() * s.wallColors.length)]);
  const dark = new THREE.Color(s.trimColor);
  const cage = new THREE.Color(s.cageColor);
  const signBody = new THREE.Color(s.signBoxColor);
  const cubeSide: 1 | -1 = Math.random() < 0.5 ? 1 : -1; // 方塊招牌在哪個角，直立招牌在另一角
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

  // 橫幅招牌板：騎樓上緣、微凸
  const bannerY = fh + s.bannerH / 2 + 0.15;
  addBlock(parts, UNIT_BOX, signBody, [w, s.bannerH, s.bannerT], [0, bannerY, s.bannerT / 2]);
  addDecal(decals, "banner", "z", [0, bannerY, s.bannerT + EPS], w - 0.1, s.bannerH - 0.1);

  // 方塊招牌：一角、凸出正面
  const c = s.cube;
  const cubeX = cubeSide * (w / 2 - c / 2 - 0.1);
  const cubeY = fh + s.bannerH + 0.4 + c / 2;
  addBlock(parts, UNIT_BOX, signBody, [c, c, c], [cubeX, cubeY, c / 2 + 0.05]);
  addDecal(decals, "cube", "x", [cubeX + c / 2 + EPS, cubeY, c / 2 + 0.05], c - 0.06, c - 0.06);
  addDecal(decals, "cube", "-x", [cubeX - c / 2 - EPS, cubeY, c / 2 + 0.05], c - 0.06, c - 0.06);
  addDecal(decals, "cube", "z", [cubeX, cubeY, c + 0.05 + EPS], c - 0.06, c - 0.06);

  // 直立長條招牌：另一角、從二樓掛到三樓，凸出牆面；兩側面貼圖（沿街看得到）
  const v = s.vsign;
  const vX = -cubeSide * (w / 2 - v.thick / 2 - 0.15);
  const vY = fh + 1.2 + v.height / 2;
  addBlock(parts, UNIT_BOX, signBody, [v.thick, v.height, v.depth], [vX, vY, v.depth / 2 + 0.1]);
  addDecal(decals, "vsign", "x", [vX + v.thick / 2 + EPS, vY, v.depth / 2 + 0.1], v.depth - 0.06, v.height - 0.08);
  addDecal(decals, "vsign", "-x", [vX - v.thick / 2 - EPS, vY, v.depth / 2 + 0.1], v.depth - 0.06, v.height - 0.08);

  // 鐵窗方塊：二樓以上每層正面兩個、左右側面各兩個
  const g = s.cage;
  for (let f = 1; f < floors; f++) {
    const y = f * fh + fh * 0.5;
    for (const sx of [-1, 1]) {
      const x = sx * w * 0.25;
      addBlock(parts, UNIT_BOX, cage, [g.w, g.h, g.out], [x, y, g.out / 2]);
      addDecal(decals, "window", "z", [x, y, g.out + EPS], g.w - 0.08, g.h - 0.08);
    }
    for (const sx of [-1, 1]) {
      for (const zc of [-d * 0.3, -d * 0.7]) {
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

// 遊戲載入 GLB 後呼叫：每個 decal_<槽名> 網格換成貼了隨機 PNG（或佔位圖）的材質。
// 每棟 clone 各自呼叫一次，同一款模型才會有不同店家
export function applyDecals(model: THREE.Object3D): void {
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh || !mesh.name.startsWith("decal_")) return;
    const slot = mesh.name.slice("decal_".length) as DecalSlot;
    if (!(slot in DECAL_FILES)) return;
    const tex = pickDecal(slot);
    if (!tex) {
      mesh.visible = false; // 留白：沒有 PNG 的槽不顯示面片，露出底下的底色
      return;
    }
    mesh.material = new THREE.MeshLambertMaterial({ map: tex, transparent: true, alphaTest: 0.5 });
  });
}
