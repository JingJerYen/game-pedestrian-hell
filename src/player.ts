// 玩家：一個色塊（之後換成行人 sprite）。
// 橫向是連續滑動（按住 ←→），不吸附車道中心——所以「身形寬度」是真實的難度：
// 型態（單人/嬰兒車/輪椅）定義在 tuning.ts 的 playerForms，先用 1/2/3 鍵測試。
// 前進由 main.ts 的世界捲動處理，玩家的 Z 永遠固定在 0。

import * as THREE from "three";
import { TUNING, colX, WALK_MIN_X, WALK_MAX_X, type PlayerForm } from "./tuning";
import type { Size3 } from "./collision";
import type { Obstacles } from "./obstacles";

export class Player {
  readonly mesh: THREE.Mesh;
  size: Size3 = TUNING.playerForms.walker.size; // 目前型態的碰撞尺寸

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial(),
    );
    this.setForm("walker");
    this.reset();
    scene.add(this.mesh);

    // 測試用：切換玩家型態（正式版會由難度系統決定）
    window.addEventListener("keydown", (e) => {
      if (e.key === "1") this.setForm("walker");
      if (e.key === "2") this.setForm("stroller");
      if (e.key === "3") this.setForm("wheelchair");
    });
  }

  setForm(form: PlayerForm): void {
    const { size, color } = TUNING.playerForms[form];
    this.size = size;
    this.mesh.geometry.dispose();
    this.mesh.geometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    (this.mesh.material as THREE.MeshLambertMaterial).color.set(color);
    this.mesh.position.y = size.y / 2;
  }

  // dirX：-1 往左、+1 往右、0 不動（由 main.ts 從按鍵算出）
  update(dt: number, dirX: number, obstacles: Obstacles): void {
    if (dirX === 0) return;
    const oldX = this.mesh.position.x;
    this.mesh.position.x = THREE.MathUtils.clamp(
      oldX + dirX * TUNING.strafeSpeed * dt,
      WALK_MIN_X + this.size.x / 2,
      WALK_MAX_X - this.size.x / 2,
    );
    // 橫移會撞進路障就退回原位（貼著路障停下）
    if (obstacles.blocksAt(this.mesh.position, this.size)) {
      this.mesh.position.x = oldX;
    }
  }

  reset(): void {
    this.mesh.position.set(colX(0), this.size.y / 2, 0); // 從人行道出發
  }
}
