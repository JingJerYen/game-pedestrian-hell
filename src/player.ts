// 玩家：一個藍色方塊（之後換成行人 sprite）。
// 只負責橫向走位（人行道＋迎面車道之間）；前進由 main.ts 的世界捲動處理，
// 玩家的 Z 永遠固定在 0。

import * as THREE from "three";
import { TUNING, COLS, colX } from "./tuning";
import type { Obstacles } from "./obstacles";

export class Player {
  readonly mesh: THREE.Mesh;
  readonly size = TUNING.playerSize;
  private col = 0; // 從人行道出發

  constructor(scene: THREE.Scene) {
    this.mesh = new THREE.Mesh(
      new THREE.BoxGeometry(this.size.x, this.size.y, this.size.z),
      new THREE.MeshLambertMaterial({ color: 0x3b7bff }),
    );
    this.reset();
    scene.add(this.mesh);

    window.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft" || e.key === "a" || e.key === "A") this.move(-1);
      if (e.key === "ArrowRight" || e.key === "d" || e.key === "D") this.move(1);
    });
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
