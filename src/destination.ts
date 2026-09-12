// 目的地建築：關卡指定 goalSide 時，終點距離處、指定側人行道外會出現一棟
// 目的地大樓（公司/醫院/托嬰中心…外觀在 skins.ts）。純視覺地標，
// 過關判定在 main.ts（走到距離 + 站上該側人行道）。

import * as THREE from "three";
import { buildingLineX, type LevelConfig } from "./tuning";
import { makeDestinationBuilding } from "./skins";

const HALF_DEPTH = 5; // 建築縱深 10 的一半（world.ts 用它隱藏跟終點重疊的一般建築）

export class Destination {
  private group: THREE.Group | null = null;
  private side: "left" | "right" = "right";

  constructor(private readonly scene: THREE.Scene) {}

  update(dz: number, position: number, level: LevelConfig): void {
    if (this.group) {
      this.group.position.z += dz;
      return;
    }
    // 快接近終點時才生成（在霧裡出現，玩家看不到跳變）
    if (!level.goalSide || level.goalDistance - position > 110) return;
    this.side = level.goalSide;
    this.group = makeDestinationBuilding(level.destinationLabel ?? "終點");
    // 貼著建築前緣那條線（有人行道在人行道外、沒有就在車道邊）
    const x = buildingLineX(this.side) + (this.side === "left" ? -4.5 : 4.5);
    this.group.position.set(x, 0, -(level.goalDistance - position));
    this.scene.add(this.group);
  }

  // world.ts 用：隱藏跟目的地重疊的一般建築
  get zone(): { z: number; side: "left" | "right"; margin: number } | null {
    if (!this.group) return null;
    return { z: this.group.position.z, side: this.side, margin: HALF_DEPTH + 5 };
  }

  reset(): void {
    if (this.group) this.scene.remove(this.group);
    this.group = null;
  }
}
