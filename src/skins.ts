// 「皮」的集中掛載點：之後要換素材的世界裝飾都從這裡生成。
// 換皮 = 改這個檔案對應的 factory（載貼圖、換 sprite），遊戲邏輯不用動。
// （車輛/玩家/路障的皮不在這裡，掛載點在 traffic/player/obstacles 各自的 mesh 生成處。）

import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { TUNING } from "./tuning";


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

// 行人直行的斑馬線（人行道延伸段）：鋪滿整段橫向路面，長度跟著路口縱深走
export function makeZebraForward(centerX: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  const half = depth / 2;
  for (let z = -half + 0.6; z < half - 0.3; z += 0.95) {
    const bar = new THREE.Mesh(BAR_FORWARD_GEO, PAINT);
    bar.rotation.x = -Math.PI / 2;
    bar.position.set(centerX, 0.112, z);
    group.add(bar);
  }
  return group;
}

// ── 人行道鋪面 ──
// 預設鋪面：綠色（台灣標線型人行道）。之後換真鋪面貼圖就改這裡。
const SIDEWALK_MAT = new THREE.MeshLambertMaterial({ color: 0x4e8a5c });
export function sidewalkMaterial(): THREE.Material {
  return SIDEWALK_MAT;
}

// 人行道上的直排「人行道」白字（裝飾）。
// 字頂朝 -Z（玩家前方），從玩家視角由上往下讀「人／行／道」，方向才是對的。
function makeSidewalkMarkTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 160;
  canvas.height = 470;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 140px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ["人", "行", "道"].forEach((ch, i) => {
    ctx.fillText(ch, 80, 90 + i * 150);
  });
  return new THREE.CanvasTexture(canvas);
}
export const SIDEWALK_MARK_LENGTH = 6.75; // 字的縱向長度（world.ts 隱藏判定用）
const SIDEWALK_MARK_GEO = new THREE.PlaneGeometry(2.3, SIDEWALK_MARK_LENGTH);
const SIDEWALK_MARK_MAT = new THREE.MeshBasicMaterial({
  map: makeSidewalkMarkTexture(),
  transparent: true,
  opacity: 0.9,
});
export function makeSidewalkMark(): THREE.Mesh {
  const mark = new THREE.Mesh(SIDEWALK_MARK_GEO, SIDEWALK_MARK_MAT);
  mark.rotation.x = -Math.PI / 2; // rotation.z 保持 0：字頂朝 -Z，玩家讀起來是正的
  mark.position.y = 0.09; // 疊在人行道（0.08）上
  return mark;
}

// ── 停車格鋪面（人行道靠馬路那半邊換成黑底白格線）──
// 兩種：機車格（瘦窄）、汽車格（長條）。canvas 畫格線當貼圖，
// 之後換真鋪面素材就改這張圖。
const parkingMaterials = new Map<string, THREE.MeshLambertMaterial>();
function parkingMaterial(kind: string, stalls: number): THREE.MeshLambertMaterial {
  const key = `${kind}:${stalls}`;
  let mat = parkingMaterials.get(key);
  if (!mat) {
    const perStall = kind === "car" ? 128 : 64; // 汽車格（直停）深、機車格淺，比例才對
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = stalls * perStall;
    const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#1b1c1f"; // 黑色鋪面
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#e8e8e8"; // 白色停車格線
    ctx.lineWidth = 5;
    for (let i = 0; i < stalls; i++) {
      ctx.strokeRect(6, i * perStall + 4, 116, perStall - 8);
    }
    mat = new THREE.MeshLambertMaterial({ map: new THREE.CanvasTexture(canvas) });
    parkingMaterials.set(key, mat);
  }
  return mat;
}

export function makeParkingPavement(
  kind: "scooter" | "car",
  stalls: number,
  stallDepth: number,
  width: number,
): THREE.Group {
  const group = new THREE.Group();
  const pave = new THREE.Mesh(
    new THREE.PlaneGeometry(width, stalls * stallDepth),
    parkingMaterial(kind, stalls),
  );
  pave.rotation.x = -Math.PI / 2;
  pave.position.y = 0.085; // 貼在人行道面（0.08）上，視覺上是鋪面換掉
  group.add(pave);
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

// ── 行人紅綠燈（台灣式）──
// 燈箱兩格：上格倒數數字（LED 點陣、橘黃色）、下格小綠人走路。永遠綠燈（本遊戲的規則）。
// 數字 = 本關剩餘秒數（main.ts 的 timeLeft，經 intersections.update 傳進 updateSignals），最多顯示 99。
// 所有路口的燈共用同一張數字貼圖和同一格小綠人：canvas 一秒只重畫一次，小綠人只改 UV 偏移。
// 小綠人的圖：public/assets/decals/signals/greenman.png——橫排 TUNING.signal.greenmanFrames 格、
// 純黑底綠色人形、朝右走；檔案不在就用下面程式畫的火柴人頂著。倒數最後幾秒走得更快。
// 桿子：一根白色細桿（車用號誌另外設計中，先不放），行人燈箱＝程式蓋的黑盒＋兩片面板，掛在桿子正面。
// 尺寸是定案的外觀（與使用者確認過），不進 tuning
const SIG = TUNING.signal;
const POLE_HEIGHT = 3.3; // 白色細桿高度（公尺）
const POLE_RADIUS = 0.04;
const HEAD_HEIGHT = 2.8; // 燈箱中心離地
export const SIGNAL_FROM_CURB = 0.35; // 桿子立在人行道上、離路緣多遠（intersections.ts 擺位置用）
const POLE_GEO = new THREE.CylinderGeometry(POLE_RADIUS, POLE_RADIUS, POLE_HEIGHT, 10);
const POLE_MAT = new THREE.MeshLambertMaterial({ color: 0xf2f2f2 });
const HEAD_GEO = new THREE.BoxGeometry(0.46, 1.0, 0.3);
const HEAD_MAT = new THREE.MeshLambertMaterial({ color: 0x2c2f33 });
const PANEL_GEO = new THREE.PlaneGeometry(0.36, 0.36);
const LED_GREEN = "#3cff66"; // 小綠人
const LED_AMBER = "#ffb020"; // 倒數數字（台灣的行人燈數字是橘黃色）

// 上格：數字。先把兩位數用字型畫到 16×16 的小 canvas，再把亮的格子畫成圓點 → LED 點陣感
const DIGIT_GRID = 16;
const DIGIT_LOWRES = document.createElement("canvas");
DIGIT_LOWRES.width = DIGIT_LOWRES.height = DIGIT_GRID;
const DIGIT_CANVAS = document.createElement("canvas");
DIGIT_CANVAS.width = DIGIT_CANVAS.height = DIGIT_GRID * 8;
const DIGIT_TEX = new THREE.CanvasTexture(DIGIT_CANVAS);
DIGIT_TEX.colorSpace = THREE.SRGBColorSpace;
const DIGIT_MAT = new THREE.MeshBasicMaterial({ map: DIGIT_TEX }); // 自發光，不受燈光影響
let shownDigits = -1;
function drawDigits(n: number): void {
  const lc = DIGIT_LOWRES.getContext("2d")!;
  lc.clearRect(0, 0, DIGIT_GRID, DIGIT_GRID);
  lc.fillStyle = "#fff";
  lc.font = "bold 13px sans-serif";
  lc.textAlign = "center";
  lc.textBaseline = "middle";
  lc.fillText(String(n).padStart(2, "0"), DIGIT_GRID / 2, DIGIT_GRID / 2 + 0.5);
  const px = lc.getImageData(0, 0, DIGIT_GRID, DIGIT_GRID).data;
  const c = DIGIT_CANVAS.getContext("2d")!;
  c.fillStyle = "#000";
  c.fillRect(0, 0, DIGIT_CANVAS.width, DIGIT_CANVAS.height);
  c.fillStyle = LED_AMBER;
  const cell = DIGIT_CANVAS.width / DIGIT_GRID;
  for (let y = 0; y < DIGIT_GRID; y++) {
    for (let x = 0; x < DIGIT_GRID; x++) {
      if (px[(y * DIGIT_GRID + x) * 4 + 3] < 100) continue;
      c.beginPath();
      c.arc(x * cell + cell / 2, y * cell + cell / 2, cell * 0.4, 0, Math.PI * 2);
      c.fill();
    }
  }
  DIGIT_TEX.needsUpdate = true;
}

// 下格：小綠人。placeholder = 程式畫的火柴人走路循環（黑底綠線），橫排 greenmanFrames 格；
// greenman.png 載得到就整張換掉（同樣切成 greenmanFrames 格）
function drawPlaceholderGreenman(): HTMLCanvasElement {
  const F = SIG.greenmanFrames;
  const S = 64;
  const cv = document.createElement("canvas");
  cv.width = S * F;
  cv.height = S;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#000";
  c.fillRect(0, 0, cv.width, S);
  c.strokeStyle = LED_GREEN;
  c.fillStyle = LED_GREEN;
  c.lineWidth = 5;
  c.lineCap = "round";
  for (let i = 0; i < F; i++) {
    const ox = i * S + S / 2;
    const ph = (i / F) * Math.PI * 2; // 走路相位
    const swing = Math.sin(ph) * 0.55;
    c.beginPath();
    c.arc(ox, 12, 6, 0, Math.PI * 2); // 頭
    c.fill();
    c.beginPath();
    c.moveTo(ox, 18);
    c.lineTo(ox, 36); // 身體
    c.moveTo(ox, 22);
    c.lineTo(ox + Math.sin(ph) * 12, 32); // 手
    c.moveTo(ox, 22);
    c.lineTo(ox - Math.sin(ph) * 12, 32);
    c.moveTo(ox, 36);
    c.lineTo(ox + swing * 16 + 4, 54); // 腳（多開 4px，腳併攏那格才不會變一根棍子）
    c.moveTo(ox, 36);
    c.lineTo(ox - swing * 16 - 4, 54);
    c.stroke();
  }
  return cv;
}
function setupGreenmanTexture(tex: THREE.Texture): void {
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.repeat.set(1 / SIG.greenmanFrames, 1);
  tex.magFilter = THREE.NearestFilter; // 點陣感；圖如果很細緻可以拿掉
}
const GREENMAN_MAT = new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(drawPlaceholderGreenman()) });
setupGreenmanTexture(GREENMAN_MAT.map!);
new THREE.TextureLoader().load(
  `${import.meta.env.BASE_URL}assets/decals/signals/greenman.png`,
  (tex) => {
    setupGreenmanTexture(tex);
    GREENMAN_MAT.map = tex;
    GREENMAN_MAT.needsUpdate = true;
  },
  undefined,
  () => {}, // 沒圖 = 用火柴人，正常
);
let walkClock = 0;

export function makeTrafficLight(): THREE.Group {
  const group = new THREE.Group();
  const pole = new THREE.Mesh(POLE_GEO, POLE_MAT);
  pole.position.y = POLE_HEIGHT / 2;
  group.add(pole);
  // 行人燈箱：掛在桿子正面
  const headZ = POLE_RADIUS + 0.15;
  const y = HEAD_HEIGHT;
  const head = new THREE.Mesh(HEAD_GEO, HEAD_MAT);
  head.position.set(0, y, headZ);
  group.add(head);
  const digits = new THREE.Mesh(PANEL_GEO, DIGIT_MAT);
  digits.position.set(0, y + 0.26, headZ + 0.151); // 面向鏡頭（+Z）
  group.add(digits);
  const man = new THREE.Mesh(PANEL_GEO, GREENMAN_MAT);
  man.position.set(0, y - 0.22, headZ + 0.151);
  group.add(man);
  return group;
}

// 每幀呼叫（intersections.update）：數字 = 剩餘秒數，小綠人走路格數依剩餘秒數決定快慢
export function updateSignals(timeLeft: number, dt: number): void {
  const n = THREE.MathUtils.clamp(Math.ceil(timeLeft), 0, 99);
  if (n !== shownDigits) {
    shownDigits = n;
    drawDigits(n);
  }
  walkClock += dt * (timeLeft < SIG.hurryBelow ? SIG.hurryFps : SIG.walkFps);
  const frame = Math.floor(walkClock) % SIG.greenmanFrames;
  GREENMAN_MAT.map!.offset.x = frame / SIG.greenmanFrames;
}

// ── 車用號誌（程式畫的簡單版）──
// 灰色圓桿立在路緣、橫臂伸到車道上方、臂端一個橫向三燈燈頭（黑殼＋帽簷，前後兩面都有燈、綠燈恆亮），桿上掛綠底白字路牌。
// 以「桿子在右側路緣、臂往 -X 伸、燈頭朝 +Z」蓋；擺到左側時整組轉 180°。
// 尺寸定案為常數；路名由 intersections.ts 從 TUNING.streetNames 抽。
// 每支 4 個 draw call：桿＋臂＋燈殼（頂點色）、三顆燈（自發光）、路牌前後兩片。
const VS = {
  poleH: 5.5, // 桿高
  poleR: 0.09,
  armR: 0.06, // 橫臂半徑；臂在桿頂往下一點
  headW: 1.05, // 燈頭寬（三燈橫排）
  headH: 0.36,
  headD: 0.3,
  lampR: 0.12,
  hang: 0.45, // 燈頭中心離橫臂多低
  signW: 1.6, // 路牌
  signH: 0.4,
  signY: 4.2, // 路牌中心離地
};
export const VSIGNAL_FROM_CURB = 0.5; // 桿子離路緣多遠（intersections.ts 擺位置用）
const VS_POLE_COLOR = new THREE.Color(0x8d939a);
const VS_HEAD_COLOR = new THREE.Color(0x1d1f22);
const VS_LAMP_COLORS = [0x5a1010, 0x5a4a10, 0x2ecc40]; // 紅、黃暗；綠恆亮（駕駛看過去左紅右綠）
const VS_BODY_MAT = new THREE.MeshLambertMaterial({ vertexColors: true });
const VS_LAMP_MAT = new THREE.MeshBasicMaterial({ vertexColors: true });

// 幾何塗上單一頂點色（合併後一個材質畫完）
function tinted(geo: THREE.BufferGeometry, color: THREE.Color, m: THREE.Matrix4): THREE.BufferGeometry {
  const g = geo.clone().applyMatrix4(m);
  const n = g.attributes.position.count;
  const c = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) (c[i * 3] = color.r), (c[i * 3 + 1] = color.g), (c[i * 3 + 2] = color.b);
  g.setAttribute("color", new THREE.BufferAttribute(c, 3));
  return g;
}
const at = (x: number, y: number, z: number, rz = 0) =>
  new THREE.Matrix4().makeRotationZ(rz).setPosition(x, y, z);

// 路牌貼圖：綠底白字（只有中文），每個路名畫一次快取
const signTextures = new Map<string, THREE.Texture>();
function streetSignTexture(name: string): THREE.Texture {
  let tex = signTextures.get(name);
  if (tex) return tex;
  const cv = document.createElement("canvas");
  cv.width = 512;
  cv.height = 128;
  const c = cv.getContext("2d")!;
  c.fillStyle = "#0b6b3a";
  c.fillRect(0, 0, 512, 128);
  c.strokeStyle = "#ffffff";
  c.lineWidth = 6;
  c.strokeRect(8, 8, 496, 112);
  c.fillStyle = "#ffffff";
  c.font = "bold 72px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  const w = c.measureText(name).width;
  if (w > 440) c.font = `bold ${Math.floor((72 * 440) / w)}px 'Noto Sans TC', 'PingFang TC', 'Microsoft JhengHei', sans-serif`;
  c.fillText(name, 256, 68);
  tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  signTextures.set(name, tex);
  return tex;
}

// armLength = 橫臂從桿子伸出去多長（伸到車道中間）；streetName = 路牌上的字
export function makeVehicleSignal(armLength: number, streetName: string): THREE.Group {
  const group = new THREE.Group();
  const armY = VS.poleH - 0.2;
  const headX = -armLength + 0.3; // 燈頭掛在臂端
  const headY = armY - VS.hang;
  const body = [
    tinted(new THREE.CylinderGeometry(VS.poleR, VS.poleR, VS.poleH, 10), VS_POLE_COLOR, at(0, VS.poleH / 2, 0)),
    tinted(new THREE.CylinderGeometry(VS.armR, VS.armR, armLength, 8), VS_POLE_COLOR, at(-armLength / 2, armY, 0, Math.PI / 2)),
    tinted(new THREE.CylinderGeometry(0.03, 0.03, VS.hang, 6), VS_HEAD_COLOR, at(headX, armY - VS.hang / 2, 0)), // 吊燈頭的短桿
    tinted(new THREE.BoxGeometry(VS.headW, VS.headH, VS.headD), VS_HEAD_COLOR, at(headX, headY, 0)),
  ];
  // 燈頭前後兩面都有燈（正面朝 +Z、背面朝 -Z），兩面都是綠燈恆亮；從哪邊看順序都是左紅右綠
  const lamps: THREE.BufferGeometry[] = [];
  const lampGeo = new THREE.CircleGeometry(VS.lampR, 14);
  const lampBackGeo = lampGeo.clone().applyMatrix4(new THREE.Matrix4().makeRotationY(Math.PI));
  const visorGeo = new THREE.BoxGeometry(VS.lampR * 2.3, 0.05, 0.16);
  for (const face of [1, -1] as const) {
    VS_LAMP_COLORS.forEach((hex, i) => {
      const lx = headX + face * (i - 1) * (VS.headW / 3);
      const lz = face * (VS.headD / 2 + 0.005);
      lamps.push(tinted(face === 1 ? lampGeo : lampBackGeo, new THREE.Color(hex), at(lx, headY, lz)));
      body.push(tinted(visorGeo, VS_HEAD_COLOR, at(lx, headY + VS.lampR + 0.05, face * (VS.headD / 2 + 0.06)))); // 帽簷
    });
  }
  group.add(new THREE.Mesh(mergeGeometries(body), VS_BODY_MAT));
  group.add(new THREE.Mesh(mergeGeometries(lamps), VS_LAMP_MAT));
  // 路牌：前後各一片（背面那片轉 180°），從哪邊看字都是正的
  const signGeo = new THREE.PlaneGeometry(VS.signW, VS.signH);
  const signMat = new THREE.MeshLambertMaterial({ map: streetSignTexture(streetName) });
  for (const dir of [1, -1] as const) {
    const sign = new THREE.Mesh(signGeo, signMat);
    sign.position.set(0, VS.signY, dir * (VS.poleR + 0.03));
    if (dir === -1) sign.rotation.y = Math.PI;
    group.add(sign);
  }
  return group;
}

// ── 機車停等區（路口斑馬線前的白框格）──
// 白色框線、中間不填色（柏油原色）。
// placeholder 的「不填色」= 疊一張柏油色內板露出白邊。
// 之後放使用者的貼圖：在 group 裡加一層 PlaneGeometry + map（y 疊 0.03），
// 或整組換成一張貼圖平面。純視覺裝飾，不影響任何判定。
const SCOOTER_BOX_BORDER_MAT = new THREE.MeshBasicMaterial({ color: 0xe8e8e8 });
const SCOOTER_BOX_FILL_MAT = new THREE.MeshBasicMaterial({ color: 0x3a3a3e }); // 柏油原色＝不填色

// 使用者提供的騎士圖案（白色、透明背景）。路徑相對於網站根：
// 本機 dev 是 /assets/...，GitHub Pages 會自動變 /game-pedestrian-hell/assets/...
const SCOOTER_ICON_TEX = new THREE.TextureLoader().load(
  "assets/motorcycle_waiting_symbol_transparent.png",
);
SCOOTER_ICON_TEX.colorSpace = THREE.SRGBColorSpace;
const SCOOTER_ICON_MAT = new THREE.MeshBasicMaterial({
  map: SCOOTER_ICON_TEX,
  transparent: true,
});
const SCOOTER_ICON_GEO = new THREE.PlaneGeometry(0.73, 1.9); // 照原圖 275:717 的比例

// 平躺的層：白框（大）→ 柏油色內板（內縮，露出白邊）→ 置中一個騎士圖案。
// 圖案預設朝 +Z 的人正讀；迎面車那格由呼叫端把整組 rotation.y 轉 180 度。
export function makeScooterBox(width: number, depth: number): THREE.Group {
  const group = new THREE.Group();
  const layers: [THREE.PlaneGeometry, THREE.MeshBasicMaterial, number][] = [
    [new THREE.PlaneGeometry(width, depth), SCOOTER_BOX_BORDER_MAT, 0.02],
    [new THREE.PlaneGeometry(width - 0.3, depth - 0.3), SCOOTER_BOX_FILL_MAT, 0.025],
  ];
  for (const [geo, mat, y] of layers) {
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y;
    group.add(plane);
  }
  // 騎士圖案：一格一個，放在兩車道的正中間
  const icon = new THREE.Mesh(SCOOTER_ICON_GEO, SCOOTER_ICON_MAT);
  icon.rotation.x = -Math.PI / 2;
  icon.position.y = 0.03;
  group.add(icon);
  return group;
}

// ── 公車停靠區（外側車道貼路邊線的長方形標線，裝飾）──
// 白框、不填色、直排「公車停靠區」。字預設給往 -Z 開的（同向側）讀；
// 迎面側由呼叫端把整組 rotation.y 轉 180 度。
function makeBusZoneTexture(): THREE.Texture {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 640;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 96px sans-serif";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const chars = "公車停靠區";
  for (let i = 0; i < chars.length; i++) {
    ctx.fillText(chars[i], 64, 64 + i * 128);
  }
  return new THREE.CanvasTexture(canvas);
}
const BUS_ZONE_TEXT_MAT = new THREE.MeshBasicMaterial({
  map: makeBusZoneTexture(),
  transparent: true,
  opacity: 0.9,
});

export function makeBusZone(width: number, length: number): THREE.Group {
  const group = new THREE.Group();
  const layers: [THREE.PlaneGeometry, THREE.MeshBasicMaterial, number][] = [
    [new THREE.PlaneGeometry(width, length), SCOOTER_BOX_BORDER_MAT, 0.02],
    [new THREE.PlaneGeometry(width - 0.24, length - 0.24), SCOOTER_BOX_FILL_MAT, 0.025],
    [new THREE.PlaneGeometry(1.3, 6.5), BUS_ZONE_TEXT_MAT, 0.03], // 直排五字
  ];
  for (const [geo, mat, y] of layers) {
    const plane = new THREE.Mesh(geo, mat);
    plane.rotation.x = -Math.PI / 2;
    plane.position.y = y;
    group.add(plane);
  }
  return group;
}

// 停止線（汽車停在這條線後面，機車鑽進前方的停等區）
export function makeStopLine(width: number): THREE.Mesh {
  const line = new THREE.Mesh(
    new THREE.PlaneGeometry(width, 0.45),
    SCOOTER_BOX_BORDER_MAT,
  );
  line.rotation.x = -Math.PI / 2;
  line.position.y = 0.02;
  return line;
}

// ── 路旁建築 ──
// 之後貼皮：把單一材質換成六面材質陣列（正面招牌、側面牆），或整個換成模型。
// ── 遠景大背景圖 ──
// 以鏡頭為圓心的一段圓柱弧面（不是平的看板，路口斜看出去也有圖），不受霧影響。
// 圖片本身鋪在正前方（寬度 = height × 圖片比例），弧面其餘部分用鏡射延伸。
// 下半部疊一層「霧色 → 透明」的漸層，讓圖從地平線附近自然融進霧裡。
// 可以換圖（每關輪換）：貼圖載一次就快取。圖載好才顯示；載不到就維持純色天空。
export interface Backdrop {
  group: THREE.Group; // world.ts 擺位置；x 每幀跟著鏡頭走一部分
  // 換成這張圖、漸層改成這個霧色；horizonRatio = 這張圖的地平線在高度幾成處
  show(image: string, sky: THREE.Color, horizonRatio: number): void;
}
export function makeBackdrop(): Backdrop {
  const c = TUNING.backdrop;
  const group = new THREE.Group();
  group.visible = false;
  const arc = THREE.MathUtils.degToRad(c.arcDegrees);
  // 弧面正中央對著 -Z（鏡頭前方）；從內側看，材質用 BackSide
  const arcGeo = (radius: number) =>
    new THREE.CylinderGeometry(radius, radius, c.height, 96, 1, true, Math.PI - arc / 2, arc);
  const pictureMat = new THREE.MeshBasicMaterial({ fog: false, side: THREE.BackSide });
  const picture = new THREE.Mesh(arcGeo(c.distance), pictureMat);
  group.add(picture);

  // 霧色漸層：畫成白色＋透明度，實際顏色用材質 color 染（換霧色不用重畫）
  const canvas = document.createElement("canvas");
  canvas.width = 4;
  canvas.height = 512;
  const fadeTex = new THREE.CanvasTexture(canvas);
  const fadeMat = new THREE.MeshBasicMaterial({
    map: fadeTex,
    transparent: true,
    fog: false,
    depthWrite: false,
    side: THREE.BackSide,
  });
  const fade = new THREE.Mesh(arcGeo(c.distance - 1), fadeMat); // 疊在圖前面一點點
  group.add(fade);

  // 依這張圖的地平線位置：圖的地平線對齊 y=0，漸層從地平線往上 fadeHeight 淡出
  const setHorizon = (horizonRatio: number) => {
    const centerY = c.height * (0.5 - horizonRatio);
    picture.position.y = centerY;
    fade.position.y = centerY;
    const ctx = canvas.getContext("2d")!;
    ctx.clearRect(0, 0, 4, 512);
    const horizonRow = (1 - horizonRatio) * 512; // canvas 的 y 從上往下
    const fadeRows = (c.fadeHeight / c.height) * 512;
    const grad = ctx.createLinearGradient(0, horizonRow - fadeRows, 0, horizonRow);
    grad.addColorStop(0, "rgba(255,255,255,0)");
    grad.addColorStop(1, "rgba(255,255,255,1)");
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 4, horizonRow);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, horizonRow, 4, 512 - horizonRow);
    // 上緣：從最上面（全遮、天空色）往下 topFadeHeight 淡出，圖的上緣就融進天空、看不到邊
    const topRows = (c.topFadeHeight / c.height) * 512;
    const topGrad = ctx.createLinearGradient(0, 0, 0, topRows);
    topGrad.addColorStop(0, "rgba(255,255,255,1)");
    topGrad.addColorStop(1, "rgba(255,255,255,0)");
    ctx.fillStyle = topGrad;
    ctx.fillRect(0, 0, 4, topRows);
    fadeTex.needsUpdate = true;
  };
  setHorizon(c.horizonRatio);

  const loader = new THREE.TextureLoader();
  const cache = new Map<string, THREE.Texture>();
  let wanted = ""; // 最後一次要求顯示的圖（載入是非同步的，載好時要確認還是它）
  const apply = (tex: THREE.Texture) => {
    pictureMat.map = tex;
    pictureMat.needsUpdate = true;
    group.visible = true;
  };
  return {
    group,
    show(image, sky, horizonRatio) {
      fadeMat.color.copy(sky);
      setHorizon(horizonRatio);
      wanted = image;
      const cached = cache.get(image);
      if (cached) {
        apply(cached);
        return;
      }
      loader.load(
        `${import.meta.env.BASE_URL}${image}`,
        (tex) => {
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.wrapS = THREE.MirroredRepeatWrapping;
          const img = tex.image as { width: number; height: number };
          const w = c.height * (img.width / img.height); // 圖片在正前方鋪多寬
          const imgArc = 2 * Math.atan(w / 2 / c.distance); // 這個寬度在弧面上占幾度
          const repeat = arc / imgArc; // 整段弧面要塞幾張圖（>1 的部分鏡射）
          // 圓柱的 u 從右往左增加，從內側看圖會左右相反：repeat 取負把它翻回來，offset 讓圖置中
          tex.repeat.x = -repeat;
          tex.offset.x = 0.5 + repeat / 2;
          cache.set(image, tex);
          if (wanted === image) apply(tex);
        },
        undefined,
        () => console.info(`沒有背景圖 ${image}，維持純色天空`),
      );
    },
  };
}

// ── 大地面 ──
// 鋪在所有東西底下的一大片地（路口開闊處、建築後面看出去才不會露出天空色），遠處被霧吃掉
const GROUND_MAT = new THREE.MeshLambertMaterial({ color: 0x6e7a6a });
export function makeGround(size: number): THREE.Mesh {
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(size, size), GROUND_MAT);
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -0.05; // 比路面低一點點，不跟路面打架
  return ground;
}

// ── 路旁建築（連棟街屋）──
// 有模型就用模型：把 GLB 放進 public/assets/models/buildings/，在 BUILDING_MODELS 登記，
// 每棟隨機抽一款，面寬用模型的實際寬度，一棟接一棟排。
// 模型（Meshy 輸出）的尺寸是正規化的，不是公尺：登記時填實際高度（公尺），程式等比縮放。
// rotationY = 正面不是朝 +Z 時要先轉幾度（弧度）。
// 原點位置不拘，程式會自動把「底部貼地、正面貼齊人行道、面寬置中」（對齊只看離地
// 2.5 m 以下的牆面輪廓，招牌、雨遮凸出去沒關係）。
// 還沒放模型（或還沒載好）就用素色方塊撐著，載好會自動全部換掉。
interface BuildingModel {
  name: string; // 檔名（不含 .glb）
  height?: number; // 實際高度（公尺），例如 4 層樓 ≈ 13。模型本身就是公尺（例如自己匯出的）就不填
  rotationY?: number; // 正面轉向 +Z 需要的旋轉（弧度）；正面本來就朝 +Z 就不用填
}
const BUILDING_MODELS: BuildingModel[] = [
  // shophouse-NN：scripts/shophouse 蓋的塊狀街屋（規格表 specs.ts，npm run export:buildings 匯出），
  // 單位公尺、正面 +Z，店面與招牌的 PNG 以外部檔案掛在 GLB 上（public/assets/decals/）
  ...Array.from({ length: 10 }, (_, i) => ({ name: `shophouse-${String(i + 1).padStart(2, "0")}` })),
];
const buildingProtos: { scene: THREE.Object3D; cfg: BuildingModel }[] = [];
let buildingLoadStarted = false;
const BUILDING_FOOTPRINT_HEIGHT = 2.5; // 對齊人行道時只看離地這麼高以內的牆面輪廓

// 只算高度 maxY 以下的頂點的包圍框（世界空間依 model 目前的旋轉）
function footprintBox(model: THREE.Object3D, maxY: number): THREE.Box3 {
  model.updateWorldMatrix(true, true);
  const box = new THREE.Box3();
  const v = new THREE.Vector3();
  model.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.getAttribute("position");
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      if (v.y <= maxY) box.expandByPoint(v);
    }
  });
  return box.isEmpty() ? new THREE.Box3().setFromObject(model) : box;
}

// 多棟 GLB 掛同一張 PNG（例如 7-11 的店面）時，GLTFLoader 每個檔各自建一份貼圖；
// 這裡依名字（匯出時 name = 檔案路徑）共用同一份，GPU 記憶體不重複
const sharedTextures = new Map<string, THREE.Texture>();
function shareTextures(scene: THREE.Object3D): void {
  scene.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (!m?.map?.name) return;
    const shared = sharedTextures.get(m.map.name);
    if (shared && shared !== m.map) {
      m.map.dispose();
      m.map = shared;
    } else sharedTextures.set(m.map.name, m.map);
  });
}

export function preloadBuildingModels(): void {
  if (buildingLoadStarted) return;
  buildingLoadStarted = true;
  const loader = new GLTFLoader();
  const base = `${import.meta.env.BASE_URL}assets/models/buildings/`;
  for (const cfg of BUILDING_MODELS) {
    loader.load(
      `${base}${cfg.name}.glb`,
      (gltf) => {
        shareTextures(gltf.scene);
        buildingProtos.push({ scene: gltf.scene, cfg });
        buildingLoadsDone++;
      },
      undefined,
      () => {
        buildingLoadsDone++; // 失敗也算完成，開場不會卡死等它
        console.warn(`建築模型載入失敗：${cfg.name}.glb`);
      },
    );
  }
}
let buildingLoadsDone = 0;
// world.ts 用：模型全到了嗎——載好整排重蓋一次；main.ts 開場也等這個
export function buildingModelsReady(): boolean {
  return buildingLoadStarted && buildingLoadsDone >= BUILDING_MODELS.length && buildingProtos.length > 0;
}

// 素色方塊（fallback）：1×1×1 單位方塊，尺寸用 scale 決定
const BUILDING_GEO = new THREE.BoxGeometry(1, 1, 1);

export interface BuildingParts {
  root: THREE.Group; // 原點 = 人行道外緣那條線上、地面高度、面寬中心
  box: THREE.Mesh;
  model: THREE.Object3D | null;
}

export function makeBuilding(): BuildingParts {
  preloadBuildingModels();
  const box = new THREE.Mesh(BUILDING_GEO, new THREE.MeshLambertMaterial());
  const root = new THREE.Group();
  root.add(box);
  return { root, box, model: null };
}

// 重組一棟（建築繞回遠處時也會呼叫，街景才不會一直看到同一排）。
// facing = +1 正面朝 +X（左側建築，馬路在它右邊）、-1 朝 -X。回傳面寬（沿路方向的長度）。
export function restyleBuilding(b: BuildingParts, facing: 1 | -1): number {
  if (b.model) {
    b.root.remove(b.model);
    b.model = null;
  }
  if (buildingProtos.length > 0) {
    b.box.visible = false;
    const proto = buildingProtos[Math.floor(Math.random() * buildingProtos.length)];
    const inner = proto.scene.clone(); // 幾何與材質共用，clone 很便宜
    // 先把模型轉成正面朝 +Z、縮放到實際高度，再整個轉向馬路
    inner.rotation.y = proto.cfg.rotationY ?? 0;
    if (proto.cfg.height) {
      const raw = new THREE.Box3().setFromObject(inner);
      inner.scale.setScalar(proto.cfg.height / (raw.max.y - raw.min.y));
    }
    const model = new THREE.Group();
    model.add(inner);
    model.rotation.y = facing === 1 ? Math.PI / 2 : -Math.PI / 2; // +Z 正面轉向馬路
    const full = new THREE.Box3().setFromObject(model);
    // 對齊用的輪廓只看「低處」：招牌、雨遮、陽台會凸出牆面，用整體包圍框會把房子往後推
    const foot = footprintBox(model, full.min.y + BUILDING_FOOTPRINT_HEIGHT);
    // 正面貼齊 root 原點（x=0）、底貼地、面寬置中
    model.position.set(
      facing === 1 ? -foot.max.x : -foot.min.x,
      -full.min.y,
      -(foot.min.z + foot.max.z) / 2,
    );
    b.root.add(model);
    b.model = model;
    return foot.max.z - foot.min.z;
  }
  // 模型還沒載好：隨機面寬/樓層的色塊撐著
  const c = TUNING.buildings;
  const len = THREE.MathUtils.lerp(c.frontageMin, c.frontageMax, Math.random());
  const floors = c.floorsMin + Math.floor(Math.random() * (c.floorsMax - c.floorsMin + 1));
  const h = floors * c.floorHeight;
  const depth = THREE.MathUtils.lerp(c.depthMin, c.depthMax, Math.random());
  b.box.visible = true;
  b.box.scale.set(depth, h, len);
  b.box.position.set(-facing * (depth / 2), h / 2, 0); // 正面貼齊原點、往背後延伸
  (b.box.material as THREE.MeshLambertMaterial).color.setHSL(Math.random(), 0.25, 0.55);
  return len;
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

// 目的地貼皮：開場就把 TUNING.destinationSkins 列的 JPG 全部載進來（每張都很小），
// 生成建築時有圖就貼、沒圖（沒列或載失敗）就用米色方塊＋canvas 招牌
const destinationTextures = new Map<string, THREE.Texture>(); // label → 貼圖（只放載成功的）
{
  const loader = new THREE.TextureLoader();
  for (const [label, file] of Object.entries(TUNING.destinationSkins)) {
    loader.load(
      `${import.meta.env.BASE_URL}assets/decals/destinations/${file}.jpg`,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        destinationTextures.set(label, tex);
      },
      undefined,
      () => {}, // 沒圖 = 用佔位方塊，正常
    );
  }
}
const DEST_ROOF_MAT = new THREE.MeshLambertMaterial({ color: 0x8e8e8e });

export function makeDestinationBuilding(label: string): THREE.Group {
  const group = new THREE.Group();
  const w = 9; // 垂直馬路方向（正面朝 +Z 的那面寬 9）
  const h = 12;
  const d = 10; // 沿馬路方向（面向馬路那面寬 10）
  const skin = destinationTextures.get(label);
  if (skin) {
    // 有立面圖：四個側面貼同一張（圖是 3:4，側面 10:12 略拉寬看不出來），屋頂灰色
    const wallMat = new THREE.MeshLambertMaterial({ map: skin });
    const body = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), [wallMat, wallMat, DEST_ROOF_MAT, DEST_ROOF_MAT, wallMat, wallMat]);
    body.position.y = h / 2;
    group.add(body);
    return group;
  }
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
