// 行人角色管線：Kenney Mini Characters（含骨架動畫）＋輪椅模型。
// 素材在 public/assets/models/characters/；12 款角色，每次組裝隨機抽一位。
// 動畫剪輯（walk / idle / die / wheelchair-* …）跟著模型一起載入，
// player.ts 透過 CharacterRig.actions 播放。
// 模型還沒載好時回傳 null，player.ts 會先用色塊撐著，載好自動換裝。

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { clone as cloneSkeleton } from "three/examples/jsm/utils/SkeletonUtils.js";
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
    // 嬰兒車佔位：推在身前的小方塊（素材到位後換成真的嬰兒車模型）
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(0.55, 0.75, 0.85),
      new THREE.MeshLambertMaterial({ color: 0x8a94a3 }),
    );
    // root 已轉 180 度，root 座標的 +z 是玩家的前進方向
    box.position.set(0, -size.y / 2 + 0.375, size.z / 2 - 0.45);
    root.add(box);
    model.position.z -= size.z / 2 - 0.5; // 人往後站，空間留給嬰兒車
  }

  const mixer = new THREE.AnimationMixer(model);
  const actions = new Map<string, THREE.AnimationAction>();
  for (const clip of src.clips) {
    actions.set(clip.name, mixer.clipAction(clip));
  }
  return { root, mixer, actions };
}
