// 無盡模式的難度曲線：手動配置的 LEVELS 全過之後，從這裡接手。
// 參數全部在 tuning.ts 的 TUNING.endless。
//
// 規則：一條走不完的路，沒有終點、沒有時限。每走 stageLength 公尺升一階，
// 車流密度、車速、路障、右轉、腳踏車各參數從 *Start 線性爬到 *End，
// rampStages 階之後停在最兇值。分數就是最遠走到幾公尺。
//
// main.ts 每幀拿「目前走到的最遠距離」來換一份 LevelConfig，各模組（traffic / obstacles /
// intersections）照舊吃 LevelConfig，不用知道無盡模式的存在。同一階回傳同一個物件（快取）。

import { TUNING, type LevelConfig } from "./tuning";

const cache = new Map<number, LevelConfig>();

// 走到 distance 公尺時是第幾階（0 起算）
export function endlessStage(distance: number): number {
  return Math.max(0, Math.floor(distance / TUNING.endless.stageLength));
}

// 走到 distance 公尺時的關卡參數
export function endlessLevel(distance: number): LevelConfig {
  const stage = endlessStage(distance);
  let lv = cache.get(stage);
  if (!lv) {
    lv = build(stage);
    cache.set(stage, lv);
  }
  return lv;
}

function build(stage: number): LevelConfig {
  const e = TUNING.endless;
  const ramp = Math.min(stage / e.rampStages, 1); // 難度進度 0→1，到頂就停在天花板
  const lerp = (from: number, to: number) => from + (to - from) * ramp;
  return {
    goalDistance: Infinity, // 沒有終點（main 的抵達判定永遠不成立）
    timeLimit: Infinity, // 沒有時限
    playerForm: "walker", // 固定步行者：大家條件一樣，最遠距離才能比
    spawnInterval: lerp(e.spawnIntervalStart, e.spawnIntervalEnd),
    speedScale: lerp(e.speedScaleStart, e.speedScaleEnd),
    obstacleGapMin: lerp(e.obstacleGapMinStart, e.obstacleGapMinEnd),
    obstacleGapMax: lerp(e.obstacleGapMaxStart, e.obstacleGapMaxEnd),
    obstacleRoadChance: lerp(e.roadChanceStart, e.roadChanceEnd),
    turnChance: lerp(TUNING.intersection.turnChance, e.turnChanceEnd),
    bikeInterval: lerp(e.bikeIntervalStart, e.bikeIntervalEnd),
    hideDistanceHint: true, // HUD 只顯示已走公尺數
    sidewalkLeft: "normal",
    sidewalkRight: "normal",
  };
}
