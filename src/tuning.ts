// 全部可調參數都在這裡。調手感 = 改這個檔案，存檔後瀏覽器會自動重新載入。

export const TUNING = {
  // ── 鏡頭（第三人稱、馬力歐賽車式低視角）──
  cameraHeight: 2.4, // 鏡頭離地高度
  cameraDistance: 5.0, // 鏡頭在玩家後方多遠
  cameraFov: 70, // 視野角度（越大越有速度感，也越魚眼）
  cameraLookAhead: 14, // 鏡頭看向玩家前方多遠的地面
  cameraXFollow: 0.6, // 橫移時鏡頭跟過去的比例（0=固定不動、1=完全跟隨）
  cameraXDamp: 4, // 鏡頭橫向跟隨的平滑度（越大跟越緊）

  // ── 直式畫面（手機豎拿）鏡頭覆寫：畫面比例 < 1 時自動採用 ──
  // 直式水平視野窄，鏡頭要拉高拉遠＋加大 FOV 才看得到兩側車道
  cameraPortrait: {
    height: 4.6,
    distance: 8.0,
    fov: 82,
    lookAhead: 17,
  },

  // ── 道路佈局：【左人行道】【迎面車道×roadLanes】【雙黃線】【對向車道×bgLanes】【右人行道】──
  laneWidth: 2.6, // 每條車道（與人行道走位）的寬
  roadLanes: 2, // 迎面車道數
  bgLanes: 2, // 對向車道數（可以走過去，但對向車從你背後來、會撞死你）
  centerGap: 0.5, // 雙黃線區的寬度（原本的分隔島拆掉了）

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
  followDistance: 7, // 跟車：與同車道前車的間隙小於這個就減速跟著開（不超車、不穿模）
  followXRange: 1.4, // 「同車道」判定：橫向差距在這以內算同一條線上

  // ── 人行道腳踏車（慢速但撞到也是死；出現頻率/方向由關卡表 bike* 欄位控制）──
  bike: {
    size: { x: 0.6, y: 1.5, z: 1.8 },
    speedMin: 2.5, // 比行人快一點點的悠哉速度
    speedMax: 4.5,
    wander: 0.8, // 在人行道上偏來偏去的幅度
    colors: [0x2e7d5b, 0x8a4baf, 0xc2564b, 0x4a6fa5],
  },

  // ── 路面標記（「慢」「50」：成對出現在同一側兩條車道、字向跟著車行方向）──
  roadMarkPairs: 2, // 同時存在幾組（一組 = 一側的每條車道各一個字）
  roadMarkLabels: ["慢", "50"], // 標記種類（隨機挑），外觀在 skins.ts 的 makeRoadMark

  // ── 命 ──
  maxHearts: 3, // 失敗扣一條，用完從第一關重來

  // ── 結算畫面 ──
  resultHoldSeconds: 2.5, // 失敗/通關畫面至少停留幾秒才接受按鍵（期間不顯示「按任意鍵」）

  // ── 靜止路障（擋路不致死；「多密、多常違停」由下面的關卡表決定）──
  sidewalkObstacleSize: { x: 2.2, y: 1.3, z: 2.8 }, // 人行道路障（機車堆、攤販…）
  sidewalkLongObstacleSize: { x: 2.2, y: 1.1, z: 14 }, // 超長路障（之後鋪機車停車格皮）
  sidewalkLongChance: 0.25, // 人行道路障是超長版的機率
  obstacleSpawnZ: 96, // 路障生成在前方多遠（比車生成點再遠一點，避免疊到車）

  // ── 路口（永遠綠燈；唯一威脅是迎面車右轉掃過斑馬線）──
  intersection: {
    firstAt: 50, // 每關第一個路口在幾公尺處
    everyMin: 70, // 之後每隔幾公尺一個路口（隨機取 min~max）
    everyMax: 110,
    roadDepth: 9, // 橫向小路的縱深（公尺）
    spawnZ: 120, // 路口生成在前方多遠
    turnChance: 0.35, // 靠人行道車道的迎面車在路口右轉的機率（卡車不轉）
    turnSeconds: 0.9, // 轉彎轉 90 度花幾秒（越短轉越兇）
  },

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
  speedScale: number; // 車速倍率（左右兩半都吃；想分開調用下面兩個欄位覆寫）
  obstacleGapMin: number; // 路障最小間距（公尺），越小路障越密
  obstacleGapMax: number;
  obstacleRoadChance: number; // 路障長在路邊車道（違停）而非人行道的機率
  // ↓ 可選：行人速度覆寫。沒寫就用上面 TUNING 的全域值。
  //   例：輪椅關想更慢就加 walkSpeed: 3.2（推薦連 strafeSpeed 一起調，比例才對）
  walkSpeed?: number; // 前進速度（公尺/秒）
  backSpeed?: number; // 後退速度
  strafeSpeed?: number; // 橫移速度
  // ↓ 可選：路口覆寫。沒寫就用 TUNING.intersection 的全域值。
  intersectionEveryMin?: number; // 路口間距（公尺）
  intersectionEveryMax?: number;
  turnChance?: number; // 路邊車道的車在路口右轉的機率
  // ↓ 可選：左右車速分開調（左＝迎面車道、右＝同向車道）。沒寫就用 speedScale。
  speedScaleLeft?: number;
  speedScaleRight?: number;
  // ↓ 可選：人行道腳踏車。沒寫 bikeInterval 這關就沒有腳踏車。
  bikeInterval?: number; // 每隔幾秒生成一台（左右人行道隨機）
  bikeDirs?: "both" | "toward" | "away"; // 迎面 / 從背後來 / 兩個方向（預設 both）
  // ↓ 可選：過關地點。指定後，走到 goalDistance 還要「站上該側人行道」才過關，
  //   時間照跑。終點會出現一棟目的地建築（外觀在 skins.ts 的 makeDestinationBuilding）。
  goalSide?: "left" | "right";
  destinationLabel?: string; // 目的地建築的招牌字（之後換貼皮）
}

export const LEVELS: LevelConfig[] = [
  {
    goalDistance: 200,
    timeLimit: 90,
    playerForm: "walker",
    spawnInterval: 1.3,
    speedScale: 1.0,
    obstacleGapMin: 12,
    obstacleGapMax: 24,
    obstacleRoadChance: 0.2,
    bikeInterval: 5, // 這關開始人行道有腳踏車
    bikeDirs: "both", // 腳踏車雙向夾擊
    goalSide: "right",
    destinationLabel: "公司",
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
    bikeInterval: 5, // 這關開始人行道有腳踏車
    bikeDirs: "toward",
    goalSide: "left",
    destinationLabel: "托嬰中心",
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
    bikeInterval: 3.5,
    bikeDirs: "both", // 腳踏車雙向夾擊
    goalSide: "right",
    destinationLabel: "醫院",
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

// 迎面車道右緣（雙黃線從這裡開始）
export const ROAD_RIGHT = (TUNING.roadLanes - 0.5) * TUNING.laneWidth;
// 對向車道左緣／右緣
export const BG_LEFT = ROAD_RIGHT + TUNING.centerGap;
export const BG_RIGHT = BG_LEFT + TUNING.bgLanes * TUNING.laneWidth;
// 右人行道的走位中心
export const RIGHT_SIDEWALK_X = BG_RIGHT + TUNING.laneWidth / 2;

// 直欄編號：0=左人行道、1..roadLanes=迎面車道、
// roadLanes+1..LAST_ROAD_COL=對向車道、RIGHT_SIDEWALK_COL=右人行道
export const LAST_ROAD_COL = TUNING.roadLanes + TUNING.bgLanes;
export const RIGHT_SIDEWALK_COL = LAST_ROAD_COL + 1;
export function colX(col: number): number {
  if (col <= TUNING.roadLanes) return (col - 1) * TUNING.laneWidth; // 含左人行道(0)
  if (col <= LAST_ROAD_COL)
    return BG_LEFT + (col - TUNING.roadLanes - 0.5) * TUNING.laneWidth;
  return RIGHT_SIDEWALK_X;
}

// 玩家橫移範圍：左人行道左緣 ～ 右人行道右緣
export const WALK_MIN_X = colX(0) - TUNING.laneWidth / 2;
export const WALK_MAX_X = RIGHT_SIDEWALK_X + TUNING.laneWidth / 2;

// 人行道的視覺寬度（world.ts 與目的地建築的定位共用）
export const SIDEWALK_WIDTH = TUNING.laneWidth + 0.8;
// 迎面車道左緣（左人行道右緣）
export const ROAD_LEFT = -TUNING.laneWidth / 2;
