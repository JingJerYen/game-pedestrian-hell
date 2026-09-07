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
  playerSize: { x: 0.8, y: 1.6, z: 0.8 },
  laneChangeDamp: 10, // 橫移的平滑度（越大移得越俐落）

  // ── 車輛（迎面，會撞死你）──
  carSize: { x: 1.9, y: 1.4, z: 4.2 },
  carSpeedMin: 6, // 車自己的車速（就算你站著不動也照這個速度衝過來）
  carSpeedMax: 13,
  spawnInterval: 1.0, // 每隔幾秒生成一台迎面車
  spawnDistance: 90, // 車在玩家前方多遠生成
  despawnZ: 15, // 車跑到玩家後方多遠就回收

  // ── 對向車（背景，走不過去）──
  bgCarSpeedMin: 7,
  bgCarSpeedMax: 12,
  bgSpawnInterval: 1.6,

  // ── 靜止路障（擋路不致死）──
  obstacleGapMin: 9, // 兩個路障至少隔幾公尺（保證永遠有路可繞）
  obstacleGapMax: 22,
  obstacleRoadChance: 0.3, // 路障出現在路邊車道（而非人行道）的機率
  sidewalkObstacleSize: { x: 2.2, y: 1.3, z: 2.8 }, // 人行道路障（機車堆、攤販…）
  obstacleSpawnZ: 96, // 路障生成在前方多遠（比車生成點再遠一點，避免疊到車）

  // ── 碰撞 ──
  hitboxShrink: 0.75, // 碰撞箱是視覺大小的幾成（從寬判定：差點撞到 > 冤枉死）
} as const;

// ── 佈局換算（改上面的參數就好，下面不用動）──

// 可玩直欄：0 = 人行道、1..roadLanes = 迎面車道。回傳該欄中心的 X 座標。
export const COLS = TUNING.roadLanes + 1;
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
