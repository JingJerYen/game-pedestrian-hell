// 進入點：組裝所有模組、跑遊戲迴圈、管理關卡狀態機。
// 狀態流：levelStart（橫幅，自動開始）→ running →
//   過關 → 下一關 levelStart（最後一關 → win）
//   失敗（被撞/超時）→ fail（扣一❤）→ 按鍵重來本關；❤用完 → 按鍵回第一關

import * as THREE from "three";
import { TUNING, LEVELS, LAYOUT, hasSidewalk, type PlayerForm } from "./tuning";
import { getLevel } from "./levelgen";
import { World } from "./world";
import { Player } from "./player";
import { Traffic } from "./traffic";
import { Obstacles } from "./obstacles";
import { Intersections } from "./intersections";
import { Destination } from "./destination";
import { TouchControls } from "./touch";
import { ROAD_LEFT, BG_RIGHT, type DeathCause } from "./tuning";
import { Hud } from "./hud";
import { DebugOverlay } from "./debug";

const FORM_LABEL = { walker: "步行", stroller: "推嬰兒車", wheelchair: "坐輪椅" } as const;
const SIDE_LABEL = { left: "左側", right: "右側" } as const;
// 抵達判定：離目標距離 ± 1 公尺才算「在目的地」（遊戲規則，固定值不調參）
const GOAL_ARRIVE_RANGE = 1;

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

// 測試熱鍵：1 = 換下一種玩家型態（步行 → 嬰兒車 → 輪椅 → 步行…）；2 = 換下一張背景圖。
// 按一次換一張，輪著轉。正式版兩者都由關卡表決定。
const FORM_CYCLE: PlayerForm[] = ["walker", "stroller", "wheelchair"];
window.addEventListener("keydown", (e) => {
  if (e.key === "1") {
    const next = (FORM_CYCLE.indexOf(player.form) + 1) % FORM_CYCLE.length;
    player.setForm(FORM_CYCLE[next]);
  } else if (e.key === "2") world.nextBackdrop();
});

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
let justCleared = false; // 剛過關（下一關的橫幅要抽一條過關字幕）

function level() {
  return getLevel(levelIndex);
}

function startLevel(index: number): void {
  levelIndex = index;
  const lv = getLevel(index);
  position = 0;
  maxDistance = 0;
  timeLeft = lv.timeLimit;
  LAYOUT.left = lv.sidewalkLeft ?? "normal";
  LAYOUT.right = lv.sidewalkRight ?? "normal";
  player.setForm(lv.playerForm);
  player.reset(); // 出發點依 LAYOUT（有人行道從人行道出發）
  cameraYaw = 0; // 鏡頭回到正後方（人物 reset 後面向前方）
  traffic.reset();
  obstacles.reset();
  intersections.reset();
  destination.reset();
  world.resetSidewalkMarks();
  world.setBackdrop(lv.backdrop ?? index); // 背景每關輪換（關卡表可指定）
  world.applySidewalks(); // 依 LAYOUT 換鋪面、挪建築
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
  // 剛過關的話抽一條過關字幕，跟這一關自己的風味小語並排
  const clearLine = justCleared ? pickFrom(TUNING.clearFlavors) : "";
  justCleared = false;
  const flavor = [clearLine, lv.flavorText ?? ""].filter(Boolean).join("｜");
  hud.showBanner(
    `第 ${index + 1} 關`,
    flavor,
    `${FORM_LABEL[lv.playerForm]}｜${goalText}｜時限 ${lv.timeLimit} 秒`,
  );
  bannerTimer = 2.0;
  state = "levelStart";
}

// 從池子隨機抽一條（空池回傳空字串）
function pickFrom(pool: readonly string[]): string {
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : "";
}

function failLevel(cause: DeathCause): void {
  const caption = TUNING.deathCaptions[cause];
  player.die(cause); // 被撞倒下／超時搖頭
  hearts--;
  state = "fail";
  resultAt = performance.now();
  hud.showFail(
    caption.title,
    pickFrom(caption.facts),
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
let cameraYaw = 0; // 目前鏡頭繞到人物哪個方向（弧度，0 = 正後方），朝目標平滑收斂

// 鏡頭模式（fixed / follow）：玩家可切換，選擇記在瀏覽器
type CameraMode = "fixed" | "follow";
let cameraMode: CameraMode = TUNING.cameraModeDefault;
try {
  const saved = localStorage.getItem("cameraMode");
  if (saved === "fixed" || saved === "follow") cameraMode = saved;
} catch {
  /* 無痕模式等情況讀不到就用預設 */
}
function applyCameraMode(mode: CameraMode): void {
  cameraMode = mode;
  hud.setCameraModeLabel(mode === "follow" ? "視角 1：第一人稱" : "視角 2：第三人稱");
  try {
    localStorage.setItem("cameraMode", mode);
  } catch {
    /* 存不了就算了 */
  }
}
function toggleCameraMode(): void {
  applyCameraMode(cameraMode === "follow" ? "fixed" : "follow");
}
hud.bindCameraToggle(toggleCameraMode);
applyCameraMode(cameraMode);
window.addEventListener("keydown", (e) => {
  if (e.key === "c" || e.key === "C") toggleCameraMode();
});
function updateCamera(dt: number): void {
  const t = TUNING;
  const portrait = camera.aspect < 1;
  const firstPerson = cameraMode === "follow";
  const height = firstPerson
    ? t.firstPerson.height
    : portrait ? t.cameraPortrait.height : t.cameraHeight;
  const distance = firstPerson
    ? t.firstPerson.distance
    : portrait ? t.cameraPortrait.distance : t.cameraDistance;
  player.mesh.visible = !firstPerson; // 第一人稱：別看到自己的後腦勺
  const lookAhead = portrait ? t.cameraPortrait.lookAhead : t.cameraLookAhead;
  const fov = portrait ? t.cameraPortrait.fov : t.cameraFov;
  if (camera.fov !== fov) {
    camera.fov = fov;
    camera.updateProjectionMatrix();
  }
  cameraX = THREE.MathUtils.damp(cameraX, player.mesh.position.x, t.cameraXDamp, dt);
  // 第一人稱：視線跟著人物「目前的朝向」（mesh.rotation.y，0 = 面向前方），走最短弧度平滑追上；
  // 放開按鍵人物不轉，視線就停在那裡。第三人稱永遠看前方（yaw 收斂到 0）
  const targetYaw = firstPerson ? player.mesh.rotation.y : 0;
  const delta = Math.atan2(Math.sin(targetYaw - cameraYaw), Math.cos(targetYaw - cameraYaw));
  cameraYaw += delta * (1 - Math.exp(-t.firstPerson.turnDamp * dt));
  const sin = Math.sin(cameraYaw);
  const cos = Math.cos(cameraYaw);
  // 以人物為圓心：正後方 (0, height, distance) 繞 Y 軸轉 cameraYaw；視線焦點同樣轉
  camera.position.set(cameraX + distance * sin, height, distance * cos);
  camera.lookAt(cameraX - lookAhead * sin, 0.8, -lookAhead * cos);
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
    // 按鍵 → 世界方向：mx = 往馬路右邊的量、mz = 往馬路後方的量（-1 ~ 1）。
    // 第一人稱時按鍵是畫面座標：先依視線方向轉成世界座標（鏡頭看向哪，↑ 就往哪）
    const ix = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
    const iz = held.has("up") ? 1 : held.has("down") ? -1 : 0;
    let mx = ix;
    let mz = -iz;
    if (cameraMode === "follow") {
      const s = Math.sin(cameraYaw);
      const c = Math.cos(cameraYaw);
      mx = -iz * s + ix * c;
      mz = -iz * c - ix * s;
    }
    let dz = 0;
    if (mz < -1e-3) dz = (lv.walkSpeed ?? TUNING.walkSpeed) * -mz * dt;
    else if (mz > 1e-3) dz = -(lv.backSpeed ?? TUNING.backSpeed) * mz * dt;
    dz = Math.max(dz, -position); // 不能退到起點之前
    dz = obstacles.clampScroll(player.mesh.position, player.size, dz); // 被路障擋住

    intersections.update(dz, maxDistance, lv, (z) =>
      obstacles.removeNear(z, TUNING.intersection.roadDepth / 2 + 2),
    );
    destination.update(dz, position, lv);
    world.update(dz, intersections.centers(), destination.zone, obstacles.parkingZones());
    obstacles.update(dz, maxDistance, lv, intersections, (x0, x1, z0, z1) =>
      traffic.anyVehicleIn(x0, x1, z0, z1),
    ); // 生成點有車就不生（不然路障會砸在車上）
    traffic.update(dt, dz, obstacles, lv, intersections);
    // 橫移量與朝向都用世界方向（可以是小數：斜著走就是斜的）
    player.update(dt, mx, -mz, lv.strafeSpeed ?? TUNING.strafeSpeed, obstacles, dz);

    position += dz;
    maxDistance = Math.max(maxDistance, position);
    timeLeft -= dt;

    // 過關判定：人要「在」目的地（目標距離 ± GOAL_ARRIVE_RANGE 之內）——
    // 走過頭不算，得走回來；關卡有指定 goalSide 的話，還要站上該側人行道
    const reached =
      Math.abs(position - lv.goalDistance) <= GOAL_ARRIVE_RANGE;
    const px = player.mesh.position.x;
    // 該側沒有人行道的話，站上該側的路邊車道就算到達
    const sideOk =
      !lv.goalSide ||
      (lv.goalSide === "left"
        ? px < (hasSidewalk("left") ? ROAD_LEFT : ROAD_LEFT + TUNING.laneWidth)
        : px > (hasSidewalk("right") ? BG_RIGHT : BG_RIGHT - TUNING.laneWidth));
    const hitBy = traffic.hitsPlayer(player);
    if (reached && sideOk) {
      // 過關：永遠有下一關（表用完由 levelgen 無縫接手）
      justCleared = true;
      startLevel(levelIndex + 1);
    } else if (hitBy) {
      failLevel(hitBy); // 依兇手車種顯示對應的死亡字幕
    } else if (timeLeft <= 0) {
      failLevel("timeout");
    }
  }

  // HUD 進度列：提示依關卡設定（hideSideHint / hideDistanceHint）組合
  const showSideHint = !!lv.goalSide && !lv.hideSideHint;
  const sideLabel = showSideHint ? SIDE_LABEL[lv.goalSide!] : "";
  let progressText: string;
  const goalOffset = position - lv.goalDistance;
  if (!lv.hideDistanceHint && goalOffset > GOAL_ARRIVE_RANGE) {
    progressText = "走過頭了！目的地在後面，往回走 ↓";
  } else if (showSideHint && Math.abs(goalOffset) <= GOAL_ARRIVE_RANGE) {
    progressText = `到了！請走到${sideLabel}人行道`;
  } else {
    const dist = lv.hideDistanceHint
      ? `${Math.floor(position)} m`
      : `${Math.floor(position)} / ${lv.goalDistance} m`;
    progressText = dist + (showSideHint ? `（終點在${sideLabel}）` : "");
  }
  hud.setStatus(hearts, TUNING.maxHearts, levelIndex, progressText, timeLeft);
  debug.update(dt, () => {
    const c = traffic.counts(obstacles);
    return [
      `state ${state}`,
      `level ${levelIndex + 1} (${lv.playerForm})` +
        (levelIndex >= LEVELS.length
          ? `  [endless 第${levelIndex - LEVELS.length + 1}關]`
          : ""),
      `pos ${position.toFixed(1)} / max ${maxDistance.toFixed(1)} / goal ${lv.goalDistance}`,
      `time ${timeLeft.toFixed(1)}s`,
      `spawnInterval ${lv.spawnInterval}s  speedScale ${lv.speedScale}`,
      `backdrop ${world.backdropInfo}  (按 2 切換)`,
      `cars ${c.total} (turning ${c.turning})  bikes ${c.bikes} (in lane ${c.bikesInLane}, stopped ${c.bikesStopped}, clipping ${c.bikeClips})  obstacles ${obstacles.count}  intersections ${intersections.count}`,
    ].join("\n");
  });

  player.tick(dt); // 動畫每一幀都推進（結算畫面也要，倒下動畫才播得完）
  updateCamera(dt);
  world.updateBackdrop(camera.position.x);
  renderer.render(world.scene, camera);
});

startLevel(0);
