// 進入點：組裝所有模組、跑遊戲迴圈、管理 running/dead 狀態。

import * as THREE from "three";
import { TUNING } from "./tuning";
import { World } from "./world";
import { Player } from "./player";
import { Traffic } from "./traffic";
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
const hud = new Hud();

let state: "running" | "dead" = "running";
let distance = 0; // 這一局走了幾公尺
let diedAt = 0; // 死亡時間戳，避免死亡瞬間誤觸重來

function reset(): void {
  distance = 0;
  player.reset();
  traffic.reset();
  hud.hideDeath();
  state = "running";
}

window.addEventListener("keydown", () => {
  if (state === "dead" && performance.now() - diedAt > 400) reset();
});

// 鏡頭：馬力歐賽車式——在玩家後方偏低，換道時稍微跟過去
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
    world.update(dt);
    player.update(dt);
    traffic.update(dt);
    distance += TUNING.scrollSpeed * dt;
    hud.setDistance(distance);

    if (traffic.hitsPlayer(player)) {
      state = "dead";
      diedAt = performance.now();
      hud.showDeath(distance);
    }
  }

  updateCamera(dt);
  renderer.render(world.scene, camera);
});
