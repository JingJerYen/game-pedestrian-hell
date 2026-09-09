// 「皮」的集中掛載點：之後要換素材的世界裝飾都從這裡生成。
// 換皮 = 改這個檔案對應的 factory（載貼圖、換 sprite），遊戲邏輯不用動。
// （車輛/玩家/路障的皮不在這裡，掛載點在 traffic/player/obstacles 各自的 mesh 生成處。）

import * as THREE from "three";

// ── 斑馬線 ──
// 現在是一根根白色枕木紋；之後想換整片貼圖，就把 bars 換成一張 PlaneGeometry + map。
const PAINT = new THREE.MeshBasicMaterial({ color: 0xdddddd });
const BAR_ACROSS_GEO = new THREE.PlaneGeometry(0.45, 2.4);
const BAR_FORWARD_GEO = new THREE.PlaneGeometry(2.4, 0.45);

// 橫越主路的斑馬線（東西向走的）
export function makeZebraAcross(fromX: number, toX: number): THREE.Group {
  const group = new THREE.Group();
  for (let x = fromX + 0.5; x < toX; x += 0.95) {
    const bar = new THREE.Mesh(BAR_ACROSS_GEO, PAINT);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(x, 0.112, 0);
    group.add(bar);
  }
  return group;
}

// 行人直行的斑馬線（人行道延伸段）
export function makeZebraForward(centerX: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  for (let z = -depth / 2 + 0.8; z < depth / 2 - 0.3; z += 0.95) {
    const bar = new THREE.Mesh(BAR_FORWARD_GEO, PAINT);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(centerX, 0.112, z);
    group.add(bar);
  }
  return group;
}

// ── 車道路面標記（「慢」、速限「50」…）──
// placeholder 用 canvas 畫字；之後換素材就把 map 換成 TextureLoader 載入的 PNG。
// 成對出現、字向哪邊由 world.ts 控制，這裡只管長相。
function makeMarkTexture(label: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 256;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 100px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.translate(64, 128);
  ctx.scale(1, 1.9); // 路面標字都是拉長的，從低視角看才是正的
  ctx.fillText(label, 0, 0, 116); // maxWidth：兩位數的「50」也塞得下
  return new THREE.CanvasTexture(canvas);
}

const MARK_GEO = new THREE.PlaneGeometry(1.7, 3.4);
const markMaterials = new Map<string, THREE.MeshBasicMaterial>();

// 同一種字共用一份材質（world 換字時直接換材質）
export function roadMarkMaterial(label: string): THREE.MeshBasicMaterial {
  let mat = markMaterials.get(label);
  if (!mat) {
    mat = new THREE.MeshBasicMaterial({
      map: makeMarkTexture(label),
      transparent: true,
      opacity: 0.85,
    });
    markMaterials.set(label, mat);
  }
  return mat;
}

export function makeRoadMark(label: string): THREE.Mesh {
  const mark = new THREE.Mesh(MARK_GEO, roadMarkMaterial(label));
  mark.rotation.x = -Math.PI / 2;
  mark.position.y = 0.015;
  return mark;
}

// ── 紅綠燈 ──
// placeholder：柱子＋燈箱，永遠亮綠燈（本遊戲的規則）。之後換 sprite/模型就改這裡。
const POLE_GEO = new THREE.CylinderGeometry(0.07, 0.07, 3.6, 8);
const POLE_MAT = new THREE.MeshLambertMaterial({ color: 0x55595f });
const HEAD_GEO = new THREE.BoxGeometry(0.42, 1.05, 0.3);
const HEAD_MAT = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
const LAMP_GEO = new THREE.CircleGeometry(0.11, 12);
const LAMP_MATS = [0x661111, 0x665511, 0x2ecc40].map(
  (color) => new THREE.MeshBasicMaterial({ color }), // 紅黃暗、綠恆亮
);

export function makeTrafficLight(): THREE.Group {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(POLE_GEO, POLE_MAT);
  pole.position.y = 1.8;
  group.add(pole);
  const head = new THREE.Mesh(HEAD_GEO, HEAD_MAT);
  head.position.y = 3.9;
  group.add(head);
  LAMP_MATS.forEach((mat, i) => {
    const lamp = new THREE.Mesh(LAMP_GEO, mat);
    lamp.position.set(0, 4.22 - i * 0.32, 0.16); // 面向鏡頭（+Z）
    group.add(lamp);
  });
  return group;
}

// ── 路旁建築 ──
// 之後貼皮：把單一材質換成六面材質陣列（正面招牌、側面牆），或整個換成模型。
export function makeBuilding(w: number, h: number, depth: number): THREE.Mesh {
  return new THREE.Mesh(
    new THREE.BoxGeometry(w, h, depth),
    new THREE.MeshLambertMaterial({
      color: new THREE.Color().setHSL(Math.random(), 0.25, 0.55),
    }),
  );
}

// ── 目的地建築（每關終點）──
// placeholder：亮色大樓＋canvas 畫的招牌；之後每種目的地（公司/醫院/托嬰中心…）
// 依 label 換成自己的貼皮或模型，就改這個 factory。
function makeSignTexture(label: string): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, 512, 128);
  ctx.strokeStyle = "#b03030";
  ctx.lineWidth = 10;
  ctx.strokeRect(5, 5, 502, 118);
  ctx.fillStyle = "#1a3a6b";
  ctx.font = "bold 88px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, 256, 70);
  return new THREE.CanvasTexture(canvas);
}

export function makeDestinationBuilding(label: string): THREE.Group {
  const group = new THREE.Group();
  const w = 9;
  const h = 12;
  const d = 10;
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: 0xf0e3c0 }),
  );
  body.position.y = h / 2;
  group.add(body);
  // 招牌放在面向鏡頭的那一面（+Z），玩家一路走過去都讀得到
  const sign = new THREE.Mesh(
    new THREE.PlaneGeometry(6.4, 1.6),
    new THREE.MeshBasicMaterial({ map: makeSignTexture(label) }),
  );
  sign.position.set(0, h * 0.72, d / 2 + 0.02);
  group.add(sign);
  return group;
}
