// 車輛外觀管線：3D 模型（Kenney Car Kit GLB）→ 純色方塊 fallback。
// 模型放 public/assets/models/vehicles/<名>.glb（外部貼圖在同層 Textures/）。
//
// 每種車有一個「款式池」（轎車/計程車/警車…），生成時隨機抽一款，
// 街景自動有變化。模型會等比縮放到 tuning.ts 碰撞箱的長度、貼齊地面，
// 所以視覺跟判定永遠對得上。Kenney 模型車頭朝 +Z，跟迎面車朝向一致。
// 沒有模型的車種自動用純色方塊，補上 glb 就換。
// 人行道道具（變電箱…，public/assets/models/props/）也走同一套：kind = "prop-<名>"，尺寸在 tuning 的 sidewalkProps。
// 機車的車身（motor1 紅、gogoro 白）在載入時換成多種顏色，一色一款（recolorVariants）。
// 車流機車另有 foodpanda 外送車（foodpanda.glb，自帶騎士與外送箱）：不進機車池，生成時依 tuning 的 chance 直接用它。

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { TUNING } from "./tuning";
import type { Size3 } from "./collision";

// 每種車的模型款式池（檔名 = public/assets/models/vehicles/<名>.glb）
const MODEL_VARIANTS: Record<string, string[]> = {
  car: [
    "sedan",
    "sedan-sports",
    "hatchback-sports",
    "suv",
    "suv-luxury",
    "taxi",
    "van",
    "police",
  ],
  truck: ["truck", "truck-flat", "delivery", "garbage-truck"],
  // 車流機車：motor1（Tripo 生成，紅車身＋騎士），紅色車身換成 scooter.colors，一色一款
  scooter: ["motor1"],
  // foodpanda 外送機車（Meshy 生成，粉紅車身＋騎士＋外送箱）：不換色，生成機車時依 scooter.foodpanda.chance 用它
  foodpanda: ["foodpanda"],
  // 停放機車（機車格、人行道路障）：gogoro（白車身），白色換成 scooter.parkedColors，一色一款
  parkedScooter: ["gogoro"],
  // 人行道腳踏車：ubike（YouBike 含騎士），騎士衣服換成 bike.riderColors，一色一款
  bike: ["ubike"],
  // 人行道道具：tuning.sidewalkProps 的每一項一個 kind（prop-elecbox …），檔案在 props/
  ...Object.fromEntries(Object.keys(TUNING.sidewalkProps).map((name) => [`prop-${name}`, [name]])),
};
const PROP_PREFIX = "prop-";
function modelDir(kind: string): string {
  return kind.startsWith(PROP_PREFIX) ? "props" : "vehicles";
}
// 車頭不是朝 +Z 的模型，載入時先繞 Y 軸轉正（弧度）。motor1 車頭朝 +X → -90°；gogoro / ubike / foodpanda 朝 -X → +90°
const MODEL_ROTATION_Y: Record<string, number> = {
  motor1: -Math.PI / 2,
  gogoro: Math.PI / 2,
  ubike: Math.PI / 2,
  foodpanda: Math.PI / 2,
};
// 換色設定：哪些像素要換（用 HSL 判定：車身或騎士衣服）、要換成哪些顏色
const sc = TUNING.vehicles.scooter;
const RECOLOR: Record<string, { colors: readonly number[]; isBody: (h: number, s: number, l: number) => boolean }> = {
  motor1: {
    colors: sc.colors,
    isBody: (h, s) =>
      s >= sc.redBand.minSat &&
      (((h - sc.redBand.hueMin) % 360) + 360) % 360 <= sc.redBand.hueMax - sc.redBand.hueMin,
  },
  gogoro: {
    colors: sc.parkedColors,
    isBody: (_h, s, l) => s < sc.whiteBand.maxSat && l > sc.whiteBand.minLight,
  },
  ubike: {
    // 換的是騎士的衣服（淺藍），車身黃色不動
    colors: TUNING.bike.riderColors,
    isBody: (h, s) => {
      const b = TUNING.bike.riderBand;
      return s >= b.minSat && h >= b.hueMin && h <= b.hueMax;
    },
  },
};

// 載好並「規格化」（縮放到碰撞箱、置中、貼地）的模型原型，clone 出去用
const modelPools = new Map<string, THREE.Object3D[]>();
// 純色方塊 fallback 用的幾何
const boxGeometries = new Map<string, THREE.BoxGeometry>();

function sizeOf(kind: string): Size3 {
  if (kind === "bike") return TUNING.bike.size;
  if (kind.startsWith(PROP_PREFIX)) return TUNING.sidewalkProps[kind.slice(PROP_PREFIX.length)].size;
  if (kind === "foodpanda") return TUNING.vehicles.scooter.size; // 外送機車跟一般機車同一個碰撞箱
  if (kind === "parkedScooter") {
    // 停放機車：模型以「車頭朝 +Z」規格化，長度 = 停車格 blockSize 的 x（擺的時候會轉 90°）
    const b = TUNING.parking.types.scooter.blockSize;
    return { x: b.z, y: b.y, z: b.x };
  }
  return TUNING.vehicles[kind as keyof typeof TUNING.vehicles].size;
}

// 載入進度：全部檔案（成功或失敗）都回來了才算就緒——main.ts 開場等這個，玩家才不會看到色塊
let loadStarted = false;
let loadTotal = 0;
let loadDone = 0;
export function vehicleModelsReady(): boolean {
  return loadStarted && loadDone >= loadTotal;
}

export function preloadVehicleSkins(): void {
  if (loadStarted) return;
  loadStarted = true;
  const gltfLoader = new GLTFLoader();
  for (const [kind, names] of Object.entries(MODEL_VARIANTS)) {
    const size = sizeOf(kind);
    for (const name of names) {
      const url = `${import.meta.env.BASE_URL}assets/models/${modelDir(kind)}/${name}.glb`;
      loadTotal++;
      gltfLoader.load(
        url,
        (gltf) => {
          loadDone++;
          const rot = MODEL_ROTATION_Y[name];
          let scene: THREE.Object3D = gltf.scene;
          if (rot) {
            const turned = new THREE.Group();
            turned.rotation.y = rot;
            turned.add(scene);
            scene = turned;
          }
          const proto = normalize(scene, size);
          let pool = modelPools.get(kind);
          if (!pool) modelPools.set(kind, (pool = []));
          const recolor = RECOLOR[name];
          if (recolor) pool.push(...recolorVariants(proto, recolor));
          else pool.push(proto);
        },
        undefined,
        () => loadDone++, // 檔案不在 = 這款不用，正常
      );
    }
  }
}

function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return [h * 60, s, l];
}
function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const hp = (((h % 360) + 360) % 360) / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r = 0, g = 0, b = 0;
  if (hp < 1) [r, g] = [c, x];
  else if (hp < 2) [r, g] = [x, c];
  else if (hp < 3) [g, b] = [c, x];
  else if (hp < 4) [g, b] = [x, c];
  else if (hp < 5) [r, b] = [x, c];
  else [r, b] = [c, x];
  const m = l - c / 2;
  return [r + m, g + m, b + m];
}

// 車身換色：貼圖上被 isBody 判定為車身的像素換成目標色（保留明暗變化），其他像素不動。
// 每個顏色生一款原型。材質用無反光的 Lambert（跟汽車一樣的純色塊感）
function recolorVariants(
  proto: THREE.Object3D,
  cfg: { colors: readonly number[]; isBody: (h: number, s: number, l: number) => boolean },
): THREE.Object3D[] {
  let source: THREE.MeshStandardMaterial | null = null;
  proto.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!source && mesh.isMesh) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m?.map?.image) source = m;
    }
  });
  if (!source) return [proto];
  const src = source as THREE.MeshStandardMaterial;
  const image = src.map!.image as CanvasImageSource & { width: number; height: number };
  const w = image.width;
  const h = image.height;
  if (!w || !h) return [proto];
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(image, 0, 0);
  const base = ctx.getImageData(0, 0, w, h);
  const n = w * h;

  // 找出車身像素，順便算平均彩度/亮度（換色時當基準，保留原本的明暗變化）
  const isBody = new Uint8Array(n);
  const sat = new Float32Array(n);
  const light = new Float32Array(n);
  let sumS = 0;
  let sumL = 0;
  let count = 0;
  for (let i = 0; i < n; i++) {
    const [hh, s, l] = rgbToHsl(base.data[i * 4] / 255, base.data[i * 4 + 1] / 255, base.data[i * 4 + 2] / 255);
    if (cfg.isBody(hh, s, l)) {
      isBody[i] = 1;
      sat[i] = s;
      light[i] = l;
      sumS += s;
      sumL += l;
      count++;
    }
  }
  const refS = count ? sumS / count : 0.5;
  const refL = count ? sumL / count : 0.5;

  return cfg.colors.map((hex) => {
    // 直接從 hex 拆 sRGB 分量（不要用 THREE.Color：它會先轉成線性空間，色相會偏）
    const [th, ts, tl] = rgbToHsl(((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255);
    const img = ctx.createImageData(w, h);
    img.data.set(base.data);
    for (let i = 0; i < n; i++) {
      if (!isBody[i]) continue;
      // 白車身原本沒彩度，直接用目標彩度；紅車身照比例縮放
      const s2 = refS < 0.1 ? ts : Math.min(1, ts * (sat[i] / refS));
      const [r, g, b] = hslToRgb(th, s2, Math.min(1, Math.max(0, tl + (light[i] - refL))));
      img.data[i * 4] = r * 255;
      img.data[i * 4 + 1] = g * 255;
      img.data[i * 4 + 2] = b * 255;
    }
    const c2 = document.createElement("canvas");
    c2.width = w;
    c2.height = h;
    c2.getContext("2d")!.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c2);
    tex.flipY = src.map!.flipY; // glTF 貼圖不翻轉，跟著原本的設定
    tex.colorSpace = src.map!.colorSpace;
    tex.wrapS = src.map!.wrapS;
    tex.wrapT = src.map!.wrapT;
    const mat = new THREE.MeshLambertMaterial({ map: tex });
    const variant = proto.clone(true);
    variant.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material === src) mesh.material = mat;
    });
    return variant;
  });
}

// 把模型調整成：長度貼齊碰撞箱、水平置中、車底貼在「碰撞箱底部」。
// 回傳的原型以「碰撞箱中心」為原點（跟色塊方塊同一套定位約定）。
function normalize(scene: THREE.Object3D, size: Size3): THREE.Object3D {
  const box = new THREE.Box3().setFromObject(scene);
  const dims = new THREE.Vector3();
  box.getSize(dims);
  // 以車長為準等比縮放；車寬最多容許超出碰撞箱 15%（純視覺，判定不變）
  const scale = Math.min(size.z / dims.z, (size.x * 1.15) / dims.x);
  scene.scale.setScalar(scale);
  const scaled = new THREE.Box3().setFromObject(scene);
  const center = new THREE.Vector3();
  scaled.getCenter(center);
  const wrapper = new THREE.Group();
  scene.position.set(
    scene.position.x - center.x,
    scene.position.y - scaled.min.y - size.y / 2,
    scene.position.z - center.z,
  );
  wrapper.add(scene);
  return wrapper;
}

// 人行道道具的外觀（原點＝碰撞箱中心，正面朝 +Z）；模型沒載好時是 color 色塊
export function makePropMesh(name: string, color: number): THREE.Object3D {
  return makeVehicleMesh(`${PROP_PREFIX}${name}`, color);
}

// 開場預熱用（main.ts）：每一款載好的外觀各一份，讓 renderer 先編譯 shader、上傳貼圖
export function allVehiclePrototypes(): THREE.Object3D[] {
  const out: THREE.Object3D[] = [];
  for (const pool of modelPools.values()) out.push(...pool);
  return out;
}

// 對外唯一入口：生一台車的外觀（原點＝碰撞箱中心）。
// color 只在還沒有模型的車種（純色方塊 fallback）派上用場。
export function makeVehicleMesh(kind: string, color: number): THREE.Object3D {
  // 車流機車：一部分是 foodpanda 外送車（模型載好才會有）
  const fp = kind === "scooter" ? modelPools.get("foodpanda") : undefined;
  if (fp && fp.length > 0 && Math.random() < sc.foodpanda.chance) return fp[0].clone(true);
  const pool = modelPools.get(kind);
  if (pool && pool.length > 0) {
    return pool[Math.floor(Math.random() * pool.length)].clone(true);
  }
  const size = sizeOf(kind);
  let geo = boxGeometries.get(kind);
  if (!geo) {
    geo = new THREE.BoxGeometry(size.x, size.y, size.z);
    boxGeometries.set(kind, geo);
  }
  return new THREE.Mesh(geo, new THREE.MeshLambertMaterial({ color }));
}

// ── 車頭燈光暈 ──
// 平貼在地面的一片漸層（靠車頭亮、往前淡出、左右柔邊），用加色混合疊在路面上。
// 貼圖與材質全部共用，每台車只多一個 mesh（一次繪製）
let glowMat: THREE.MeshBasicMaterial | null = null;
let glowGeo: THREE.PlaneGeometry | null = null;
function headlightMaterial(): THREE.MeshBasicMaterial {
  if (glowMat) return glowMat;
  const c = TUNING.headlight;
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(64, 128);
  const smooth = (a: number, b: number, v: number) => {
    const k = Math.min(1, Math.max(0, (v - a) / (b - a)));
    return k * k * (3 - 2 * k);
  };
  for (let y = 0; y < 128; y++) {
    const t = y / 127; // 0 = 靠車頭、1 = 最遠
    const along = 1 - smooth(0.55, 1, t); // 前 55% 全亮，之後平滑淡到 0（從後方看，車身會擋住車頭那段，遠端要夠亮）
    const spread = 0.6 + 0.4 * Math.min(1, t / 0.5); // 車頭處就有六成寬，到一半處開到全寬
    for (let x = 0; x < 64; x++) {
      const u = Math.abs((x / 63 - 0.5) * 2); // 0 = 中線、1 = 邊緣
      const edge = 1 - smooth(spread * 0.55, spread, u); // 左右柔邊
      const a = along * edge;
      const i = (y * 64 + x) * 4;
      img.data[i] = 255;
      img.data[i + 1] = 255;
      img.data[i + 2] = 255;
      img.data[i + 3] = a * 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  glowMat = new THREE.MeshBasicMaterial({
    map: tex,
    color: c.color,
    transparent: true,
    opacity: c.opacity,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  return glowMat;
}

// 掛在車 mesh 底下的光暈：mesh 原點＝碰撞箱中心、車頭朝本地 +Z（同向車整台轉了 180°，本地 +Z 就是世界 -Z）
export function makeHeadlightGlow(size: Size3, scale = 1): THREE.Mesh {
  const c = TUNING.headlight;
  glowGeo ??= new THREE.PlaneGeometry(1, 1);
  const mesh = new THREE.Mesh(glowGeo, headlightMaterial());
  const len = c.length * scale;
  const wid = c.width * scale;
  mesh.rotation.x = -Math.PI / 2; // 平貼地面；canvas 上緣（亮端）是 v=1 → 平面 +y → 轉完後在 -Z 端，也就是貼著車頭那端亮
  mesh.scale.set(wid, len, 1);
  mesh.position.set(0, -size.y / 2 + 0.03, size.z / 2 + len / 2); // 地面上方一點點，從車頭往前鋪
  mesh.renderOrder = 1; // 路面之後畫（透明疊加）
  return mesh;
}
