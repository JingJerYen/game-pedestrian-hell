// 車輛分兩種：
// 迎面車（在可玩車道上衝向玩家，會撞死人）；
// 對向車（分隔島另一邊，從鏡頭後方開往遠處，純背景嚇嚇你）。
// 車種（機車/汽車/卡車）定義在 tuning.ts 的 vehicles；
// 生成密度與車速倍率由目前關卡（LevelConfig）決定。

import * as THREE from "three";
import {
  TUNING,
  colX,
  bgLaneX,
  randomVehicleType,
  type VehicleType,
  type LevelConfig,
} from "./tuning";
import { aabbHit, type Size3 } from "./collision";
import type { Player } from "./player";

interface Car {
  mesh: THREE.Mesh;
  speed: number; // 車自己的車速（會加在世界捲動之上）
  size: Size3; // 碰撞尺寸（依車種不同）
}

export class Traffic {
  private readonly oncoming: Car[] = [];
  private readonly background: Car[] = [];
  private spawnTimer = 0;
  private bgSpawnTimer = 0;
  // 每種車共用一份幾何，生成時只換材質顏色
  private readonly geometries = new Map<VehicleType, THREE.BoxGeometry>();

  constructor(private readonly scene: THREE.Scene) {
    for (const [type, v] of Object.entries(TUNING.vehicles)) {
      this.geometries.set(
        type as VehicleType,
        new THREE.BoxGeometry(v.size.x, v.size.y, v.size.z),
      );
    }
  }

  // dz = 這一幀世界捲了多少；blockedCols = 被違停車佔住、不該生成車的車道
  update(
    dt: number,
    dz: number,
    blockedCols: ReadonlySet<number>,
    level: LevelConfig,
  ): void {
    const t = TUNING;

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = level.spawnInterval;
      this.spawnOncoming(blockedCols, level);
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

  private makeCar(
    type: VehicleType,
    x: number,
    z: number,
    speedScale: number,
  ): Car {
    const v = TUNING.vehicles[type];
    const color = v.colors[Math.floor(Math.random() * v.colors.length)];
    const mesh = new THREE.Mesh(
      this.geometries.get(type)!,
      new THREE.MeshLambertMaterial({ color }),
    );
    mesh.position.set(x, v.size.y / 2, z);
    this.scene.add(mesh);
    return {
      mesh,
      speed:
        THREE.MathUtils.lerp(v.speedMin, v.speedMax, Math.random()) * speedScale,
      size: v.size,
    };
  }

  private spawnOncoming(
    blockedCols: ReadonlySet<number>,
    level: LevelConfig,
  ): void {
    const t = TUNING;
    const candidates: number[] = [];
    for (let col = 1; col <= t.roadLanes; col++) {
      if (!blockedCols.has(col)) candidates.push(col);
    }
    if (candidates.length === 0) return; // 車道全被違停佔滿就這輪不生
    const col = candidates[Math.floor(Math.random() * candidates.length)];
    const type = randomVehicleType();
    // 依車種的 wander 在車道內隨機偏移（機車會鑽邊邊，留出可以側身閃的縫）
    const offset = (Math.random() * 2 - 1) * TUNING.vehicles[type].wander;
    this.oncoming.push(
      this.makeCar(type, colX(col) + offset, -t.spawnDistance, level.speedScale),
    );
  }

  private spawnBackground(): void {
    const lane = Math.floor(Math.random() * TUNING.bgLanes);
    // 從鏡頭後方開出來；背景車不吃關卡難度
    this.background.push(this.makeCar(randomVehicleType(), bgLaneX(lane), 18, 1));
  }

  hitsPlayer(player: Player): boolean {
    return this.oncoming.some((car) =>
      aabbHit(player.mesh.position, player.size, car.mesh.position, car.size),
    );
  }

  // debug overlay 用
  counts(): { oncoming: number; background: number } {
    return { oncoming: this.oncoming.length, background: this.background.length };
  }

  reset(): void {
    for (const car of [...this.oncoming, ...this.background]) {
      this.scene.remove(car.mesh);
    }
    this.oncoming.length = 0;
    this.background.length = 0;
    this.spawnTimer = 1.5; // 開場給一口氣的時間
    this.bgSpawnTimer = 0.5;
  }
}
