// 車輛外觀管線：3D 模型（Kenney Car Kit GLB）→ 純色方塊 fallback。
// 模型放 public/assets/models/vehicles/<名>.glb（外部貼圖在同層 Textures/）。
//
// 每種車有一個「款式池」（轎車/計程車/警車…），生成時隨機抽一款，
// 街景自動有變化。模型會等比縮放到 tuning.ts 碰撞箱的長度、貼齊地面，
// 所以視覺跟判定永遠對得上。Kenney 模型車頭朝 +Z，跟迎面車朝向一致。
// 還沒有模型的車種（bike）自動用純色方塊，補上 glb 就換。
// 機車的車身（motor1 紅、gogoro 白）在載入時換成多種顏色，一色一款（recolorVariants）。

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
  // 停放機車（機車格、人行道路障）：gogoro（白車身），白色換成 scooter.parkedColors，一色一款
  parkedScooter: ["gogoro"],
};
// 車頭不是朝 +Z 的模型，載入時先繞 Y 軸轉正（弧度）。motor1 車頭朝 +X → -90°；gogoro 朝 -X → +90°
const MODEL_ROTATION_Y: Record<string, number> = {
  motor1: -Math.PI / 2,
  gogoro: Math.PI / 2,
};
// 車身換色設定：哪些像素算「車身」（用 HSL 判定）、要換成哪些顏色
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
};

// 載好並「規格化」（縮放到碰撞箱、置中、貼地）的模型原型，clone 出去用
const modelPools = new Map<string, THREE.Object3D[]>();
// 純色方塊 fallback 用的幾何
const boxGeometries = new Map<string, THREE.BoxGeometry>();

function sizeOf(kind: string): Size3 {
  if (kind === "bike") return TUNING.bike.size;
  if (kind === "parkedScooter") {
    // 停放機車：模型以「車頭朝 +Z」規格化，長度 = 停車格 blockSize 的 x（擺的時候會轉 90°）
    const b = TUNING.parking.types.scooter.blockSize;
    return { x: b.z, y: b.y, z: b.x };
  }
  return TUNING.vehicles[kind as keyof typeof TUNING.vehicles].size;
}

export function preloadVehicleSkins(): void {
  const gltfLoader = new GLTFLoader();
  for (const [kind, names] of Object.entries(MODEL_VARIANTS)) {
    const size = sizeOf(kind);
    for (const name of names) {
      const url = `${import.meta.env.BASE_URL}assets/models/vehicles/${name}.glb`;
      gltfLoader.load(
        url,
        (gltf) => {
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
        () => {}, // 檔案不在 = 這款不用，正常
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

  const tmp = new THREE.Color();
  return cfg.colors.map((hex) => {
    tmp.set(hex);
    const [th, ts, tl] = rgbToHsl(tmp.r, tmp.g, tmp.b);
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

// 對外唯一入口：生一台車的外觀（原點＝碰撞箱中心）。
// color 只在還沒有模型的車種（純色方塊 fallback）派上用場。
export function makeVehicleMesh(kind: string, color: number): THREE.Object3D {
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
