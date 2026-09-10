// 車輛：迎面車（左半邊，衝向鏡頭）＋同向車（右半邊，從你背後來）。
// 拆了分隔島之後兩種都會撞死人。
// 路邊車道的車（卡車除外）到路口會右轉，掃過人行道延伸的斑馬線——
// 迎面車往你的左邊掃、同向車往你的右邊掃。

import * as THREE from "three";
import {
  TUNING,
  colX,
  LAST_ROAD_COL,
  RIGHT_SIDEWALK_COL,
  WALK_MIN_X,
  WALK_MAX_X,
  randomVehicleType,
  type VehicleType,
  type LevelConfig,
  type DeathCause,
} from "./tuning";
import { aabbHit, type Size3 } from "./collision";
import { preloadVehicleSkins, vehicleMaterial } from "./vehicleskins";
import type { Player } from "./player";
import type { Intersections } from "./intersections";
import type { Obstacles } from "./obstacles";

interface Car {
  mesh: THREE.Mesh;
  speed: number; // 想開的車速（會加在世界捲動之上）
  effSpeed: number; // 這一幀實際的車速（被前車擋住時會低於 speed）
  size: Size3;
  dir: 1 | -1; // 1 = 迎面（往 +Z 衝向鏡頭）、-1 = 同向（往 -Z 遠去）
  turner: boolean; // 到路口會不會右轉
  mode: "straight" | "turning" | "done"; // done = 轉完 90 度、橫向駛離
  theta: number; // 已轉的角度（0 ~ π/2）
  baseX: number; // 自己車道的位置（含 wander）
  avoid: number; // 繞開路障的橫向偏移
  sidewalkBike: boolean; // 人行道腳踏車（不轉彎、繞路障時往馬路那側閃）
  kind: "scooter" | "car" | "truck" | "bike"; // 車種（死亡字幕要報兇手）
}

export class Traffic {
  private readonly cars: Car[] = [];
  private spawnTimer = 0;
  private bgSpawnTimer = 0;
  private bikeTimer = 0;
  // 每種車共用一份幾何，生成時只換材質顏色
  private readonly geometries = new Map<VehicleType, THREE.BoxGeometry>();
  private readonly bikeGeometry = new THREE.BoxGeometry(
    TUNING.bike.size.x,
    TUNING.bike.size.y,
    TUNING.bike.size.z,
  );

  constructor(private readonly scene: THREE.Scene) {
    for (const [type, v] of Object.entries(TUNING.vehicles)) {
      this.geometries.set(
        type as VehicleType,
        new THREE.BoxGeometry(v.size.x, v.size.y, v.size.z),
      );
    }
    preloadVehicleSkins(); // 有貼圖就換皮，沒有就維持色塊
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
    // 人行道腳踏車（關卡有設 bikeInterval 才有）
    if (level.bikeInterval) {
      this.bikeTimer -= dt;
      if (this.bikeTimer <= 0) {
        this.bikeTimer = level.bikeInterval;
        this.spawnBike(level, obstacles);
      }
    }

    const centers = intersections.centers();
    const turnStep = (Math.PI / 2) * (dt / t.intersection.turnSeconds);

    // 跟車（不超車）：同車道、同方向、前方間隙太小 → 這一幀速度收斂到不超過前車。
    // 參考的是前車「上一幀」的實際速度，一幀的延遲讓車隊自然收斂，不用管計算順序。
    const newEff: number[] = [];
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      let eff = car.speed;
      if (car.mode === "straight") {
        for (const other of this.cars) {
          if (other === car || other.mode !== "straight" || other.dir !== car.dir) continue;
          if (
            Math.abs(other.mesh.position.x - car.mesh.position.x) > t.followXRange
          )
            continue;
          const ahead =
            (other.mesh.position.z - car.mesh.position.z) * car.dir;
          const gap = ahead - (car.size.z + other.size.z) / 2;
          if (ahead > 0 && gap < t.followDistance) {
            eff = Math.min(eff, other.effSpeed);
          }
        }
      }
      newEff.push(eff);
    }
    this.cars.forEach((car, i) => (car.effSpeed = newEff[i]));

    for (let i = this.cars.length - 1; i >= 0; i--) {
      const car = this.cars[i];
      const p = car.mesh.position;
      p.z += dz; // 世界捲動人人有份

      if (car.mode === "straight") {
        // 避讓路障：同向車追上違停就往內側（-X）繞；
        // 人行道腳踏車遇到路障就往馬路那側繞（跟行人一樣被逼下馬路）
        const avoidDir = car.sidewalkBike
          ? car.baseX < 0
            ? 1
            : -1
          : car.dir === -1
            ? -1
            : 0;
        if (avoidDir !== 0) {
          let want = obstacles.hasObstacleAhead(car.baseX, p.z, 16, car.dir)
            ? avoidDir * TUNING.laneWidth * (car.sidewalkBike ? 0.9 : 1)
            : 0;
          // 腳踏車讓車（一）：要繞下馬路但目標車道有車 → 在路障前煞停等空檔
          if (
            car.sidewalkBike &&
            want !== 0 &&
            Math.abs(car.avoid) < t.bikeYield.commitDist && // 繞出去一半就不回頭
            this.laneBusy(car.baseX + want, p.z)
          ) {
            want = 0;
            car.effSpeed = 0;
          }
          car.avoid = THREE.MathUtils.damp(car.avoid, want, 3, dt);
          p.x = car.baseX + car.avoid;
        }
        // 腳踏車讓車（二）：附近有車正在轉彎（會掃過人行道延伸段）→ 煞停讓它過
        if (car.sidewalkBike && this.turnerNear(p.z)) car.effSpeed = 0;
        p.z += car.dir * car.effSpeed * dt; // 被前車/讓車擋住時 effSpeed < speed
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

      // 往 -Z 開的（同向車/腳踏車）從 z=18 生成，回收線要放更後面，
      // 不然速度比玩家慢的會一生成就被收掉
      const backLimit = car.dir === 1 ? t.despawnZ + car.size.z : 24;
      const gone =
        p.z > backLimit ||
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
      vehicleMaterial(type, color), // 有貼圖=貼圖箱子，沒貼圖=純色（vehicleskins.ts）
    );
    // 迎面車從遠處生成；同向車從鏡頭後方開出來（會突然從你背後出現，這是設計）
    const z = dir === 1 ? -t.spawnDistance : 18;
    const baseX = colX(col) + offset;
    mesh.position.set(baseX, v.size.y / 2, z);
    if (dir === -1) mesh.rotation.y = Math.PI;
    this.scene.add(mesh);
    // 左（迎面）右（同向）車速可分開調，沒個別設定就用 speedScale
    const scale =
      dir === 1
        ? (level.speedScaleLeft ?? level.speedScale)
        : (level.speedScaleRight ?? level.speedScale);
    const speed =
      THREE.MathUtils.lerp(v.speedMin, v.speedMax, Math.random()) * scale;
    this.cars.push({
      mesh,
      speed,
      effSpeed: speed,
      size: v.size,
      dir,
      turner,
      mode: "straight",
      theta: 0,
      baseX,
      avoid: 0,
      sidewalkBike: false,
      kind: type,
    });
  }

  // 人行道腳踏車：慢、會蛇行、撞到照樣死。方向依關卡設定（迎面/背後/雙向）
  private spawnBike(level: LevelConfig, obstacles: Obstacles): void {
    const b = TUNING.bike;
    const dirs = level.bikeDirs ?? "both";
    const dir: 1 | -1 =
      dirs === "toward" ? 1 : dirs === "away" ? -1 : Math.random() < 0.5 ? 1 : -1;
    const col = Math.random() < 0.5 ? 0 : RIGHT_SIDEWALK_COL; // 左右人行道隨機
    const baseX = colX(col) + (Math.random() * 2 - 1) * b.wander;
    // 出生點附近有路障就先不生（不然會直接生在路障裡面）
    const spawnZ = dir === 1 ? -TUNING.spawnDistance : 18;
    if (obstacles.hasObstacleAhead(baseX, spawnZ - dir * 6, 12, dir)) {
      this.bikeTimer = 0.4; // 過一下再試
      return;
    }
    const color = b.colors[Math.floor(Math.random() * b.colors.length)];
    const mesh = new THREE.Mesh(
      this.bikeGeometry,
      vehicleMaterial("bike", color), // 腳踏車也吃同一套貼皮管線
    );
    mesh.position.set(baseX, b.size.y / 2, spawnZ);
    if (dir === -1) mesh.rotation.y = Math.PI;
    this.scene.add(mesh);
    const speed = THREE.MathUtils.lerp(b.speedMin, b.speedMax, Math.random());
    this.cars.push({
      mesh,
      speed,
      effSpeed: speed,
      size: b.size,
      dir,
      turner: false,
      mode: "straight",
      theta: 0,
      baseX,
      avoid: 0,
      sidewalkBike: true,
      kind: "bike",
    });
  }

  // 腳踏車讓車用：目標車道位置附近有沒有（非腳踏車的）車
  private laneBusy(targetX: number, z: number): boolean {
    const y = TUNING.bikeYield;
    return this.cars.some(
      (o) =>
        !o.sidewalkBike &&
        o.mode === "straight" &&
        Math.abs(o.mesh.position.x - targetX) < TUNING.laneWidth * 0.7 &&
        Math.abs(o.mesh.position.z - z) < y.laneClearRange,
    );
  }

  // 腳踏車讓車用：附近有沒有車正在轉彎（轉彎中或轉完橫向駛離都算）
  private turnerNear(z: number): boolean {
    return this.cars.some(
      (o) =>
        o.mode !== "straight" &&
        Math.abs(o.mesh.position.z - z) < TUNING.bikeYield.turnerRange,
    );
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

  // 回報死因（兇手車種；正在轉彎的算 "turning"）；沒撞到回傳 null
  hitsPlayer(player: Player): Exclude<DeathCause, "timeout"> | null {
    for (const car of this.cars) {
      if (
        aabbHit(player.mesh.position, player.size, car.mesh.position, this.hitSize(car))
      ) {
        return car.mode !== "straight" ? "turning" : car.kind;
      }
    }
    return null;
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
    this.bikeTimer = 2;
  }
}
