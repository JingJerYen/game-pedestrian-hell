// 車輛貼皮：「貼圖箱子」＋白車底圖程式上色。
// 素材放 public/assets/vehicles/，檔名：<車種>_front.png / _back.png / _side.png
// （車種 = scooter / car / truck / bike）。規格見該資料夾的 README.md。
//
// 三張圖都到齊的車種才會換皮；缺圖的車種自動維持現在的純色方塊，
// 所以素材可以一張車種一張車種慢慢進場，遊戲永遠是完整的。
//
// 「白車底圖」：車身畫白色/淡灰、車窗輪胎畫深色。程式會把調色盤的車色
// 乘上貼圖（白 × 顏色 = 顏色、深色 × 顏色 ≈ 深色），一套圖變出所有車色。

import * as THREE from "three";
import { TUNING } from "./tuning";

const FACES = ["front", "back", "side"] as const;

// 已載入的貼圖：<kind>_<face> → Texture
const textures = new Map<string, THREE.Texture>();
// 材質共用：「車種 × 車色」同組合只建一份
const materialCache = new Map<string, THREE.Material[]>();

// 啟動時預載所有車種的貼圖；檔案不存在就靜靜略過（保持色塊）
export function preloadVehicleSkins(): void {
  const loader = new THREE.TextureLoader();
  const kinds = [...Object.keys(TUNING.vehicles), "bike"];
  for (const kind of kinds) {
    for (const face of FACES) {
      const url = `${import.meta.env.BASE_URL}assets/vehicles/${kind}_${face}.png`;
      loader.load(
        url,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.magFilter = THREE.NearestFilter; // 像素圖放大保持銳利不糊
          textures.set(`${kind}_${face}`, tex);
          materialCache.clear(); // 之後生成的車立刻拿到新皮
        },
        undefined,
        () => {}, // 404 = 素材還沒放，正常
      );
    }
  }
}

// 這種車此顏色的材質：貼圖齊全 → 六面材質陣列；沒圖 → 純色方塊（現狀）
export function vehicleMaterial(
  kind: string,
  color: number,
): THREE.Material | THREE.Material[] {
  const front = textures.get(`${kind}_front`);
  const back = textures.get(`${kind}_back`);
  const side = textures.get(`${kind}_side`);
  if (!front || !back || !side) {
    return new THREE.MeshLambertMaterial({ color });
  }
  const key = `${kind}_${color}`;
  let mats = materialCache.get(key);
  if (!mats) {
    // alphaTest：貼圖的透明部分直接剪掉（把箱子剪出車的輪廓，不再方方正正）
    const tinted = (map: THREE.Texture) =>
      new THREE.MeshLambertMaterial({ map, color, alphaTest: 0.5 });
    // 側面圖車頭朝右畫；另一側用鏡像，兩側車頭才會朝同一個方向
    const mirrored = side.clone();
    mirrored.wrapS = THREE.RepeatWrapping;
    mirrored.repeat.x = -1;
    const top = new THREE.MeshLambertMaterial({ color });
    // BoxGeometry 面順序：+x(右側) -x(左側) +y(頂) -y(底) +z(車頭) -z(車尾)
    mats = [
      tinted(side),
      tinted(mirrored),
      top,
      top,
      tinted(front),
      tinted(back),
    ];
    materialCache.set(key, mats);
  }
  return mats;
}
