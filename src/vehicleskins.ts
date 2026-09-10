// 車輛外觀管線：3D 模型（Kenney Car Kit GLB）→ 純色方塊 fallback。
// 模型放 public/assets/models/vehicles/<名>.glb（外部貼圖在同層 Textures/）。
//
// 每種車有一個「款式池」（轎車/計程車/警車…），生成時隨機抽一款，
// 街景自動有變化。模型會等比縮放到 tuning.ts 碰撞箱的長度、貼齊地面，
// 所以視覺跟判定永遠對得上。Kenney 模型車頭朝 +Z，跟迎面車朝向一致。
// 還沒有模型的車種（scooter / bike）自動用純色方塊，補上 glb 就換。

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
};

// 載好並「規格化」（縮放到碰撞箱、置中、貼地）的模型原型，clone 出去用
const modelPools = new Map<string, THREE.Object3D[]>();
// 純色方塊 fallback 用的幾何
const boxGeometries = new Map<string, THREE.BoxGeometry>();

function sizeOf(kind: string): Size3 {
  if (kind === "bike") return TUNING.bike.size;
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
          const proto = normalize(gltf.scene, size);
          let pool = modelPools.get(kind);
          if (!pool) modelPools.set(kind, (pool = []));
          pool.push(proto);
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
