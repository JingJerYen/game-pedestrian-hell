// 車輛：在玩家前方遠處生成、迎面開過來、跑到鏡頭後面就移除。
// （M5 才做正式物件池；現在先用最簡單的建立/移除。）

import * as THREE from "three";
import { TUNING, laneX } from "./tuning";
import { aabbHit } from "./collision";
import type { Player } from "./player";

interface Car {
  mesh: THREE.Mesh;
  speed: number; // 車自己的車速（迎面方向，會加在世界捲動速度上）
}

const CAR_COLORS = [0xd94f4f, 0xe8e8e8, 0x4fd97a, 0xf2c14e, 0x9b59d0, 0x555560];

export class Traffic {
  private readonly cars: Car[] = [];
  private spawnTimer = 0;
  private readonly geometry: THREE.BoxGeometry;

  constructor(private readonly scene: THREE.Scene) {
    const { carSize } = TUNING;
    this.geometry = new THREE.BoxGeometry(carSize.x, carSize.y, carSize.z);
  }

  update(dt: number): void {
    const t = TUNING;

    // 生成
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = t.spawnInterval;
      this.spawn();
    }

    // 移動（世界捲動 + 車自己的車速）與回收
    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      car.mesh.position.z += (t.scrollSpeed + car.speed) * dt;
      if (car.mesh.position.z > t.despawnZ) {
        this.scene.remove(car.mesh);
        this.cars.splice(i, 1);
      }
    }
  }

  private spawn(): void {
    const t = TUNING;
    const lane = Math.floor(Math.random() * t.laneCount);
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const mesh = new THREE.Mesh(
      this.geometry,
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(laneX(lane), t.carSize.y / 2, -t.spawnDistance);
    this.scene.add(mesh);
    this.cars.push({
      mesh,
      speed: THREE.MathUtils.lerp(t.carSpeedMin, t.carSpeedMax, Math.random()),
    });
  }

  hitsPlayer(player: Player): boolean {
    return this.cars.some((car) =>
      aabbHit(player.mesh.position, player.size, car.mesh.position, TUNING.carSize),
    );
  }

  reset(): void {
    for (const car of this.cars) this.scene.remove(car.mesh);
    this.cars.length = 0;
    this.spawnTimer = 1.5; // 重生後給一口氣的時間
  }
}
