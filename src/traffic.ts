// 車輛：迎面車（左半邊，衝向鏡頭）＋同向車（右半邊，從你背後來）。
// 拆了分隔島之後兩種都會撞死人。
// 路邊車道的車（卡車除外）到路口會右轉，掃過人行道延伸的斑馬線——
// 迎面車往你的左邊掃、同向車往你的右邊掃。
//
// 人行道腳踏車也住在這裡：方向永遠跟該側車流同向（左側迎面騎來、右側從你背後來）。
// 遇到人行道路障就切到路邊車道、過了再切回來。切進車道後就跟汽車一樣吃
// 「跟車不超車」的排隊邏輯：後面的車排在它後面、它排在前車後面，不會穿模。
// 路口則是右轉車和腳踏車互相等：掃過範圍內有腳踏車，右轉車停著等；
// 有右轉車接近，還沒進掃過範圍的腳踏車停下讓車。

import * as THREE from "three";
import {
  TUNING,
  colX,
  LAST_ROAD_COL,
  RIGHT_SIDEWALK_COL,
  WALK_MIN_X,
  WALK_MAX_X,
  randomVehicleType,
  hasSidewalk,
  type LevelConfig,
  type DeathCause,
} from "./tuning";
import { aabbHit, type Size3 } from "./collision";
import { preloadVehicleSkins, makeVehicleMesh } from "./vehicleskins";
import type { Player } from "./player";
import type { Intersections } from "./intersections";
import type { Obstacles } from "./obstacles";

interface Car {
  mesh: THREE.Object3D; // 外觀（3D 模型或方塊，vehicleskins.ts 決定）；原點＝碰撞箱中心
  speed: number; // 想開的車速（會加在世界捲動之上）
  effSpeed: number; // 這一幀實際的車速（被前車擋住、讓車時會低於 speed）
  size: Size3;
  dir: 1 | -1; // 1 = 迎面（往 +Z 衝向鏡頭）、-1 = 同向（往 -Z 遠去）
  turner: boolean; // 到路口會不會右轉
  mode: "straight" | "turning" | "done"; // done = 轉完 90 度、橫向駛離
  theta: number; // 已轉的角度（0 ~ π/2）
  baseX: number; // 自己車道的位置（含 wander）；腳踏車＝人行道上的家
  avoid: number; // 汽車繞開違停的橫向偏移（腳踏車不用這個，用 inLane）
  bike: boolean; // 人行道腳踏車
  laneX: number; // 腳踏車用：遇路障要切過去的路邊車道中心
  inLane: boolean; // 腳踏車用：目前目標是路邊車道（true）還是人行道（false）
  stall: "" | "merge" | "return" | "turn"; // 腳踏車用（debug）：這一幀因為什麼原因主動煞停
  kind: "scooter" | "car" | "truck" | "bike"; // 車種（死亡字幕要報兇手）
}

// 腳踏車相對某個路口「右轉掃過範圍」的位置
type SweepPos = "far" | "before" | "in" | "past";

export class Traffic {
  private readonly cars: Car[] = [];
  private spawnTimer = 0;
  private bgSpawnTimer = 0;
  private bikeTimer = 0;

  constructor(private readonly scene: THREE.Scene) {
    preloadVehicleSkins(); // 有 3D 模型/貼圖就換皮，沒有就維持色塊
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
    // 人行道腳踏車（關卡有設 bikeInterval 才有）
    if (level.bikeInterval) {
      this.bikeTimer -= dt;
      if (this.bikeTimer <= 0) {
        this.bikeTimer = level.bikeInterval;
        this.spawnBike(obstacles, centers);
      }
    }

    const turnStep = (Math.PI / 2) * (dt / t.intersection.turnSeconds);

    // 跟車（不超車）：同車道、同方向、前方間隙太小 → 這一幀速度收斂到不超過前車。
    // 參考的是前車「上一幀」的實際速度，一幀的延遲讓車隊自然收斂，不用管計算順序。
    // 腳踏車一決定切進車道就算「在車道上」（followX 直接用車道中心），
    // 後面的車從它開始切的那一刻就會排隊，不會等它切到一半才反應。
    const newEff: number[] = [];
    for (const car of this.cars) {
      let eff = car.speed;
      if (car.mode === "straight") {
        const myX = this.followX(car);
        const myRoad = this.onRoad(car);
        for (const other of this.cars) {
          if (other === car || other.mode !== "straight" || other.dir !== car.dir) continue;
          if (this.onRoad(other) !== myRoad) continue; // 人行道上的腳踏車和馬路上的車互不相干
          if (Math.abs(this.followX(other) - myX) > t.followXRange) continue;
          const ahead = (other.mesh.position.z - car.mesh.position.z) * car.dir;
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
        if (car.bike) {
          this.steerBike(car, dt, obstacles, centers);
        } else if (car.dir === -1 && t.bgLanes >= 2) {
          // 同向車追上違停就往內側（-X）繞（同側只有一線時沒有內側可繞——那側也不會放違停）；
          // 繞出去之後，路邊車道上正好有腳踏車跟我並排就先別切回去（會壓到它）
          const blocked = obstacles.hasObstacleAhead(
            car.baseX,
            car.size.x / 2,
            p.z,
            t.avoidLookAhead,
            car.dir,
          );
          const holdOut = car.avoid < -0.3 && this.bikeBeside(car);
          const want = blocked || holdOut ? -t.laneWidth : 0;
          car.avoid = THREE.MathUtils.damp(car.avoid, want, 3, dt);
          p.x = car.baseX + car.avoid;
        }
        // 到路口了就右轉——但人行道延伸段上還有腳踏車的話先停著等它過
        let turnNow = false;
        if (car.turner) {
          const center = centers.find((c) => Math.abs(p.z - c) < 1.2);
          if (center !== undefined) {
            if (this.bikeInSweep(car, center)) car.effSpeed = 0;
            else turnNow = true;
          }
        }
        p.z += car.dir * car.effSpeed * dt; // 被前車擋住/讓車時 effSpeed < speed
        if (turnNow) car.mode = "turning";
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

      // 往 -Z 開的（同向車/右側腳踏車）從 z=18 生成，回收線要放更後面，
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

  // ── 腳踏車 ──

  // 腳踏車每幀的決策：要不要切到車道、要不要切回來、該不該停下來等
  private steerBike(
    car: Car,
    dt: number,
    obstacles: Obstacles,
    centers: number[],
  ): void {
    const b = TUNING.bike;
    const p = car.mesh.position;
    const halfW = car.size.x / 2 + b.sideMargin;
    car.stall = "";
    const homeAhead = (range: number) =>
      obstacles.hasObstacleAhead(car.baseX, halfW, p.z, range, car.dir);
    const laneAhead = (range: number) =>
      obstacles.hasObstacleAhead(car.laneX, halfW, p.z, range, car.dir);

    if (!car.inLane) {
      if (homeAhead(b.mergeLook)) {
        // 人行道前方有路障：車道沒違停、也沒車會撞上來 → 切出去；不然騎到路障前停著等
        const laneFree =
          !laneAhead(b.mergeLook) && !this.spotBusy(car, car.laneX, TUNING.laneWidth * 0.7);
        if (laneFree) car.inLane = true;
        else if (homeAhead(b.stopGap)) {
          car.effSpeed = 0;
          car.stall = "merge";
        }
      }
    } else {
      // 過了路障、人行道前方一段都乾淨、也沒別台腳踏車擋著 → 切回去；
      // 回不去而車道前方又有違停 → 停在違停前面等
      if (!homeAhead(b.returnLook) && !this.spotBusy(car, car.baseX, 1.2)) car.inLane = false;
      else if (laneAhead(b.stopGap)) {
        car.effSpeed = 0;
        car.stall = "return";
      }
    }
    p.x = THREE.MathUtils.damp(
      p.x,
      car.inLane ? car.laneX : car.baseX,
      b.laneChangeDamp,
      dt,
    );
    // 換道途中：身體「目前」所在的線上前方緊貼著路障就先別往前，等橫向切乾淨再走
    // （不然從路障邊緣起步斜切會擦到路障的角）
    if (obstacles.hasObstacleAhead(p.x, halfW, p.z, car.size.z / 2 + b.cornerGap, car.dir)) {
      car.effSpeed = 0;
      if (!car.stall) car.stall = car.inLane ? "merge" : "return";
    }

    // 路口讓車：還沒進右轉掃過範圍、又有右轉車接近 → 停下來讓它先轉
    if (this.turnDanger(p.z, car.size.z / 2, car.dir, this.onRoad(car), centers)) {
      car.effSpeed = 0;
      car.stall = "turn";
    }
  }

  // 這個位置的腳踏車該不該為右轉車停下：還沒進某個路口的掃過範圍、而那個路口有右轉車要來
  private turnDanger(
    z: number,
    halfLen: number,
    dir: 1 | -1,
    onRoad: boolean,
    centers: number[],
  ): boolean {
    return centers.some(
      (c) =>
        this.sweepPos(z, halfLen, dir, c) === "before" &&
        this.turnerComing(z, dir, onRoad, c),
    );
  }

  // 跟車/空檔判斷用的橫向位置：腳踏車一決定切進車道就算在車道中心
  private followX(car: Car): number {
    return car.bike && car.inLane ? car.laneX : car.mesh.position.x;
  }

  // 算不算「在馬路上」：汽車永遠是；腳踏車要嘛目標是車道、要嘛身體還沒完全離開車道
  private onRoad(car: Car): boolean {
    return (
      !car.bike ||
      car.inLane ||
      Math.abs(car.mesh.position.x - car.laneX) < TUNING.laneWidth * 0.6
    );
  }

  // 腳踏車想切到 targetX 那條線上，有沒有車擋著：
  // 前方只看會不會直接疊到（切進去之後跟車邏輯會排在它後面）；
  // 後方 mergeClearBehind 內「比我快、正在接近」的車要先讓它過——
  // 已經停著或比我慢的不算，不然路口排隊時會你等我、我等你卡死。
  private spotBusy(self: Car, targetX: number, xRange: number): boolean {
    const b = TUNING.bike;
    const z = self.mesh.position.z;
    return this.cars.some((o) => {
      if (o === self || o.mode !== "straight") return false;
      // 汽車暫時閃到內側（等下會切回自己的車道）也算在它原本的車道上
      const dx = Math.min(
        Math.abs(this.followX(o) - targetX),
        o.bike ? Infinity : Math.abs(o.baseX - targetX),
      );
      if (dx >= xRange) return false;
      const ahead = (o.mesh.position.z - z) * self.dir;
      const overlap = (o.size.z + self.size.z) / 2 + 1;
      if (Math.abs(ahead) < overlap) return true;
      return ahead < 0 && -ahead < b.mergeClearBehind && o.effSpeed > self.speed;
    });
  }

  // 汽車用：自己原本的車道上，有沒有（在馬路上的）腳踏車跟我前後重疊——切回去會壓到
  private bikeBeside(car: Car): boolean {
    const z = car.mesh.position.z;
    return this.cars.some((o) => {
      if (!o.bike || o.mode !== "straight" || !this.onRoad(o)) return false;
      if (Math.abs(this.followX(o) - car.baseX) >= TUNING.laneWidth * 0.7) return false;
      return Math.abs(o.mesh.position.z - z) < (car.size.z + o.size.z) / 2 + 1.5;
    });
  }

  // 腳踏車相對路口「右轉掃過範圍」的位置（範圍 = 中心前 sweepBack ～ 中心後 sweepLen）
  private sweepPos(z: number, halfLen: number, dir: 1 | -1, center: number): SweepPos {
    const b = TUNING.bike;
    const s = (z - center) * dir; // 過了中心多遠（負＝還沒到）
    const start = -b.sweepBack - halfLen;
    if (s < start) return s > start - b.yieldDist ? "before" : "far";
    if (s < b.sweepLen + halfLen) return "in";
    return "past";
  }

  // 右轉車用：這個路口的掃過範圍內有沒有（同側的）腳踏車。
  // 排在我後面、同在車道上的腳踏車不算——它超不了車，等它反而互相卡死
  private bikeInSweep(turner: Car, center: number): boolean {
    return this.cars.some((o) => {
      if (!o.bike || o.dir !== turner.dir) return false;
      const behind = (o.mesh.position.z - turner.mesh.position.z) * turner.dir < 0;
      if (behind && this.onRoad(o)) return false;
      return this.sweepPos(o.mesh.position.z, o.size.z / 2, o.dir, center) === "in";
    });
  }

  // 腳踏車用：這個路口有沒有右轉車快到了、或正在轉。
  // 排在我後面、而我也在車道上的右轉車不算（它超不了我）
  private turnerComing(z: number, dir: 1 | -1, onRoad: boolean, center: number): boolean {
    const b = TUNING.bike;
    return this.cars.some((o) => {
      if (o.bike || o.dir !== dir) return false;
      if (o.mode !== "straight") return Math.abs(o.mesh.position.z - center) < b.sweepLen + 4;
      if (!o.turner) return false;
      const behindMe = (o.mesh.position.z - z) * dir < 0;
      if (behindMe && onRoad) return false;
      const toCenter = (center - o.mesh.position.z) * dir;
      return toCenter > -1.5 && toCenter < b.turnerRange;
    });
  }

  // 路障生成用：這塊區域（x0~x1、z0~z1）現在有沒有車。腳踏車正在切過去的目標車道也算
  anyVehicleIn(x0: number, x1: number, z0: number, z1: number): boolean {
    return this.cars.some((o) => {
      const p = o.mesh.position;
      const hs = this.hitSize(o);
      if (p.z + hs.z / 2 < z0 || p.z - hs.z / 2 > z1) return false;
      const xs = [p.x, this.followX(o)];
      return xs.some((x) => x + hs.x / 2 > x0 && x - hs.x / 2 < x1);
    });
  }

  // 生成用：這條線上、這個 z 前後 spawnClearZ 內已經有車了嗎
  private spotTaken(x: number, z: number, xRange: number): boolean {
    return this.cars.some(
      (o) =>
        o.mode === "straight" &&
        Math.abs(this.followX(o) - x) < xRange &&
        Math.abs(o.mesh.position.z - z) < TUNING.spawnClearZ,
    );
  }

  // ── 生成 ──

  private spawn(
    dir: 1 | -1,
    blockedCols: ReadonlySet<number>,
    level: LevelConfig,
  ): void {
    const t = TUNING;
    // 迎面車走 1..roadLanes；同向車走 roadLanes+1..LAST_ROAD_COL
    const first = dir === 1 ? 1 : t.roadLanes + 1;
    const last = dir === 1 ? t.roadLanes : LAST_ROAD_COL;
    // 迎面車從遠處生成；同向車從鏡頭後方開出來（會突然從你背後出現，這是設計）
    const z = dir === 1 ? -t.spawnDistance : 18;
    const candidates: number[] = [];
    for (let col = first; col <= last; col++) {
      if (blockedCols.has(col)) continue;
      if (this.spotTaken(colX(col), z, t.laneWidth * 0.7)) continue; // 生成點被佔著
      candidates.push(col);
    }
    if (candidates.length === 0) return; // 車道全被違停/車佔滿就這輪不生

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
    const mesh = makeVehicleMesh(type, color); // 3D 模型→貼圖箱→色塊（vehicleskins.ts）
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
      bike: false,
      laneX: baseX,
      inLane: false,
      stall: "",
      kind: type,
    });
  }

  // 人行道腳踏車：慢、撞到照樣死。左右人行道隨機，方向跟該側車流同向
  private spawnBike(obstacles: Obstacles, centers: number[]): void {
    const b = TUNING.bike;
    // 只在有人行道的那側生；兩側都沒有就沒有腳踏車
    const canLeft = hasSidewalk("left");
    const canRight = hasSidewalk("right");
    if (!canLeft && !canRight) return;
    const left = canLeft && (!canRight || Math.random() < 0.5);
    const col = left ? 0 : RIGHT_SIDEWALK_COL;
    const dir: 1 | -1 = left ? 1 : -1; // 左側迎面騎來、右側從你背後來
    const laneX = colX(left ? 1 : LAST_ROAD_COL); // 遇路障要切過去的路邊車道
    const baseX = colX(col) + (Math.random() * 2 - 1) * b.wander;
    const spawnZ = dir === 1 ? -TUNING.spawnDistance : 18;
    const halfW = b.size.x / 2 + b.sideMargin;
    // 出生點附近有路障或別台腳踏車就先不生（不然會直接生在別人裡面）
    // 出生點在路口掃過範圍內/前面、又有右轉車要來，也先不生（不然會生在車底下）
    const sweeping = centers.some((c) => {
      const pos = this.sweepPos(spawnZ, b.size.z / 2, dir, c);
      return (pos === "in" || pos === "before") && this.turnerComing(spawnZ, dir, false, c);
    });
    if (
      sweeping ||
      obstacles.hasObstacleAhead(baseX, halfW, spawnZ - dir * 6, 12, dir) ||
      this.spotTaken(baseX, spawnZ, 1.2)
    ) {
      this.bikeTimer = 0.4; // 過一下再試
      return;
    }
    const color = b.colors[Math.floor(Math.random() * b.colors.length)];
    const mesh = makeVehicleMesh("bike", color); // 腳踏車也吃同一套外觀管線
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
      bike: true,
      laneX,
      inLane: false,
      stall: "",
      kind: "bike",
    });
  }

  // ── 碰撞 / 其他 ──

  // 轉彎中/轉完的車，碰撞箱要跟著車頭方向調整：
  // 取「轉了 theta 度的車身」的軸對齊外接框（轉 90 度就是長寬對調）
  private hitSize(car: Car): Size3 {
    if (car.mode === "straight") return car.size;
    const c = Math.abs(Math.cos(car.theta));
    const s = Math.abs(Math.sin(car.theta));
    return {
      x: car.size.x * c + car.size.z * s,
      y: car.size.y,
      z: car.size.x * s + car.size.z * c,
    };
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

  // debug overlay 用。bikeClips = 腳踏車此刻和汽車/路障疊在一起的數量——正常應該永遠是 0
  counts(obstacles: Obstacles): {
    total: number;
    turning: number;
    bikes: number;
    bikesInLane: number;
    bikesStopped: number;
    bikeClips: number;
  } {
    const bikes = this.cars.filter((c) => c.bike);
    let bikeClips = 0;
    for (const b of bikes) {
      const hitCar = this.cars.some(
        (o) =>
          !o.bike &&
          aabbHit(b.mesh.position, b.size, o.mesh.position, this.hitSize(o), 1),
      );
      if (hitCar || obstacles.blocksAt(b.mesh.position, b.size)) bikeClips++;
    }
    return {
      total: this.cars.length,
      turning: this.cars.filter((c) => c.mode !== "straight").length,
      bikes: bikes.length,
      bikesInLane: bikes.filter((c) => c.inLane).length,
      bikesStopped: bikes.filter((c) => c.effSpeed === 0).length,
      bikeClips,
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
