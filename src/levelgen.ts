// 無限關卡生成器：手動配置的 LEVELS 全過之後，從這裡無縫接手。
// 參數全部在 tuning.ts 的 TUNING.endless。
//
// 兩條設計鐵則：
// 1. 固定 seed——每個玩家的第 N 關長得一模一樣，「死在第幾關」才能公平比較
//    （之後的排行榜靠這個）。
// 2. 時限不隨機，由 goalDistance ÷ 行人速度 × 餘裕係數推導——餘裕永遠 > 1，
//    所以永遠不會生出物理上走不完的關卡。

import { TUNING, LEVELS, type LevelConfig, type PlayerForm } from "./tuning";

// mulberry32：小而夠用的「可餵種子」隨機數產生器（Math.random 不能指定種子）。
// 同一個種子進去，吐出來的隨機數序列永遠相同——這就是關卡可重現的原理。
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const cache = new Map<number, LevelConfig>(); // 同一關生成一次就好（main 每幀都會來要）

// 遊戲唯一的取關卡入口：表內回傳手動配置，表外回傳生成的
export function getLevel(index: number): LevelConfig {
  if (index < LEVELS.length) return LEVELS[index];
  let lv = cache.get(index);
  if (!lv) {
    lv = generate(index);
    cache.set(index, lv);
  }
  return lv;
}

function generate(index: number): LevelConfig {
  const e = TUNING.endless;
  const depth = index - LEVELS.length + 1; // 無限模式的第幾關（1 起算）
  // 種子 = 全域種子 ⊕ 關卡編號打散——每一關有自己固定的隨機序列
  const rng = mulberry32((e.seed ^ Math.imul(index + 1, 0x9e3779b1)) >>> 0);
  const ramp = Math.min(depth / e.rampLevels, 1); // 難度進度 0→1，到頂就停在天花板
  const lerp = (from: number, to: number) => from + (to - from) * ramp;
  const jitter = (spread: number) => 1 + (rng() * 2 - 1) * spread; // 例如 0.12 = ±12%

  const goalDistance = Math.min(
    Math.round(e.goalBase + depth * e.goalPerLevel + rng() * e.goalJitter),
    e.goalMax,
  );
  // 公平鐵則：時限從距離推導（見檔頭）
  const margin = lerp(e.marginStart, e.marginEnd) * jitter(0.05);
  const timeLimit = Math.ceil((goalDistance / TUNING.walkSpeed) * margin);

  // 行人型態：照權重抽（輪椅體積最大，出現得少一點）
  const w = e.formWeights;
  const roll = rng() * (w.walker + w.stroller + w.wheelchair);
  const playerForm: PlayerForm =
    roll < w.walker ? "walker" : roll < w.walker + w.stroller ? "stroller" : "wheelchair";

  const dest = e.destinations[Math.floor(rng() * e.destinations.length)];

  return {
    goalDistance,
    timeLimit,
    playerForm,
    spawnInterval: Math.max(
      e.spawnIntervalMin,
      lerp(e.spawnIntervalStart, e.spawnIntervalMin) * jitter(0.12),
    ),
    speedScale: Math.min(e.speedScaleMax, lerp(1, e.speedScaleMax) * jitter(0.05)),
    obstacleGapMin: lerp(e.obstacleGapMinStart, e.obstacleGapMinEnd),
    obstacleGapMax: lerp(e.obstacleGapMaxStart, e.obstacleGapMaxEnd),
    obstacleRoadChance: lerp(e.roadChanceStart, e.roadChanceEnd),
    turnChance: lerp(TUNING.intersection.turnChance, e.turnChanceEnd),
    bikeInterval: lerp(e.bikeIntervalStart, e.bikeIntervalEnd) * jitter(0.15),
    goalSide: rng() < 0.5 ? "left" : "right",
    destinationLabel: dest.label,
    flavorText: depth === 1 ? e.entryFlavor : dest.flavor,
    hideSideHint: depth > e.sideHintUntil,
  };
}
