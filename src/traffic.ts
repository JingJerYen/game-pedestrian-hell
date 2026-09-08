// 車輛：迎面車（左半邊，衝向鏡頭）＋同向車（右半邊，從你背後來）。
// 拆了分隔島之後兩種都會撞死人。
// 路邊車道的車（卡車除外）到路口會右轉，掃過人行道延伸的斑馬線——
// 迎面車往你的左邊掃、同向車往你的右邊掃。

import * as THREE from "three";
import {
  TUNING,
  colX,
  LAST_ROAD_COL,
  WALK_MIN_X,
  WALK_MAX_X,
  randomVehicleType,
  type VehicleType,
  type LevelConfig,
} from "./tuning";
import { aabbHit, type Size3 } from "./collision";
import type { Player } from "./player";
import type { Intersections } from "./intersections";
import type { Obstacles } from "./obstacles";

interface Car {
  mesh: THREE.Mesh;
  speed: number; // 車自己的車速（會加在世界捲動之上）
  size: Size3;
  dir: 1 | -1; // 1 = 迎面（往 +Z 衝向鏡頭）、-1 = 同向（往 -Z 遠去）
  turner: boolean; // 到路口會不會右轉
  mode: "straight" | "turning" | "done"; // done = 轉完 90 度、橫向駛離
  theta: number; // 已轉的角度（0 ~ π/2）
  baseX: number; // 自己車道的位置（含 wander）
  avoid: number; // 繞開違停的橫向偏移（同向車用）
}

export class Traffic {
  private readonly cars: Car[] = [];
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

  // dz = 這一幀世界捲了多少
  update(
    dt: number,
    dz: number,
    obstacles: Obstacles,
    level: LevelConfig,
    intersections: Intersections,
  ): void {
    const t = TUNING;
    const blockedCols = obstacles.occupiedRoadCols();

    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = level.spawnInterval;
      this.spawn(1, blockedCols, level);
    }
    this.bgSpawnTimer -= dt;
    if (this.bgSpawnTimer <= 0) {
      this.bgSpawnTimer = t.bgSpawnInterval;
      this.spawn(-1, blockedCols, level);
    }

    const centers = intersections.centers();
    const turnStep = (Math.PI / 2) * (dt / t.intersection.turnSeconds);

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const p = car.mesh.position;
      p.z += dz; // 世界捲動人人有份

      if (car.mode === "straight") {
        p.z += car.dir * car.speed * dt;
        // 同向車會追上右側的違停車：前方有就往內側車道繞，過了再回來
        if (car.dir === -1) {
          const want = obstacles.hasObstacleAhead(car.baseX, p.z, 16)
            ? -TUNING.laneWidth
            : 0;
          car.avoid = THREE.MathUtils.damp(car.avoid, want, 3, dt);
          p.x = car.baseX + car.avoid;
        }
        // 到路口了就開始右轉
        if (car.turner && centers.some((c) => Math.abs(p.z - c) < 1.2)) {
          car.mode = "turning";
        }
      } else if (car.mode === "turning") {
        car.theta = Math.min(car.theta + turnStep, Math.PI / 2);
        if (car.theta >= Math.PI / 2) car.mode = "done";
        const sin = Math.sin(car.theta);
        const cos = Math.cos(car.theta);
        // 迎面車右轉往 -X（你的左邊）；同向車右轉往 +X（你的右邊）
        p.x += -car.dir * sin * car.speed * dt;
        p.z += car.dir * cos * car.speed * dt;
        car.mesh.rotation.y =
          car.dir === 1 ? -car.theta : Math.PI - car.theta;
      } else {
        p.x += -car.dir * car.speed * dt; // 轉完，橫向駛離
      }

      const gone =
        p.z > t.despawnZ + car.size.z ||
        p.z < -(t.spawnDistance + 40) ||
        p.x < WALK_MIN_X - 10 ||
        p.x > WALK_MAX_X + 10;
      if (gone) {
        this.scene.remove(car.mesh);
        this.cars.splice(i, 1);
      }
    }
  }

  private spawn(
    dir: 1 | -1,
    blockedCols: ReadonlySet<number>,
    level: LevelConfig,
  ): void {
    const t = TUNING;
    // 迎面車走 1..roadLanes；同向車走 roadLanes+1..LAST_ROAD_COL
    const first = dir === 1 ? 1 : t.roadLanes + 1;
    const last = dir === 1 ? t.roadLanes : LAST_ROAD_COL;
    const candidates: number[] = [];
    for (let col = first; col <= last; col++) {
      if (!blockedCols.has(col)) candidates.push(col);
    }
    if (candidates.length === 0) return; // 車道全被違停佔滿就這輪不生

    const col = candidates[Math.floor(Math.random() * candidates.length)];
    const type = randomVehicleType();
    const v = t.vehicles[type];
    // 只有「靠人行道那條路邊車道」的車會右轉（卡車不轉）
    const curbCol = dir === 1 ? 1 : LAST_ROAD_COL;
    const turner =
      col === curbCol &&
      type !== "truck" &&
      Math.random() < (level.turnChance ?? t.intersection.turnChance);

    const offset = (Math.random() * 2 - 1) * v.wander;
    const color = v.colors[Math.floor(Math.random() * v.colors.length)];
    const mesh = new THREE.Mesh(
      this.geometries.get(type)!,
      new THREE.MeshLambertMaterial({ color }),
    );
    // 迎面車從遠處生成；同向車從鏡頭後方開出來（會突然從你背後出現，這是設計）
    const z = dir === 1 ? -t.spawnDistance : 18;
    const baseX = colX(col) + offset;
    mesh.position.set(baseX, v.size.y / 2, z);
    if (dir === -1) mesh.rotation.y = Math.PI;
    this.scene.add(mesh);
    this.cars.push({
      mesh,
      speed: THREE.MathUtils.lerp(v.speedMin, v.speedMax, Math.random()) * level.speedScale,
      size: v.size,
      dir,
      turner,
      mode: "straight",
      theta: 0,
      baseX,
      avoid: 0,
    });
  }

  // 轉彎中/轉完的車，碰撞箱要跟著車頭方向近似調整
  private hitSize(car: Car): Size3 {
    if (car.mode === "straight") return car.size;
    if (car.mode === "done") {
      return { x: car.size.z, y: car.size.y, z: car.size.x }; // 車身橫過來了
    }
    const l = (car.size.x + car.size.z) / 2; // 轉到一半：用方形近似
    return { x: l, y: car.size.y, z: l };
  }

  hitsPlayer(player: Player): boolean {
    return this.cars.some((car) =>
      aabbHit(player.mesh.position, player.size, car.mesh.position, this.hitSize(car)),
    );
  }

  // debug overlay 用
  counts(): { total: number; turning: number } {
    return {
      total: this.cars.length,
      turning: this.cars.filter((c) => c.mode !== "straight").length,
    };
  }

  reset(): void {
    for (const car of this.cars) this.scene.remove(car.mesh);
    this.cars.length = 0;
    this.spawnTimer = 1.5; // 開場給一口氣的時間
    this.bgSpawnTimer = 0.5;
  }
}
