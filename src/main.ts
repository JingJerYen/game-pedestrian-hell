// 進入點：組裝所有模組、跑遊戲迴圈、管理關卡狀態機。
// 狀態流：levelStart（橫幅，自動開始）→ running →
//   過關 → clear（抵達畫面，停 clearSeconds 秒或按鍵）→ 下一關 levelStart（手寫關卡全過 → 無盡模式）
//   失敗（被撞/超時）→ fail（扣一❤）→ 按鍵重來本關；❤用完 → 按鍵回第一關
// 無盡模式（levelIndex === LEVELS.length）：沒終點沒時限、一條命，難度隨距離爬（levelgen.ts）；
//   死了結算最遠距離，按鍵從無盡起點再來

import * as THREE from "three";
import { TUNING, LEVELS, LAYOUT, hasSidewalk, walkMinX, walkMaxX, type PlayerForm } from "./tuning";
import { endlessLevel, endlessStage } from "./levelgen";
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
import { buildingModelsReady, makeTrafficLight, makeVehicleSignal } from "./skins";
import { vehicleModelsReady, allVehiclePrototypes } from "./vehicleskins";
import { charactersReady, makeCharacterRig } from "./charskins";

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

// 測試熱鍵：1 = 換下一種玩家型態（步行 → 嬰兒車 → 輪椅 → 步行…）；2 = 換下一張背景圖；
// 3 = 跳下一關：手寫關卡表（LEVELS）一關關跳，最後一關之後是無盡模式，再按回第一關；命數不動，隨時可按。
// 按一次換一張，輪著轉。正式版型態、背景都由關卡表決定。
const FORM_CYCLE: PlayerForm[] = ["walker", "stroller", "wheelchair"];
window.addEventListener("keydown", (e) => {
  if (e.key === "1") {
    const next = (FORM_CYCLE.indexOf(player.form) + 1) % FORM_CYCLE.length;
    player.setForm(FORM_CYCLE[next]);
  } else if (e.key === "2") world.nextBackdrop();
  else if (e.key === "3") startLevel((levelIndex + 1) % (LEVELS.length + 1)); // LEVELS.length 就是無盡模式
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
// （沒有「全破」狀態：手動關卡表走完就接無盡模式，見 levelgen.ts）
let state: "levelStart" | "running" | "clear" | "fail" = "levelStart";
let levelIndex = 0;
const ENDLESS_INDEX = LEVELS.length; // 手寫關卡之後就是無盡模式（只有這一個 index）
function isEndless(): boolean {
  return levelIndex >= ENDLESS_INDEX;
}
let hearts = TUNING.maxHearts;
let position = 0; // 本關目前走到第幾公尺（後退會減少）
let maxDistance = 0; // 本關最遠走到幾公尺（過關與路障生成都看它）
let timeLeft = 0; // 本關剩餘秒數
let bannerTimer = 0; // 開場橫幅倒數，歸零自動開始（素材載完才開始倒）
let loadWait = 0; // 這次開場已經等素材幾秒（超過 TUNING.loadWaitMax 就不等了）
let resultAt = 0; // 失敗/通關畫面出現的時間戳：停留滿 resultHoldSeconds 才接受按鍵
let clearTimer = 0; // 抵達畫面剩幾秒自動進下一關
let endlessStageShown = 0; // 無盡模式目前顯示到第幾階（升階時跳提示）

// 無盡模式最遠紀錄（存在瀏覽器；無痕模式等讀不到就當 0）
const BEST_KEY = "endlessBest";
let bestDistance = 0;
try {
  bestDistance = Number(localStorage.getItem(BEST_KEY)) || 0;
} catch {
  /* 讀不到就用 0 */
}
function saveBest(distance: number): boolean {
  if (distance <= bestDistance) return false;
  bestDistance = distance;
  try {
    localStorage.setItem(BEST_KEY, String(Math.floor(distance)));
  } catch {
    /* 存不了就算了 */
  }
  return true;
}

// 目前這一幀的關卡參數：手寫關卡直接查表；無盡模式依「最遠走到幾公尺」換算難度
function level() {
  return isEndless() ? endlessLevel(maxDistance) : LEVELS[levelIndex];
}

function startLevel(index: number): void {
  levelIndex = Math.min(index, ENDLESS_INDEX);
  position = 0;
  maxDistance = 0;
  endlessStageShown = 0;
  const lv = level();
  timeLeft = lv.timeLimit;
  LAYOUT.left = lv.sidewalkLeft ?? "normal";
  LAYOUT.right = lv.sidewalkRight ?? "normal";
  player.setForm(lv.playerForm);
  player.reset(); // 出發點依 LAYOUT（有人行道從人行道出發）
  hitT = -1; // 撞擊效果結束
  pendingFail = null;
  traffic.reset();
  obstacles.reset();
  intersections.reset();
  destination.reset();
  world.resetSidewalkMarks();
  // 背景：手寫關卡照關卡表（沒填就依關數輪換）；無盡模式用 endless.backdrops 的第一張
  world.setBackdrop(isEndless() ? TUNING.endless.backdrops[0] : (lv.backdrop ?? index));
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
  // 小語：關卡有覆寫就用覆寫，否則用目的地總表那句
  const destFlavor = lv.destination ? TUNING.destinations[lv.destination]?.flavor ?? "" : "";
  const flavor = lv.flavorText ?? destFlavor;
  // 目的地任務整關掛在 HUD 左上角（無盡模式沒有目的地）
  hud.setGoal(isEndless() ? "" : [`🎯 ${lv.destination ?? "終點"}`, flavor].filter(Boolean).join("｜"));
  if (isEndless()) {
    const e = TUNING.endless;
    const best = bestDistance > 0 ? `｜最遠紀錄 ${Math.floor(bestDistance)} m` : "";
    hud.showBanner(
      "無盡模式",
      e.entryFlavor,
      `${FORM_LABEL[lv.playerForm]}｜沒有終點，看你能走多遠｜每 ${e.stageLength} m 難一點${best}`,
    );
  } else {
    hud.showBanner(
      `第 ${index + 1} 關`,
      flavor,
      `${FORM_LABEL[lv.playerForm]}｜${goalText}｜時限 ${lv.timeLimit} 秒`,
    );
  }
  bannerTimer = TUNING.bannerSeconds;
  loadWait = 0;
  state = "levelStart";
}

// 抵達終點：出抵達畫面，停 clearSeconds 秒（或停滿 resultHoldSeconds 後按鍵）進下一關
function clearLevel(): void {
  const lv = level();
  state = "clear";
  clearTimer = TUNING.clearSeconds;
  resultAt = performance.now();
  hud.showClear(`到了！${lv.destination ?? "終點"}`, pickFrom(TUNING.clearFlavors), TUNING.resultHoldSeconds * 1000);
}

// 抵達畫面之後進下一關（手寫關卡全過就是無盡模式）
function advanceLevel(): void {
  startLevel(levelIndex + 1);
}

// 開場要等的素材：街屋、車輛（含道具）、玩家角色。全部到了（或載失敗）才開始
function assetsReady(form: PlayerForm): boolean {
  return buildingModelsReady() && vehicleModelsReady() && charactersReady(form);
}

// 開場預熱（素材到齊後、橫幅還在時做一次）：把每一款會出現的東西各放一份進場景，
// 叫 renderer 先編譯所有 shader、把所有貼圖上傳到顯示卡，再拿掉。
// 不做的話這些會在遊戲中「某款第一次出現」時才做，每次頓 50～200 ms
let warmedUp = false;
function warmUp(form: PlayerForm): void {
  if (warmedUp) return;
  warmedUp = true;
  const group = new THREE.Group();
  for (const proto of allVehiclePrototypes()) group.add(proto.clone(true));
  group.add(makeTrafficLight());
  group.add(makeVehicleSignal(3, TUNING.streetNames[0]));
  const rig = makeCharacterRig(form, TUNING.playerForms[form].size);
  if (rig) group.add(rig.root);
  world.scene.add(group); // 街屋此時已在場景裡（applyBuildingModels），一起編譯
  renderer.compile(world.scene, camera);
  world.scene.traverse((obj) => {
    const mats = (obj as THREE.Mesh).material;
    for (const m of Array.isArray(mats) ? mats : mats ? [mats] : []) {
      const map = (m as THREE.MeshStandardMaterial).map;
      if (map) renderer.initTexture(map);
    }
  });
  world.scene.remove(group);
}

// 從池子隨機抽一條（空池回傳空字串）
function pickFrom(pool: readonly string[]): string {
  return pool.length ? pool[Math.floor(Math.random() * pool.length)] : "";
}

// ── 撞擊效果（TUNING.hitFx）：定格 → 慢動作＋鏡頭震動＋紅閃，鏡頭壓低拉近側歪；
//    慢動作結束才出失敗畫面（pendingFail）。超時倍率 0 = 直接出畫面 ──
let hitT = -1; // 撞到之後過了幾秒；-1 = 沒在播
let hitMult = 0; // 兇手倍率（定格與震動）
let pendingFail: (() => void) | null = null; // 慢動作結束要做的事（出失敗畫面）

function failLevel(cause: DeathCause): void {
  const caption = TUNING.deathCaptions[cause];
  player.die(cause); // 被撞倒下／超時搖頭
  state = "fail";
  let sub: string;
  let prompt: string;
  if (isEndless()) {
    // 無盡模式：一條命，結算最遠距離（破紀錄就說一聲）
    const walked = Math.floor(maxDistance);
    const record = saveBest(walked);
    sub = `你走了 ${walked} m` + (record ? "　🏆 新紀錄！" : `　（最遠紀錄 ${Math.floor(bestDistance)} m）`);
    prompt = "按任意鍵再走一次";
  } else {
    hearts--;
    sub = hearts > 0 ? `剩 ${hearts} 條命` : "命用完了……";
    prompt = hearts > 0 ? "按任意鍵重來本關" : "按任意鍵從第一關重新開始";
  }
  const showFail = () => {
    resultAt = performance.now();
    hud.showFail(caption.title, pickFrom(caption.facts), sub, prompt, TUNING.resultHoldSeconds * 1000);
  };
  hitMult = TUNING.hitFx.byCause[cause] ?? 1;
  if (hitMult > 0) {
    hitT = 0;
    pendingFail = showFail;
    hud.flashHit();
  } else {
    hitT = -1;
    pendingFail = null;
    showFail();
  }
}

// 結算畫面的「按任意鍵」：鍵盤和觸控（點螢幕）都走這裡
function tryAdvance(): void {
  if (pendingFail) return; // 撞擊效果還在播、失敗畫面還沒出來
  // 停留滿 resultHoldSeconds 才接受，避免玩家還在狂按方向鍵就跳過了
  if (performance.now() - resultAt < TUNING.resultHoldSeconds * 1000) return;
  if (state === "clear") {
    advanceLevel();
  } else if (state === "fail") {
    if (isEndless()) {
      startLevel(ENDLESS_INDEX); // 無盡模式：從無盡起點再走一次
    } else if (hearts > 0) {
      startLevel(levelIndex);
    } else {
      hearts = TUNING.maxHearts;
      startLevel(0);
    }
  }
}
window.addEventListener("keydown", tryAdvance);

// 虛擬搖桿（手指或滑鼠左鍵拖曳，無段式）；觸控裝置換掉操作提示文字
const touch = new TouchControls(tryAdvance);
if ("ontouchstart" in window) {
  document.getElementById("hint")!.textContent = "按住畫面拖曳移動";
}

// 鏡頭：馬力歐賽車式——在玩家後方偏低、永遠看馬路前方，橫移時稍微跟過去。
// 直式畫面（手機豎拿）自動改用 cameraPortrait 那組參數。
// （第一人稱視角試過又拿掉了：看不到背後來車、又容易暈，決策見 DESIGN.md）
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
  // 橫向跟著人，但離建築線保持 cameraXMargin（人貼牆時鏡頭不跟進招牌底下）
  const targetX = THREE.MathUtils.clamp(
    player.mesh.position.x,
    walkMinX() + t.cameraXMargin,
    walkMaxX() - t.cameraXMargin,
  );
  cameraX = THREE.MathUtils.damp(cameraX, targetX, t.cameraXDamp, dt);
  camera.position.set(cameraX, height, distance);
  if (hitT < 0) {
    camera.lookAt(cameraX, 0.8, -lookAhead);
    return;
  }
  // 撞擊效果：定格結束後鏡頭往下壓、拉近人物、側歪，＋震動
  const fx = TUNING.hitFx;
  const since = hitT - fx.freezeSeconds * hitMult; // 定格結束後過了幾秒
  const p = THREE.MathUtils.smoothstep(since, 0, fx.fallSeconds); // 倒下進度 0 → 1
  const px = player.mesh.position.x;
  camera.position.x += (px - camera.position.x) * (1 - fx.closer) * p; // 拉近人物
  camera.position.z *= 1 - (1 - fx.closer) * p;
  camera.position.y -= fx.drop * p; // 往下壓
  camera.lookAt(px, 0.6, 0);
  camera.rotateZ(fx.roll * p);
  if (since >= 0 && since < fx.shakeSeconds) {
    const amp = fx.shakeAmp * hitMult * (1 - since / fx.shakeSeconds); // 由大到小
    camera.position.x += (Math.random() - 0.5) * 2 * amp;
    camera.position.y += (Math.random() - 0.5) * 2 * amp;
  }
}

// 後方來車的喇叭聲：public/assets/sfx/horn.mp3（沒有檔案就靜音，只剩畫面上的「!」）。
// 警示「剛出現」那一刻響一次，之後至少隔 hornCooldown 秒才再響
const horn = new Audio(`${import.meta.env.BASE_URL}assets/sfx/horn.mp3`);
horn.preload = "auto";
let hornReady = false;
horn.addEventListener("canplaythrough", () => (hornReady = true));
let hornLast = -Infinity; // 上次響的時間（performance.now 毫秒）
let warnWasOn = false;
function updateRearWarning(): void {
  const w = state === "running" ? traffic.threatFromBehind(player) : null;
  hud.setRearWarning(w);
  const on = w !== null;
  if (on && !warnWasOn && hornReady && performance.now() - hornLast > TUNING.rearWarning.hornCooldown * 1000) {
    hornLast = performance.now();
    horn.currentTime = 0;
    horn.play().catch(() => {}); // 瀏覽器還沒允許播音（沒互動過）就略過
  }
  warnWasOn = on;
}

// debug overlay 用：各模組每幀耗時（毫秒，指數平滑平均），找出邏輯時間花在哪
const prof = { ix: 0, dest: 0, world: 0, obs: 0, traffic: 0, player: 0 };
function profTake(key: keyof typeof prof, t0: number): number {
  const now = performance.now();
  prof[key] = prof[key] * 0.9 + (now - t0) * 0.1;
  return now;
}

const clock = new THREE.Clock();
renderer.setAnimationLoop(() => {
  // dt 上限 0.05 秒：切分頁回來時避免一大步跳幀（穿過車或瞬移）
  const dt = Math.min(clock.getDelta(), 0.05);
  const tFrame0 = performance.now(); // 每幀 JS 耗時量測（debug overlay 顯示）
  const lv = level();
  let animDt = dt; // 人物動畫用的 dt（撞擊定格／慢動作時會變小）

  if (state === "levelStart") {
    loadWait += dt;
    const ready = assetsReady(lv.playerForm) || loadWait > TUNING.loadWaitMax;
    hud.setLoading(!ready);
    if (ready) {
      world.applyBuildingModels(); // 橫幅還在就先把色塊換成街屋，開始時不會閃一下
      warmUp(lv.playerForm); // 先編譯 shader、上傳貼圖（只做一次）
      bannerTimer -= dt; // 素材到齊才開始倒數
    }
    if (bannerTimer <= 0) {
      hud.hideOverlays();
      state = "running";
    }
  } else if (state === "running") {
    // 世界捲動量由玩家輸入決定；車輛自己的車速在 traffic 裡另外加
    // （行人速度：關卡有覆寫就用關卡的，沒有就用全域預設）
    // 按鍵 → 世界方向：mx = 往馬路右邊的量、mz = 往馬路後方的量（-1 ~ 1）。
    // 觸控時用搖桿的類比向量（無段式，方向與力度都連續）；鍵盤是 -1/0/1
    let ix = (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0);
    let iz = held.has("up") ? 1 : held.has("down") ? -1 : 0;
    if (touch.active) {
      ix = touch.axis.x;
      iz = -touch.axis.y;
    }
    const mx = ix;
    const mz = -iz;
    // 行人速度 = 全域速度 × 這關型態的倍率（輪椅慢、嬰兒車略慢）
    const formSpeed = TUNING.playerForms[lv.playerForm].speed;
    let dz = 0;
    if (mz < -1e-3) dz = TUNING.walkSpeed * formSpeed * -mz * dt;
    else if (mz > 1e-3) dz = -TUNING.backSpeed * formSpeed * mz * dt;
    dz = Math.max(dz, -position); // 不能退到起點之前
    dz = obstacles.clampScroll(player.mesh.position, player.size, dz); // 被路障擋住

    let tp = performance.now();
    intersections.update(dz, dt, timeLeft, maxDistance, lv, (z) =>
      obstacles.removeNear(z, TUNING.intersection.roadDepth / 2 + 2),
    );
    tp = profTake("ix", tp);
    destination.update(dz, position, lv);
    tp = profTake("dest", tp);
    world.update(dz, intersections.centers(), destination.zone, obstacles.parkingZones());
    tp = profTake("world", tp);
    obstacles.update(dz, maxDistance, lv, intersections, (x0, x1, z0, z1) =>
      traffic.anyVehicleIn(x0, x1, z0, z1),
    ); // 生成點有車就不生（不然路障會砸在車上）
    tp = profTake("obs", tp);
    traffic.update(dt, dz, obstacles, lv, intersections);
    tp = profTake("traffic", tp);
    // 橫移量與朝向都用世界方向（可以是小數：斜著走就是斜的）
    player.update(dt, mx, -mz, TUNING.strafeSpeed * formSpeed, (p, s) => obstacles.blocksAt(p, s), dz);
    profTake("player", tp);

    position += dz;
    maxDistance = Math.max(maxDistance, position);
    timeLeft -= dt;
    // 無盡模式升階：跳一行提示（難度參數由 level() 依 maxDistance 自動換）
    if (isEndless()) {
      const stage = endlessStage(maxDistance);
      if (stage > endlessStageShown) {
        endlessStageShown = stage;
        const flavors = TUNING.endless.stageFlavors;
        const flavor = flavors.length ? flavors[(stage - 1) % flavors.length] : "";
        hud.showToast(`${stage * TUNING.endless.stageLength} m` + (flavor ? `｜${flavor}` : ""));
        // 每 backdropEveryStages 階換一張背景（淡入淡出，天空霧色跟著慢慢變），照 endless.backdrops 的順序輪
        const every = TUNING.endless.backdropEveryStages;
        const pool = TUNING.endless.backdrops;
        if (every > 0 && pool.length > 0 && stage % every === 0) {
          world.setBackdrop(pool[(stage / every) % pool.length], TUNING.backdrop.fadeSeconds);
        }
      }
    }

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
      // 過關（無盡模式 goalDistance 是 Infinity，永遠不會到這裡）
      clearLevel();
    } else if (hitBy) {
      failLevel(hitBy); // 依兇手車種顯示對應的死亡字幕
    } else if (timeLeft <= 0) {
      failLevel("timeout"); // 無盡模式 timeLeft 是 Infinity，不會超時
    }
  } else if (state === "clear") {
    // 抵達畫面：車流照跑當背景，時間到自動進下一關
    traffic.update(dt, 0, obstacles, lv, intersections);
    clearTimer -= dt;
    if (clearTimer <= 0) advanceLevel();
  } else if (state === "fail" && hitT >= 0) {
    // 撞擊效果：定格（世界與動畫都停）→ 慢動作（車流慢慢跑、人慢慢倒）→ 出失敗畫面；
    // 之後車流繼續用慢動作跑（撞你的車會自己開走）
    const fx = TUNING.hitFx;
    hitT += dt;
    const freeze = fx.freezeSeconds * hitMult;
    if (hitT < freeze) animDt = 0;
    else {
      traffic.update(dt * fx.slowScale, 0, obstacles, lv, intersections);
      if (hitT < freeze + fx.slowSeconds) animDt = dt * fx.slowScale;
      else if (pendingFail) {
        pendingFail();
        pendingFail = null;
      }
    }
  }

  const tSim = performance.now() - tFrame0; // 遊戲邏輯（車流、路障、判定…）

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
  if (isEndless()) {
    // 無盡模式：不顯示命（一條命）、沒有倒數；第四列改顯示最遠紀錄
    const stage = endlessStage(maxDistance);
    hud.setStatus(
      null,
      TUNING.maxHearts,
      `無盡模式｜難度 ${stage + 1}`,
      `${Math.floor(position)} m`,
      Infinity,
      bestDistance > 0 ? `🏆 最遠 ${Math.floor(bestDistance)} m` : "",
    );
  } else {
    hud.setStatus(hearts, TUNING.maxHearts, `第 ${levelIndex + 1} 關`, progressText, timeLeft);
  }
  updateRearWarning();
  debug.update(dt, { sim: tSim, frameStart: tFrame0 }, () => {
    const c = traffic.counts(obstacles);
    return [
      `state ${state}`,
      `level ${levelIndex + 1} (${lv.playerForm})` +
        (isEndless()
          ? `  [endless 第 ${endlessStage(maxDistance) + 1} 階，每 ${TUNING.endless.stageLength} m 升一階]`
          : `  [LEVELS 第${levelIndex + 1}/${LEVELS.length}關]`) +
        "  (按 3 跳下一關，手寫關卡之後是無盡)",
      `pos ${position.toFixed(1)} / max ${maxDistance.toFixed(1)} / goal ${lv.goalDistance}  best ${bestDistance}`,
      `time ${timeLeft.toFixed(1)}s`,
      `spawnInterval ${lv.spawnInterval.toFixed(2)}s  speedScale ${lv.speedScale.toFixed(2)}  gap ${lv.obstacleGapMin.toFixed(1)}~${lv.obstacleGapMax.toFixed(1)}  road ${lv.obstacleRoadChance.toFixed(2)}  turn ${(lv.turnChance ?? TUNING.intersection.turnChance).toFixed(2)}  bike ${(lv.bikeInterval ?? 0).toFixed(1)}s`,
      `backdrop ${world.backdropInfo}  (按 2 切換)`,
      `邏輯分項 ms: 路口 ${prof.ix.toFixed(1)}  目的地 ${prof.dest.toFixed(1)}  世界 ${prof.world.toFixed(1)}  路障 ${prof.obs.toFixed(1)}  車流 ${prof.traffic.toFixed(1)}  玩家 ${prof.player.toFixed(1)}`,
      `draw calls ${renderer.info.render.calls}  triangles ${renderer.info.render.triangles}  textures ${renderer.info.memory.textures}  geometries ${renderer.info.memory.geometries}`,
      `cars ${c.total} (turning ${c.turning})  bikes ${c.bikes} (in lane ${c.bikesInLane}, stopped ${c.bikesStopped}, clipping ${c.bikeClips})  obstacles ${obstacles.count}  intersections ${intersections.count}`,
    ].join("\n");
  });

  player.tick(animDt); // 動畫每一幀都推進（結算畫面也要，倒下動畫才播得完；撞擊定格／慢動作時跟著慢）
  updateCamera(dt);
  world.updateBackdrop(camera.position.x, dt);
  const tRender0 = performance.now();
  renderer.render(world.scene, camera);
  debug.endFrame(tRender0); // 畫面提交（three.js 送 draw call 給瀏覽器的 CPU 時間；GPU 實際畫圖不算在內）
});

startLevel(0);
