// 車輛分兩種：
// 迎面車（在可玩車道上衝向玩家，會撞死人）；
// 對向車（分隔島另一邊，從鏡頭後方開往遠處，純背景嚇嚇你）。
// 兩種都有自己的車速，不管玩家走不走都在動。

import * as THREE from "three";
import { TUNING, colX, bgLaneX } from "./tuning";
import { aabbHit } from "./collision";
import type { Player } from "./player";

interface Car {
  mesh: THREE.Mesh;
  speed: number; // 車自己的車速（會加在世界捲動之上）
}

const CAR_COLORS = [0xd94f4f, 0xe8e8e8, 0x4fd97a, 0xf2c14e, 0x9b59d0, 0x555560];

export class Traffic {
  private readonly oncoming: Car[] = [];
  private readonly background: Car[] = [];
  private spawnTimer = 0;
  private bgSpawnTimer = 0;
  private readonly geometry: THREE.BoxGeometry;

  constructor(private readonly scene: THREE.Scene) {
    const { carSize } = TUNING;
    this.geometry = new THREE.BoxGeometry(carSize.x, carSize.y, carSize.z);
  }

  // dz = 這一幀世界捲了多少；blockedCols = 被違停車佔住、不該生成車的車道
  update(dt: number, dz: number, blockedCols: ReadonlySet<number>): void {
    const t = TUNING;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = t.spawnInterval;
      this.spawnOncoming(blockedCols);
    }
    this.bgSpawnTimer -= dt;
    if (this.bgSpawnTimer <= 0) {
      this.bgSpawnTimer = t.bgSpawnInterval;
      this.spawnBackground();
    }

    // 迎面車：世界捲動 + 自己的車速，衝向鏡頭
    for (let i = this.oncoming.length - 1; i >= 0; i--) {
      const car = this.oncoming[i];
      car.mesh.position.z += dz + car.speed * dt;
      if (car.mesh.position.z > t.despawnZ) {
        this.scene.remove(car.mesh);
        this.oncoming.splice(i, 1);
      }
    }
    // 對向車：世界捲動 - 自己的車速，開往遠處
    for (let i = this.background.length - 1; i >= 0; i--) {
      const car = this.background[i];
      car.mesh.position.z += dz - car.speed * dt;
      if (car.mesh.position.z < -(t.spawnDistance + 40)) {
        this.scene.remove(car.mesh);
        this.background.splice(i, 1);
      }
    }
  }

  private makeCar(x: number, z: number): THREE.Mesh {
    const color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    const mesh = new THREE.Mesh(
      this.geometry,
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, TUNING.carSize.y / 2, z);
    this.scene.add(mesh);
    return mesh;
  }

  private spawnOncoming(blockedCols: ReadonlySet<number>): void {
    const t = TUNING;
    const candidates: number[] = [];
    for (let col = 1; col <= t.roadLanes; col++) {
      if (!blockedCols.has(col)) candidates.push(col);
    }
    if (candidates.length === 0) return; // 車道全被違停佔滿就這輪不生
    const col = candidates[Math.floor(Math.random() * candidates.length)];
    this.oncoming.push({
      mesh: this.makeCar(colX(col), -t.spawnDistance),
      speed: THREE.MathUtils.lerp(t.carSpeedMin, t.carSpeedMax, Math.random()),
    });
  }

  private spawnBackground(): void {
    const t = TUNING;
    const lane = Math.floor(Math.random() * t.bgLanes);
    this.background.push({
      mesh: this.makeCar(bgLaneX(lane), 18), // 從鏡頭後方開出來
      speed: THREE.MathUtils.lerp(t.bgCarSpeedMin, t.bgCarSpeedMax, Math.random()),
    });
  }

  hitsPlayer(player: Player): boolean {
    return this.oncoming.some((car) =>
      aabbHit(player.mesh.position, player.size, car.mesh.position, TUNING.carSize),
    );
  }

  reset(): void {
    for (const car of [...this.oncoming, ...this.background]) {
      this.scene.remove(car.mesh);
    }
    this.oncoming.length = 0;
    this.background.length = 0;
    this.spawnTimer = 1.5; // 重生後給一口氣的時間
    this.bgSpawnTimer = 0.5;
  }
}
