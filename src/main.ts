// 進入點：組裝所有模組、跑遊戲迴圈、管理關卡狀態機。
// 狀態流：levelStart（橫幅，自動開始）→ running →
//   過關 → 下一關 levelStart（最後一關 → win）
//   失敗（被撞/超時）→ fail（扣一❤）→ 按鍵重來本關；❤用完 → 按鍵回第一關

import * as THREE from "three";
import { TUNING, LEVELS } from "./tuning";
import { getLevel } from "./levelgen";
import { World } from "./world";
import { Player } from "./player";
import { Traffic } from "./traffic";
import { Obstacles } from "./obstacles";
import { Intersections } from "./intersections";
import { Destination } from "./destination";
import { TouchControls } from "./touch";
import { ROAD_LEFT, BG_RIGHT } from "./tuning";
import { Hud } from "./hud";
import { DebugOverlay } from "./debug";

const FORM_LABEL = { walker: "步行", stroller: "推嬰兒車", wheelchair: "坐輪椅" } as const;
const SIDE_LABEL = { left: "左側", right: "右側" } as const;

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
document.body.appendChild(renderer.domElement);

const camera = new THREE.PerspectiveCamera(
  TUNING.cameraFov,
  window.innerWidth / window.innerHeight,
  0.1,
  300,
);

window.addEventListener("resize", () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

const world = new World();
const player = new Player(world.scene);
const traffic = new Traffic(world.scene);
const obstacles = new Obstacles(world.scene);
const intersections = new Intersections(world.scene);
const destination = new Destination(world.scene);
const hud = new Hud();
const debug = new DebugOverlay();

// 按住 ↑↓←→（或 WASD）移動（用 keydown/keyup 追蹤「現在按著哪些鍵」）
const held = new Set<string>();
const KEY_ALIAS: Record<string, string> = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
};
window.addEventListener("keydown", (e) => {
  const key = KEY_ALIAS[e.key];
  if (key) held.add(key);
});
window.addEventListener("keyup", (e) => {
  const key = KEY_ALIAS[e.key];
  if (key) held.delete(key);
});

// ── 關卡狀態 ──
// （沒有「全破」狀態：手動關卡表走完就無縫接無限生成，見 levelgen.ts）
let state: "levelStart" | "running" | "fail" = "levelStart";
let levelIndex = 0;
let hearts = TUNING.maxHearts;
let position = 0; // 本關目前走到第幾公尺（後退會減少）
let maxDistance = 0; // 本關最遠走到幾公尺（過關與路障生成都看它）
let timeLeft = 0; // 本關剩餘秒數
let bannerTimer = 0; // 開場橫幅倒數，歸零自動開始
let resultAt = 0; // 失敗/通關畫面出現的時間戳：停留滿 resultHoldSeconds 才接受按鍵

function level() {
  return getLevel(levelIndex);
}

function startLevel(index: number): void {
  levelIndex = index;
  const lv = getLevel(index);
  position = 0;
  maxDistance = 0;
  timeLeft = lv.timeLimit;
  player.setForm(lv.playerForm);
  player.reset();
  traffic.reset();
  obstacles.reset();
  intersections.reset();
  destination.reset();
  world.resetSidewalkMarks();
  hud.hideOverlays();
  // 目標提示依關卡設定組合：側別/距離都可以個別關掉（讓玩家自己找目的地）
  const showSide = !!lv.goalSide && !lv.hideSideHint;
  const showDist = !lv.hideDistanceHint;
  const sideText = showSide ? SIDE_LABEL[lv.goalSide!] : "";
  let goalText: string;
  if (showDist && showSide) goalText = `走到 ${lv.goalDistance}m 的${sideText}人行道`;
  else if (showDist) goalText = `走到 ${lv.goalDistance}m`;
  else if (showSide) goalText = `終點在${sideText}人行道`;
  else goalText = "自己找到終點";
  hud.showBanner(
    `第 ${index + 1} 關`,
    lv.flavorText ?? "",
    `${FORM_LABEL[lv.playerForm]}｜${goalText}｜時限 ${lv.timeLimit} 秒`,
  );
  bannerTimer = 2.0;
  state = "levelStart";
}

function failLevel(title: string): void {
  hearts--;
  state = "fail";
  resultAt = performance.now();
  hud.showFail(
    title,
    hearts > 0 ? `剩 ${hearts} 條命` : "命用完了……",
    hearts > 0 ? "按任意鍵重來本關" : "按任意鍵從第一關重新開始",
    TUNING.resultHoldSeconds * 1000,
  );
}

// 結算畫面的「按任意鍵」：鍵盤和觸控（點螢幕）都走這裡
function tryAdvance(): void {
  // 停留滿 resultHoldSeconds 才接受，避免玩家還在狂按方向鍵就跳過了
  if (performance.now() - resultAt < TUNING.resultHoldSeconds * 1000) return;
  if (state === "fail") {
    if (hearts > 0) {
      startLevel(levelIndex);
    } else {
      hearts = TUNING.maxHearts;
      startLevel(0);
    }
  }
}
window.addEventListener("keydown", tryAdvance);

// 觸控裝置：虛擬搖桿寫入同一個 held 集合，並換掉操作提示文字
new TouchControls(held, tryAdvance);
if ("ontouchstart" in window) {
  document.getElementById("hint")!.textContent = "按住畫面拖曳移動";
}

// 鏡頭：馬力歐賽車式——在玩家後方偏低，橫移時稍微跟過去。
// 直式畫面（手機豎拿）自動改用 cameraPortrait 那組參數。
let cameraX = 0;
function updateCamera(dt: number): void {
  const t = TUNING;
  const portrait = camera.aspect < 1;
  const height = portrait ? t.cameraPortrait.height : t.cameraHeight;
  const distance = portrait ? t.cameraPortrait.distance : t.cameraDistance;
  const lookAhead = portrait ? t.cameraPortrait.lookAhead : t.cameraLookAhead;
  const fov = portrait ? t.cameraPortrait.fov : t.cameraFov;
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  cameraX = THREE.MathUtils.damp(
    cameraX,
    player.mesh.position.x * t.cameraXFollow,
    t.cameraXDamp,
    dt,
  );
  camera.position.set(cameraX, height, distance);
  camera.lookAt(cameraX, 0.8, -lookAhead);
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  // dt 上限 0.05 秒：切分頁回來時避免一大步跳幀（穿過車或瞬移）
  const dt = Math.min(clock.getDelta(), 0.05);
  const lv = level();

  if (state === "levelStart") {
    bannerTimer -= dt;
    if (bannerTimer <= 0) {
      hud.hideOverlays();
      state = "running";
    }
  } else if (state === "running") {
    // 世界捲動量由玩家輸入決定；車輛自己的車速在 traffic 裡另外加
    // （行人速度：關卡有覆寫就用關卡的，沒有就用全域預設）
    let dz = 0;
    if (held.has("up")) dz = (lv.walkSpeed ?? TUNING.walkSpeed) * dt;
    else if (held.has("down")) dz = -(lv.backSpeed ?? TUNING.backSpeed) * dt;
    dz = Math.max(dz, -position); // 不能退到起點之前
    dz = obstacles.clampScroll(player.mesh.position, player.size, dz); // 被路障擋住

    intersections.update(dz, maxDistance, lv, (z) =>
      obstacles.removeNear(z, TUNING.intersection.roadDepth / 2 + 2),
    );
    destination.update(dz, position, lv);
    world.update(dz, intersections.centers(), destination.zone, obstacles.parkingZones());
    obstacles.update(dz, maxDistance, lv, intersections);
    traffic.update(dt, dz, obstacles, lv, intersections);
    const dirX = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
    player.update(dt, dirX, lv.strafeSpeed ?? TUNING.strafeSpeed, obstacles);

    position += dz;
    maxDistance = Math.max(maxDistance, position);
    timeLeft -= dt;

    // 過關判定：走到目標距離；關卡有指定 goalSide 的話，還要站上該側人行道
    const reached = position >= lv.goalDistance;
    const px = player.mesh.position.x;
    const sideOk =
      !lv.goalSide ||
      (lv.goalSide === "left" ? px < ROAD_LEFT : px > BG_RIGHT);
    if (reached && sideOk) {
      // 過關：永遠有下一關（表用完由 levelgen 無縫接手）
      startLevel(levelIndex + 1);
    } else if (traffic.hitsPlayer(player)) {
      failLevel("你被撞了 🛵");
    } else if (timeLeft <= 0) {
      failLevel("時間到 ⏰");
    }
  }

  // HUD 進度列：提示依關卡設定（hideSideHint / hideDistanceHint）組合
  const showSideHint = !!lv.goalSide && !lv.hideSideHint;
  const sideLabel = showSideHint ? SIDE_LABEL[lv.goalSide!] : "";
  let progressText: string;
  if (showSideHint && position >= lv.goalDistance) {
    progressText = `到了！請走到${sideLabel}人行道`;
  } else {
    const dist = lv.hideDistanceHint
      ? `${Math.floor(position)} m`
      : `${Math.floor(position)} / ${lv.goalDistance} m`;
    progressText = dist + (showSideHint ? `（終點在${sideLabel}）` : "");
  }
  hud.setStatus(hearts, TUNING.maxHearts, levelIndex, progressText, timeLeft);
  debug.update(dt, () => {
    const c = traffic.counts();
    return [
      `state ${state}`,
      `level ${levelIndex + 1} (${lv.playerForm})` +
        (levelIndex >= LEVELS.length
          ? `  [endless 第${levelIndex - LEVELS.length + 1}關]`
          : ""),
      `pos ${position.toFixed(1)} / max ${maxDistance.toFixed(1)} / goal ${lv.goalDistance}`,
      `time ${timeLeft.toFixed(1)}s`,
      `spawnInterval ${lv.spawnInterval}s  speedScale ${lv.speedScale}`,
      `cars ${c.total} (turning ${c.turning})  obstacles ${obstacles.count}  intersections ${intersections.count}`,
    ].join("\n");
  });

  updateCamera(dt);
  renderer.render(world.scene, camera);
});

startLevel(0);
