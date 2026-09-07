// 進入點：組裝所有模組、跑遊戲迴圈、管理 running/dead 狀態。
// 每一幀的順序：讀輸入算捲動量 → 被路障夾住 → 世界/路障/車輛照著動 →
// 玩家橫移 → 判死 → 畫面。

import * as THREE from "three";
import { TUNING } from "./tuning";
import { World } from "./world";
import { Player } from "./player";
import { Traffic } from "./traffic";
import { Obstacles } from "./obstacles";
import { Hud } from "./hud";

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

// 按住 ↑/W 前進、↓/S 後退（用 keydown/keyup 追蹤「現在按著哪些鍵」）
const held = new Set<string>();
const KEY_ALIAS: Record<string, string> = {
  ArrowUp: "up", w: "up", W: "up",
  ArrowDown: "down", s: "down", S: "down",
};
window.addEventListener("keydown", (e) => {
  const key = KEY_ALIAS[e.key];
  if (key) held.add(key);
});
window.addEventListener("keyup", (e) => {
  const key = KEY_ALIAS[e.key];
  if (key) held.delete(key);
});

let state: "running" | "dead" = "running";
let position = 0; // 目前走到第幾公尺（後退會減少）
let maxDistance = 0; // 最遠走到幾公尺（= 分數，路障生成也看它）
let diedAt = 0; // 死亡時間戳，避免死亡瞬間誤觸重來

function reset(): void {
  position = 0;
  maxDistance = 0;
  player.reset();
  traffic.reset();
  obstacles.reset();
  hud.hideDeath();
  state = "running";
}

window.addEventListener("keydown", () => {
  if (state === "dead" && performance.now() - diedAt > 400) reset();
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

  if (state === "running") {
    // 世界捲動量由玩家輸入決定；車輛自己的車速在 traffic 裡另外加
    let dz = 0;
    if (held.has("up")) dz = TUNING.walkSpeed * dt;
    else if (held.has("down")) dz = -TUNING.backSpeed * dt;
    dz = Math.max(dz, -position); // 不能退到起點之前
    dz = obstacles.clampScroll(player.mesh.position, player.size, dz); // 被路障擋住

    world.update(dz);
    obstacles.update(dz, maxDistance);
    traffic.update(dt, dz, obstacles.occupiedRoadCols());
    player.update(dt, obstacles);

    position += dz;
    maxDistance = Math.max(maxDistance, position);
    hud.setDistance(maxDistance);

    if (traffic.hitsPlayer(player)) {
      state = "dead";
      diedAt = performance.now();
      hud.showDeath(maxDistance);
    }
  }

  updateCamera(dt);
  renderer.render(world.scene, camera);
});
