// 行人角色管線：Kenney Mini Characters（含骨架動畫）＋輪椅模型。
// 素材在 public/assets/models/characters/；12 款角色，每次組裝隨機抽一位。
// 動畫剪輯（walk / idle / die / wheelchair-* …）跟著模型一起載入，
// player.ts 透過 CharacterRig.actions 播放。
// 模型還沒載好時回傳 null，player.ts 會先用色塊撐著，載好自動換裝。

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { PlayerForm } from "./tuning";
import type { Size3 } from "./collision";

const CHARACTERS = [
  "character-male-a", "character-male-b", "character-male-c",
  "character-male-d", "character-male-e", "character-male-f",
  "character-female-a", "character-female-b", "character-female-c",
  "character-female-d", "character-female-e", "character-female-f",
];

interface LoadedCharacter {
  scene: THREE.Object3D;
  clips: THREE.AnimationClip[];
}

const loaded: LoadedCharacter[] = [];
let wheelchairModel: THREE.Object3D | null = null;

export function preloadCharacters(): void {
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}assets/models/characters/`;
  for (const name of CHARACTERS) {
    loader.load(
      `${base}${name}.glb`,
      (gltf) => loaded.push({ scene: gltf.scene, clips: gltf.animations }),
      undefined,
      () => {},
    );
  }
  loader.load(
    `${base}wheelchair.glb`,
    (gltf) => (wheelchairModel = gltf.scene),
    undefined,
    () => {},
  );
}

export function charactersReady(form: PlayerForm): boolean {
  if (loaded.length === 0) return false;
  return form !== "wheelchair" || wheelchairModel !== null;
}

export interface CharacterRig {
  root: THREE.Object3D; // 掛進 player 外層（原點＝碰撞箱中心）
  mixer: THREE.AnimationMixer;
  actions: Map<string, THREE.AnimationAction>;
}

// 組一個行人：隨機抽角色、縮放到碰撞箱高度、腳貼碰撞箱底、面向 -Z（前進方向）。
// 輪椅型態加掛輪椅模型；嬰兒車型態先推一個佔位小方塊（等嬰兒車素材）。
export function makeCharacterRig(
  form: PlayerForm,
  size: Size3,
): CharacterRig | null {
  if (!charactersReady(form)) return null;
  const src = loaded[Math.floor(Math.random() * loaded.length)];
  const model = cloneSkeleton(src.scene);
  // 骨架模型的包圍框用綁定姿勢算，某些鏡頭角度（直式俯視特別容易）會被
  // 誤判在畫面外而整隻消失——關閉剔除，玩家只有一隻，零效能代價
  model.traverse((obj) => (obj.frustumCulled = false));

  const bbox = new THREE.Box3().setFromObject(model);
  const height = bbox.max.y - bbox.min.y;
  // 站立高度貼齊碰撞箱；輪椅是坐姿（比站立矮），放大一點視覺才不會太小隻
  const scale = (size.y / height) * (form === "wheelchair" ? 1.15 : 1);

  const root = new THREE.Group();
  root.rotation.y = Math.PI; // 面向 -Z：玩家前進方向，鏡頭看到背影

  model.scale.setScalar(scale);
  const scaled = new THREE.Box3().setFromObject(model);
  const center = new THREE.Vector3();
  scaled.getCenter(center);
  model.position.set(-center.x, -size.y / 2 - scaled.min.y, -center.z);
  root.add(model);

  if (form === "wheelchair" && wheelchairModel) {
    const chair = wheelchairModel.clone(true);
    chair.scale.setScalar(scale);
    const cb = new THREE.Box3().setFromObject(chair);
    const cc = new THREE.Vector3();
    cb.getCenter(cc);
    chair.position.set(-cc.x, -size.y / 2 - cb.min.y, -cc.z);
    root.add(chair);
  }
  if (form === "stroller") {
    // 嬰兒車：程式組的積木風模型（makeStroller），推在身前；root 座標的 +z 是玩家的前進方向
    const stroller = makeStroller();
    stroller.position.set(0, -size.y / 2, size.z / 2 - 0.9); // 地面高度、車廂前緣貼齊碰撞箱前緣
    root.add(stroller);
    model.position.z -= size.z / 2 - 0.5; // 人往後站，空間留給嬰兒車
  }

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of src.clips) {
    actions.set(clip.name, mixer.clipAction(clip));
  }
  return { root, mixer, actions };
}

// ── 嬰兒車（積木風，跟 Kenney 角色同一種畫風）──
// 原點在地面、+z 是前進方向；車廂前緣在 z≈0.9、推把在 z≈0（靠人）。
// 全部用方塊和圓柱拼，同色的合併成一個 mesh（4 種顏色 = 4 次繪製）
const STROLLER_COLORS = {
  body: 0x2f5d8a, // 車廂／遮陽篷（深藍）
  trim: 0x6f9fd0, // 遮陽篷邊、椅墊（淺藍）
  frame: 0xb8bcc2, // 骨架、推把（銀灰）
  wheel: 0x2a2a2e, // 輪子、握把（黑）
};
function makeStroller(): THREE.Group {
  const parts: Record<keyof typeof STROLLER_COLORS, THREE.BufferGeometry[]> = { body: [], trim: [], frame: [], wheel: [] };
  const box = (k: keyof typeof STROLLER_COLORS, w: number, h: number, d: number, x: number, y: number, z: number, tiltX = 0) => {
    const g = new THREE.BoxGeometry(w, h, d);
    if (tiltX) g.rotateX(tiltX);
    g.translate(x, y, z);
    parts[k].push(g);
  };
  // 沿某方向的細桿：從 a 到 b 的圓柱
  const rod = (k: keyof typeof STROLLER_COLORS, r: number, a: THREE.Vector3, b: THREE.Vector3) => {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    const g = new THREE.CylinderGeometry(r, r, len, 8);
    g.applyMatrix4(
      new THREE.Matrix4().makeRotationFromQuaternion(
        new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize()),
      ),
    );
    g.translate((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
    parts[k].push(g);
  };
  // 輪子：軸沿 x 的圓柱（在 z 方向滾）
  const wheel = (r: number, x: number, y: number, z: number) => {
    const g = new THREE.CylinderGeometry(r, r, 0.05, 14);
    g.rotateZ(Math.PI / 2);
    g.translate(x, y, z);
    parts.wheel.push(g);
    const hub = new THREE.CylinderGeometry(r * 0.35, r * 0.35, 0.06, 8);
    hub.rotateZ(Math.PI / 2);
    hub.translate(x, y, z);
    parts.frame.push(hub);
  };
  const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

  // 車廂：微微向後仰的深盒，裡面一片淺色椅墊
  box("body", 0.5, 0.28, 0.62, 0, 0.6, 0.55, -0.12);
  box("trim", 0.42, 0.04, 0.5, 0, 0.72, 0.55, -0.12);
  // 遮陽篷：前上方一塊往前突出的弧狀盒（用兩塊疊出弧感）
  box("body", 0.54, 0.16, 0.34, 0, 0.9, 0.7);
  box("body", 0.52, 0.1, 0.2, 0, 0.98, 0.58, 0.25);
  box("trim", 0.56, 0.03, 0.36, 0, 0.83, 0.7);
  // 置物籃：下方一個扁盒
  box("trim", 0.4, 0.1, 0.4, 0, 0.3, 0.5);
  // 骨架：車廂四角往下到輪軸，前後各兩根
  for (const sx of [-1, 1]) {
    rod("frame", 0.015, V(sx * 0.22, 0.5, 0.82), V(sx * 0.24, 0.1, 0.85)); // 前腳
    rod("frame", 0.015, V(sx * 0.22, 0.5, 0.28), V(sx * 0.24, 0.13, 0.25)); // 後腳
    rod("frame", 0.015, V(sx * 0.24, 0.12, 0.25), V(sx * 0.24, 0.1, 0.85)); // 底桿
    // 推把：從車廂後上角斜向上、向後到人手邊
    rod("frame", 0.016, V(sx * 0.22, 0.62, 0.3), V(sx * 0.2, 0.98, 0.02));
  }
  rod("wheel", 0.022, V(-0.22, 0.98, 0.02), V(0.22, 0.98, 0.02)); // 握把橫桿
  // 輪子：前小後大
  wheel(0.09, -0.27, 0.09, 0.85);
  wheel(0.09, 0.27, 0.09, 0.85);
  wheel(0.12, -0.27, 0.12, 0.25);
  wheel(0.12, 0.27, 0.12, 0.25);

  const group = new THREE.Group();
  for (const k of Object.keys(parts) as (keyof typeof STROLLER_COLORS)[]) {
    if (!parts[k].length) continue;
    const mesh = new THREE.Mesh(mergeGeometries(parts[k]), new THREE.MeshLambertMaterial({ color: STROLLER_COLORS[k] }));
    mesh.frustumCulled = false; // 跟角色一樣，玩家只有一台，別被誤判剔除
    group.add(mesh);
  }
  return group;
}
