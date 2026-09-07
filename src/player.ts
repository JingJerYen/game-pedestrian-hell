// 玩家：一個藍色方塊（M6 換成行人 sprite）。
// 只負責左右換道；前進感全部由世界捲動製造，玩家的 Z 永遠是 0。

import * as THREE from "three";
import { TUNING, laneX } from "./tuning";

export class Player {
  readonly mesh: THREE.Mesh;
  readonly size = TUNING.playerSize;
  private lane = Math.floor(TUNING.laneCount / 2); // 從中間車道出發

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
    this.lane = THREE.MathUtils.clamp(this.lane + dir, 0, TUNING.laneCount - 1);
  }

  update(dt: number): void {
    // 往目標車道平滑滑過去（damp 是不受幀率影響的平滑插值）
    this.mesh.position.x = THREE.MathUtils.damp(
      this.mesh.position.x,
      laneX(this.lane),
      TUNING.laneChangeDamp,
      dt,
    );
  }

  reset(): void {
    this.lane = Math.floor(TUNING.laneCount / 2);
    this.mesh.position.set(laneX(this.lane), this.size.y / 2, 0);
  }
}
