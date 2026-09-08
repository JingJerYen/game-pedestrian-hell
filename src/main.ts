// 進入點：組裝所有模組、跑遊戲迴圈、管理關卡狀態機。
// 狀態流：levelStart（橫幅，自動開始）→ running →
//   過關 → 下一關 levelStart（最後一關 → win）
//   失敗（被撞/超時）→ fail（扣一❤）→ 按鍵重來本關；❤用完 → 按鍵回第一關

import * as THREE from "three";
import { TUNING, LEVELS } from "./tuning";
import { World } from "./world";
import { Player } from "./player";
import { Traffic } from "./traffic";
import { Obstacles } from "./obstacles";
import { Hud } from "./hud";
import { DebugOverlay } from "./debug";

const FORM_LABEL = { walker: "步行", stroller: "推嬰兒車", wheelchair: "坐輪椅" } as const;

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
let state: "levelStart" | "running" | "fail" | "win" = "levelStart";
let levelIndex = 0;
let hearts = TUNING.maxHearts;
let position = 0; // 本關目前走到第幾公尺（後退會減少）
let maxDistance = 0; // 本關最遠走到幾公尺（過關與路障生成都看它）
let timeLeft = 0; // 本關剩餘秒數
let bannerTimer = 0; // 開場橫幅倒數，歸零自動開始
let resultAt = 0; // 失敗/通關畫面出現的時間戳：停留滿 resultHoldSeconds 才接受按鍵

function level() {
  return LEVELS[levelIndex];
}

function startLevel(index: number): void {
  levelIndex = index;
  const lv = LEVELS[index];
  position = 0;
  maxDistance = 0;
  timeLeft = lv.timeLimit;
  player.setForm(lv.playerForm);
  player.reset();
  traffic.reset();
  obstacles.reset();
  hud.hideOverlays();
  hud.showBanner(
    `第 ${index + 1} 關`,
    `${FORM_LABEL[lv.playerForm]}｜走到 ${lv.goalDistance}m｜時限 ${lv.timeLimit} 秒`,
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

window.addEventListener("keydown", () => {
  // 結算畫面停留滿 resultHoldSeconds 才接受按鍵，避免玩家還在狂按方向鍵就跳過了
  if (performance.now() - resultAt < TUNING.resultHoldSeconds * 1000) return;
  if (state === "fail") {
    if (hearts > 0) {
      startLevel(levelIndex);
    } else {
      hearts = TUNING.maxHearts;
      startLevel(0);
    }
  } else if (state === "win") {
    hearts = TUNING.maxHearts;
    startLevel(0);
  }
});

// 鏡頭：馬力歐賽車式——在玩家後方偏低，橫移時稍微跟過去
let cameraX = 0;
function updateCamera(dt: number): void {
  const t = TUNING;
  cameraX = THREE.MathUtils.damp(
    cameraX,
    player.mesh.position.x * t.cameraXFollow,
    t.cameraXDamp,
    dt,
  );
  camera.position.set(cameraX, t.cameraHeight, t.cameraDistance);
  camera.lookAt(cameraX, 0.8, -t.cameraLookAhead);
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

    world.update(dz);
    obstacles.update(dz, maxDistance, lv);
    traffic.update(dt, dz, obstacles.occupiedRoadCols(), lv);
    const dirX = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
    player.update(dt, dirX, lv.strafeSpeed ?? TUNING.strafeSpeed, obstacles);

    position += dz;
    maxDistance = Math.max(maxDistance, position);
    timeLeft -= dt;

    if (maxDistance >= lv.goalDistance) {
      // 過關：還有下一關就進下一關，沒有就通關
      if (levelIndex + 1 < LEVELS.length) startLevel(levelIndex + 1);
      else {
        state = "win";
        resultAt = performance.now();
        hud.showWin(TUNING.resultHoldSeconds * 1000);
      }
    } else if (traffic.hitsPlayer(player)) {
      failLevel("你被撞了 🛵");
    } else if (timeLeft <= 0) {
      failLevel("時間到 ⏰");
    }
  }

  hud.setStatus(
    hearts,
    TUNING.maxHearts,
    levelIndex,
    LEVELS.length,
    maxDistance,
    lv.goalDistance,
    timeLeft,
  );
  debug.update(dt, () => {
    const c = traffic.counts();
    return [
      `state ${state}`,
      `level ${levelIndex + 1}/${LEVELS.length} (${lv.playerForm})`,
      `pos ${position.toFixed(1)} / max ${maxDistance.toFixed(1)} / goal ${lv.goalDistance}`,
      `time ${timeLeft.toFixed(1)}s`,
      `spawnInterval ${lv.spawnInterval}s  speedScale ${lv.speedScale}`,
      `cars ${c.oncoming}  bg ${c.background}  obstacles ${obstacles.count}`,
    ].join("\n");
  });

  updateCamera(dt);
  renderer.render(world.scene, camera);
});

startLevel(0);
