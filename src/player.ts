// 玩家：一個色塊（之後換成行人 sprite）。
// 型態（單人/嬰兒車/輪椅）決定碰撞體積，定義在 tuning.ts 的 playerForms；
// 之後由難度系統切換，現在先用 1/2/3 鍵測試。
// 只負責橫向走位；前進由 main.ts 的世界捲動處理，玩家的 Z 永遠固定在 0。

import * as THREE from "three";
import { TUNING, COLS, colX, type PlayerForm } from "./tuning";
import type { Size3 } from "./collision";
import type { Obstacles } from "./obstacles";

export class Player {
  readonly mesh: THREE.Mesh;
  size: Size3 = TUNING.playerForms.walker.size; // 目前型態的碰撞尺寸
  private col = 0; // 從人行道出發

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshLambertMaterial(),
    );
    this.setForm("walker");
    this.reset();
    scene.add(this.mesh);

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this.move(-1);
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this.move(1);
      // 測試用：切換玩家型態（正式版會由難度系統決定）
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

  private move(dir: -1 | 1): void {
    this.col = THREE.MathUtils.clamp(this.col + dir, 0, COLS - 1);
  }

  update(dt: number, obstacles: Obstacles): void {
    // 往目標欄平滑滑過去（damp 是不受幀率影響的平滑插值）
    const oldX = this.mesh.position.x;
    this.mesh.position.x = THREE.MathUtils.damp(
      oldX,
      colX(this.col),
      TUNING.laneChangeDamp,
      dt,
    );
    // 橫移會撞進路障就退回原位，目標欄也改回來（不然會一直往牆上擠）
    if (obstacles.blocksAt(this.mesh.position, this.size)) {
      this.mesh.position.x = oldX;
      this.col = THREE.MathUtils.clamp(
        Math.round(oldX / TUNING.laneWidth) + 1,
        0,
        COLS - 1,
      );
    }
  }

  reset(): void {
    this.col = 0;
    this.mesh.position.set(colX(this.col), this.size.y / 2, 0);
  }
}
