// 全部可調參數都在這裡。調手感 = 改這個檔案，存檔後瀏覽器會自動重新載入。

export const TUNING = {
  // ── 鏡頭（第三人稱、馬力歐賽車式低視角）──
  cameraHeight: 2.4, // 鏡頭離地高度
  cameraDistance: 5.0, // 鏡頭在玩家後方多遠
  cameraFov: 70, // 視野角度（越大越有速度感，也越魚眼）
  cameraLookAhead: 14, // 鏡頭看向玩家前方多遠的地面
  cameraXFollow: 0.6, // 橫移時鏡頭跟過去的比例（0=固定不動、1=完全跟隨）
  cameraXDamp: 4, // 鏡頭橫向跟隨的平滑度（越大跟越緊）

  // ── 道路佈局：【人行道】【迎面車道×roadLanes】【分隔島】【對向車道×bgLanes】──
  laneWidth: 2.6, // 每條車道（與人行道走位）的寬
  roadLanes: 2, // 迎面車道數（可玩區）
  bgLanes: 2, // 對向車道數（純背景，被分隔島擋住）
  medianWidth: 0.9, // 分隔島寬度

  // ── 玩家移動 ──
  walkSpeed: 4.2, // 按住 ↑ 的前進速度（公尺/秒）
  backSpeed: 2.6, // 按住 ↓ 的後退速度
  strafeSpeed: 5.5, // 按住 ←→ 的橫移速度（連續滑動，不吸附車道中心）

  // ── 玩家型態（難度桿之一：體積越大越難閃。測試用 1/2/3 鍵切換）──
  playerForms: {
    walker: { size: { x: 0.8, y: 1.6, z: 0.8 }, color: 0x3b7bff }, // 單人步行
    stroller: { size: { x: 0.9, y: 1.6, z: 1.8 }, color: 0x2bb5a0 }, // 推嬰兒車（前面多一截）
    wheelchair: { size: { x: 1.2, y: 1.45, z: 1.5 }, color: 0xe07b39 }, // 輪椅（更寬）
  },

  // ── 車種（難度桿之二：機車快、卡車大。weight = 出現比重，不用加總成 1）──
  vehicles: {
    // wander = 生成時偏離車道中心的最大量（機車會鑽邊邊，卡車乖乖走正中間）
    scooter: {
      size: { x: 0.9, y: 1.3, z: 2.0 },
      speedMin: 8,
      speedMax: 16,
      weight: 0.35,
      wander: 0.7,
      colors: [0x333338, 0xd94f8a, 0x4fa3d9, 0xf2f2f2],
    },
    car: {
      size: { x: 1.9, y: 1.4, z: 4.2 },
      speedMin: 6,
      speedMax: 13,
      weight: 0.5,
      wander: 0.15,
      colors: [0xd94f4f, 0xe8e8e8, 0x4fd97a, 0xf2c14e, 0x9b59d0, 0x555560],
    },
    truck: {
      size: { x: 2.3, y: 2.6, z: 7.6 },
      speedMin: 5,
      speedMax: 9,
      weight: 0.15,
      wander: 0,
      colors: [0x3d6b9e, 0x5e8f6a, 0x8a8a92, 0xc9a227],
    },
  },

  // ── 車流 ──
  spawnDistance: 90, // 車在玩家前方多遠生成
  despawnZ: 15, // 車跑到玩家後方多遠就回收
  bgSpawnInterval: 1.6, // 對向（背景）車的生成間隔

  // ── 命 ──
  maxHearts: 3, // 失敗扣一條，用完從第一關重來

  // ── 結算畫面 ──
  resultHoldSeconds: 2.5, // 失敗/通關畫面至少停留幾秒才接受按鍵（期間不顯示「按任意鍵」）

  // ── 靜止路障（擋路不致死；「多密、多常違停」由下面的關卡表決定）──
  sidewalkObstacleSize: { x: 2.2, y: 1.3, z: 2.8 }, // 人行道路障（機車堆、攤販…）
  obstacleSpawnZ: 96, // 路障生成在前方多遠（比車生成點再遠一點，避免疊到車）

  // ── 碰撞 ──
  hitboxShrink: 0.75, // 碰撞箱是視覺大小的幾成（從寬判定：差點撞到 > 冤枉死）
} as const;

export type PlayerForm = keyof typeof TUNING.playerForms;
export type VehicleType = keyof typeof TUNING.vehicles;

// ── 關卡表（後台調整用，玩家看不到）──
// 加關卡 = 加一個物件；順序就是關卡順序。
export interface LevelConfig {
  goalDistance: number; // 走到這個距離（公尺）就過關
  timeLimit: number; // 時限（秒），沒走到就失敗、重來本關
  playerForm: PlayerForm; // 這一關的行人型態（walker / stroller / wheelchair）
  spawnInterval: number; // 迎面車生成間隔（秒），越小車越密
  speedScale: number; // 全部迎面車速乘上這個倍率
  obstacleGapMin: number; // 路障最小間距（公尺），越小路障越密
  obstacleGapMax: number;
  obstacleRoadChance: number; // 路障長在路邊車道（違停）而非人行道的機率
  // ↓ 可選：行人速度覆寫。沒寫就用上面 TUNING 的全域值。
  //   例：輪椅關想更慢就加 walkSpeed: 3.2（推薦連 strafeSpeed 一起調，比例才對）
  walkSpeed?: number; // 前進速度（公尺/秒）
  backSpeed?: number; // 後退速度
  strafeSpeed?: number; // 橫移速度
}

export const LEVELS: LevelConfig[] = [
  {
    goalDistance: 20,
    timeLimit: 90,
    playerForm: "walker",
    spawnInterval: 1.3,
    speedScale: 1.0,
    obstacleGapMin: 12,
    obstacleGapMax: 24,
    obstacleRoadChance: 0.2,
  },
  {
    goalDistance: 30,
    timeLimit: 30,
    playerForm: "stroller",
    spawnInterval: 1.0,
    speedScale: 1.1,
    obstacleGapMin: 10,
    obstacleGapMax: 20,
    obstacleRoadChance: 0.3,
  },
  {
    goalDistance: 35,
    timeLimit: 40,
    playerForm: "wheelchair",
    spawnInterval: 0.8,
    speedScale: 1.2,
    obstacleGapMin: 9,
    obstacleGapMax: 18,
    obstacleRoadChance: 0.35,
  },
];

// 依 weight 比重隨機抽一種車
export function randomVehicleType(): VehicleType {
  const entries = Object.entries(TUNING.vehicles) as [
    VehicleType,
    { weight: number },
  ][];
  let roll = Math.random() * entries.reduce((sum, [, v]) => sum + v.weight, 0);
  for (const [type, v] of entries) {
    roll -= v.weight;
    if (roll <= 0) return type;
  }
  return entries[entries.length - 1][0];
}

// ── 佈局換算（改上面的參數就好，下面不用動）──

// 直欄：0 = 人行道、1..roadLanes = 迎面車道。回傳該欄中心的 X 座標。
// （玩家已改成連續橫移，這主要給車輛/路障生成用。）
export function colX(col: number): number {
  return (col - 1) * TUNING.laneWidth;
}


// 迎面車道右緣（分隔島從這裡開始）
export const ROAD_RIGHT = colX(TUNING.roadLanes) + TUNING.laneWidth / 2;
// 對向車道左緣
export const BG_LEFT = ROAD_RIGHT + TUNING.medianWidth;
// 對向車道 i（0 起算）的中心 X
export function bgLaneX(i: number): number {
  return BG_LEFT + (i + 0.5) * TUNING.laneWidth;
}
// 玩家橫移範圍：人行道左緣 ～ 分隔島前
export const WALK_MIN_X = colX(0) - TUNING.laneWidth / 2;
export const WALK_MAX_X = ROAD_RIGHT;
