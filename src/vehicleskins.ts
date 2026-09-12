// 車輛外觀管線：3D 模型（Kenney Car Kit GLB）→ 純色方塊 fallback。
// 模型放 public/assets/models/vehicles/<名>.glb（外部貼圖在同層 Textures/）。
//
// 每種車有一個「款式池」（轎車/計程車/警車…），生成時隨機抽一款，
// 街景自動有變化。單一模型也能靠「換色」生出多款（MODEL_RECOLOR，機車就是）。模型會等比縮放到 tuning.ts 碰撞箱的長度、貼齊地面，
// 所以視覺跟判定永遠對得上。Kenney 模型車頭朝 +Z，跟迎面車朝向一致。
// 還沒有模型的車種（bike）自動用純色方塊，補上 glb 就換。

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
  // 車流機車：motor1 = Tripo 生成的速克達（含騎士）。只給車流用——上面有人，不當停放的車
  scooter: ["motor1"],
  // 停放機車（機車停車格裡的）：gogoro = Meshy 生成的 Gogoro，沒騎士。頂點色輪胎/座椅黑、
  // 其餘白，靠 MODEL_TINT 染成各種車身色。車頭朝 +Z 版本，obstacles.ts 擺的時候轉成橫停
  parkedScooter: ["gogoro"],
};
// 車頭不是朝 +Z 的模型，載入時先繞 Y 軸轉正（弧度）。motor1 車頭朝 +X → -90°；gogoro 朝 -X → +90°
const MODEL_ROTATION_Y: Record<string, number> = {
  motor1: -Math.PI / 2,
  gogoro: Math.PI / 2,
};
// 模型染色：頂點色是白色的部位會被染成調色盤的顏色（黑色部位不受影響），每個顏色一款
const MODEL_TINT: Record<string, readonly number[]> = {
  gogoro: TUNING.vehicles.scooter.gogoroColors,
};

// 把一個模型原型變成多款染色的原型（材質 clone 後設 color；幾何共用）
function tintVariants(proto: THREE.Object3D, colors: readonly number[]): THREE.Object3D[] {
  return colors.map((hex) => {
    const variant = proto.clone(true);
    variant.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      const m = (mesh.material as THREE.MeshStandardMaterial).clone();
      m.color.set(hex);
      m.roughness = 0.45; // 烤漆感：預設 1.0 太霧，顏色會顯得髒
      mesh.material = m;
    });
    return variant;
  });
}

// 模型換色：貼圖上某個色相帶的像素（例如紅色車身、藍色衣服）換成調色盤的顏色，
// 保留原本的明暗變化，一次生出多款配色的原型。只處理 baseColor 貼圖，法線/粗糙度共用。
interface RecolorBand {
  hueMin: number; // 色相帶（度，可以是負的表示跨過 0，例如 -30~25 = 紅色）
  hueMax: number;
  minSat: number; // 飽和度低於這個不算（灰、白、黑不動）
  colors: readonly number[]; // 目標調色盤
}
const MODEL_RECOLOR: Record<string, { variants: number; bands: RecolorBand[] }> = {
  motor1: {
    variants: TUNING.vehicles.scooter.recolorVariants,
    bands: [
      { hueMin: -30, hueMax: 25, minSat: 0.3, colors: TUNING.vehicles.scooter.colors }, // 紅 = 車身
      { hueMin: 170, hueMax: 240, minSat: 0.2, colors: TUNING.vehicles.scooter.riderColors }, // 藍 = 騎士衣服
    ],
  },
};

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

// 把一個模型原型變成多款配色的原型。找不到可處理的貼圖就原樣回傳一款
function recolorVariants(proto: THREE.Object3D, cfg: { variants: number; bands: RecolorBand[] }): THREE.Object3D[] {
  let source: THREE.MeshStandardMaterial | null = null;
  proto.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!source && mesh.isMesh) {
      const m = mesh.material as THREE.MeshStandardMaterial;
      if (m?.isMeshStandardMaterial && m.map?.image) source = m;
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

  // 第一遍：每個像素屬於哪個色相帶，順便算各帶的平均飽和度/亮度（換色時當基準）
  const bandOf = new Int8Array(n).fill(-1);
  const hsl = new Float32Array(n * 3);
  const sumS = cfg.bands.map(() => 0);
  const sumL = cfg.bands.map(() => 0);
  const count = cfg.bands.map(() => 0);
  for (let i = 0; i < n; i++) {
    const [hh, ss, ll] = rgbToHsl(base.data[i * 4] / 255, base.data[i * 4 + 1] / 255, base.data[i * 4 + 2] / 255);
    hsl[i * 3] = hh;
    hsl[i * 3 + 1] = ss;
    hsl[i * 3 + 2] = ll;
    for (let k = 0; k < cfg.bands.length; k++) {
      const band = cfg.bands[k];
      if (ss < band.minSat) continue;
      const rel = (((hh - band.hueMin) % 360) + 360) % 360;
      if (rel <= band.hueMax - band.hueMin) {
        bandOf[i] = k;
        sumS[k] += ss;
        sumL[k] += ll;
        count[k]++;
        break;
      }
    }
  }
  const refS = sumS.map((v, k) => (count[k] ? v / count[k] : 0.5));
  const refL = sumL.map((v, k) => (count[k] ? v / count[k] : 0.4));

  const out: THREE.Object3D[] = [];
  const tmp = new THREE.Color();
  for (let v = 0; v < cfg.variants; v++) {
    // 目標色：第一帶（車身）依序輪，其他帶隨機——每款車身色都會出現
    const targets = cfg.bands.map((band, k) => {
      const hex = k === 0 ? band.colors[v % band.colors.length] : band.colors[Math.floor(Math.random() * band.colors.length)];
      tmp.set(hex);
      return rgbToHsl(tmp.r, tmp.g, tmp.b);
    });
    const img = ctx.createImageData(w, h);
    img.data.set(base.data);
    for (let i = 0; i < n; i++) {
      const k = bandOf[i];
      if (k < 0) continue;
      const [th, ts, tl] = targets[k];
      const s2 = Math.min(1, ts * (hsl[i * 3 + 1] / refS[k]));
      const l2 = Math.min(1, Math.max(0, hsl[i * 3 + 2] + (tl - refL[k])));
      const [r, g, b] = hslToRgb(th, s2, l2);
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
    tex.channel = src.map!.channel;
    const mat = src.clone();
    mat.map = tex;
    const variant = proto.clone(true);
    variant.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.isMesh && mesh.material === src) mesh.material = mat;
    });
    out.push(variant);
  }
  return out;
}

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
          const recolor = MODEL_RECOLOR[name];
          const tint = MODEL_TINT[name];
          if (recolor) pool.push(...recolorVariants(proto, recolor));
          else if (tint) pool.push(...tintVariants(proto, tint));
          else pool.push(proto);
        },
        undefined,
        () => {}, // 檔案不在 = 這款不用，正常
      );
    }
  }
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
