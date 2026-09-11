// 玩家：Kenney Mini Characters 行人（骨架動畫），模型載好前先用色塊撐著。
// 每一關重抽一位路人（台灣行人眾生相）。
// 橫向是連續滑動（按住 ←→），不吸附車道中心——「身形寬度」是真實的難度。
// 前進由 main.ts 的世界捲動處理，玩家的 Z 永遠固定在 0。

import * as THREE from "three";
import {
  TUNING,
  colX,
  WALK_MIN_X,
  WALK_MAX_X,
  type PlayerForm,
  type DeathCause,
} from "./tuning";
import type { Size3 } from "./collision";
import type { Obstacles } from "./obstacles";
import {
  preloadCharacters,
  charactersReady,
  makeCharacterRig,
  type CharacterRig,
} from "./charskins";

export class Player {
  readonly mesh: THREE.Group; // 外層定位用（原點＝碰撞箱中心），內容物是角色或色塊
  size: Size3 = TUNING.playerForms.walker.size; // 目前型態的碰撞尺寸
  private form: PlayerForm = "walker";
  private rig: CharacterRig | null = null;
  private readonly fallback: THREE.Mesh; // 模型還沒載好前的色塊
  private currentAnim = "";

  constructor(scene: THREE.Scene) {
    preloadCharacters();
    this.mesh = new THREE.Group();
    this.fallback = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial(),
    );
    this.mesh.add(this.fallback);
    this.setForm("walker");
    this.reset();
    scene.add(this.mesh);

    // 測試用：切換玩家型態（正式版由關卡表決定）
    window.addEventListener("keydown", (e) => {
      if (e.key === "1") this.setForm("walker");
      if (e.key === "2") this.setForm("stroller");
      if (e.key === "3") this.setForm("wheelchair");
    });
  }

  setForm(form: PlayerForm): void {
    const { size, color } = TUNING.playerForms[form];
    this.form = form;
    this.size = size;
    this.mesh.position.y = size.y / 2;
    this.fallback.geometry.dispose();
    this.fallback.geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    (this.fallback.material as THREE.MeshLambertMaterial).color.set(color);
    this.buildRig();
  }

  // 重組角色（隨機抽一位）。模型還沒載好就先顯示色塊，tick() 會等它載好自動換
  private buildRig(): void {
    if (this.rig) {
      this.mesh.remove(this.rig.root);
      this.rig = null;
    }
    this.currentAnim = "";
    const rig = makeCharacterRig(this.form, this.size);
    this.fallback.visible = rig === null;
    if (rig) {
      this.rig = rig;
      this.mesh.add(rig.root);
      this.play(this.idleAnim());
    }
  }

  private idleAnim(): string {
    return this.form === "wheelchair" ? "wheelchair-sit" : "idle";
  }
  private moveAnim(): string {
    return this.form === "wheelchair" ? "wheelchair-move-forward" : "walk";
  }

  // 切換動畫（同名不重播，只更新速度）；once = 播一次停在最後一格（倒下用）
  private play(name: string, timeScale = 1, once = false): void {
    if (!this.rig) return;
    const action = this.rig.actions.get(name);
    if (!action) return;
    if (this.currentAnim === name) {
      action.timeScale = timeScale;
      return;
    }
    const prev = this.rig.actions.get(this.currentAnim);
    action.reset();
    action.timeScale = timeScale;
    if (once) {
      action.setLoop(THREE.LoopOnce, 1);
      action.clampWhenFinished = true;
    }
    action.play();
    if (prev && prev !== action) prev.crossFadeTo(action, 0.15, false);
    this.currentAnim = name;
  }

  // dirX：-1 往左、+1 往右、0 不動；dirZ：+1 前進、-1 後退、0 不動（按鍵意圖，
  // 決定角色面向哪裡）；dz：這一幀世界捲動量（用來同步走路動畫）
  update(
    dt: number,
    dirX: number,
    dirZ: number,
    strafeSpeed: number,
    obstacles: Obstacles,
    dz: number,
  ): void {
    this.turnToward(dirX, dirZ, dt);
    let movedX = 0;
    if (dirX !== 0) {
      const oldX = this.mesh.position.x;
      this.mesh.position.x = THREE.MathUtils.clamp(
        oldX + dirX * strafeSpeed * dt,
        WALK_MIN_X + this.size.x / 2,
        WALK_MAX_X - this.size.x / 2,
      );
      // 橫移會撞進路障就退回原位（貼著路障停下）
      if (obstacles.blocksAt(this.mesh.position, this.size)) {
        this.mesh.position.x = oldX;
      }
      movedX = this.mesh.position.x - oldX;
    }

    // 動畫跟著「實際移動速度」走：走多快腳擺多快，被擋住/站著就回站姿
    const speed = Math.hypot(dz, movedX) / Math.max(dt, 1e-6);
    if (speed > 0.1) {
      const ratio = THREE.MathUtils.clamp(
        speed / TUNING.walkAnimBaseSpeed,
        0.6,
        2,
      );
      this.play(this.moveAnim(), ratio);
    } else {
      this.play(this.idleAnim());
    }
  }

  // 角色外觀轉向按鍵方向：前進面向遠方（背影）、後退轉過來面向鏡頭、左右就側身，
  // 斜向是 45 度。放開按鍵就維持最後的朝向。只轉外觀，碰撞箱（AABB）不轉。
  private turnToward(dirX: number, dirZ: number, dt: number): void {
    if (dirX === 0 && dirZ === 0) return;
    // mesh 的 -Z 是前進方向：轉 θ 後 -Z 指向 (-sinθ, -cosθ)，要等於 (dirX, -dirZ)
    const target = Math.atan2(-dirX, dirZ);
    const cur = this.mesh.rotation.y;
    // 走最短弧度（差值折進 -π ~ π）
    const delta = Math.atan2(Math.sin(target - cur), Math.cos(target - cur));
    this.mesh.rotation.y = cur + delta * (1 - Math.exp(-TUNING.turnDamp * dt));
  }

  // 每一幀都要呼叫（不分遊戲狀態）：推進動畫、順便完成模型載好後的換裝
  tick(dt: number): void {
    if (!this.rig && charactersReady(this.form)) this.buildRig();
    this.rig?.mixer.update(dt);
  }

  // 死亡動畫：被撞倒下；超時則是無奈搖頭
  die(cause: DeathCause): void {
    this.play(cause === "timeout" ? "emote-no" : "die", 1, true);
  }

  reset(): void {
    this.mesh.position.set(colX(0), this.size.y / 2, 0); // 從人行道出發
    this.mesh.rotation.y = 0; // 面向前方
    this.buildRig(); // 每關換一位路人
  }
}
