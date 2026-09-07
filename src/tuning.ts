// 全部可調參數都在這裡。調手感 = 改這個檔案，存檔後瀏覽器會自動重新載入。

export const TUNING = {
  // ── 鏡頭（第三人稱、馬力歐賽車式低視角）──
  cameraHeight: 2.4, // 鏡頭離地高度
  cameraDistance: 5.0, // 鏡頭在玩家後方多遠
  cameraFov: 70, // 視野角度（越大越有速度感，也越魚眼）
  cameraLookAhead: 14, // 鏡頭看向玩家前方多遠的地面
  cameraXFollow: 0.6, // 換道時鏡頭跟過去的比例（0=固定不動、1=完全跟隨）
  cameraXDamp: 4, // 鏡頭橫向跟隨的平滑度（越大跟越緊）

  // ── 車道 ──
  laneCount: 3,
  laneWidth: 2.6, // 每條車道寬（公尺）

  // ── 世界捲動（M3 之前先用固定速度）──
  scrollSpeed: 11, // 世界往鏡頭捲動的速度（公尺/秒）

  // ── 玩家 ──
  playerSize: { x: 0.8, y: 1.6, z: 0.8 },
  laneChangeDamp: 10, // 換道的平滑度（越大換得越俐落）

  // ── 車輛 ──
  carSize: { x: 1.9, y: 1.4, z: 4.2 },
  carSpeedMin: 4, // 車自己的車速（相對於路面，迎面而來）
  carSpeedMax: 9,
  spawnInterval: 0.9, // 每隔幾秒生成一台車
  spawnDistance: 90, // 車在玩家前方多遠生成
  despawnZ: 12, // 車跑到玩家後方多遠就回收

  // ── 碰撞 ──
  hitboxShrink: 0.75, // 碰撞箱是視覺大小的幾成（從寬判定：差點撞到 > 冤枉死）
} as const;

// 車道編號 0..laneCount-1，回傳該車道中心的 X 座標（中間車道在 x=0）
export function laneX(lane: number): number {
  return (lane - (TUNING.laneCount - 1) / 2) * TUNING.laneWidth;
}
