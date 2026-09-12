// 街屋規格表：改數字 → `npm run export:buildings` → GLB 重出（覆蓋）。
// 遊戲直接載這裡列出的每一棟（src/skins.ts 的 BUILDING_MODELS 要登記同樣的檔名）。
// 共用的尺寸（騎樓深度、招牌大小、鐵窗大小、水塔、顏色）在 kit.ts 的 KIT。
//
// 欄位說明（長度單位都是公尺）：
//   name        輸出檔名（不含 .glb），會存到 public/assets/models/buildings/
//   floors      樓層數（一樓是店面，其餘是民宅；每層 3.2 m，見 KIT.floorHeight）
//   width       面寬（沿路方向）。台灣街屋 4.5～6 比較像
//   depth       深度（往後延伸），可省略，預設 KIT.depth = 8。玩家幾乎看不到
//   wallColor   牆面磁磚色（0xRRGGBB）
//   signCorner  方形薄片招牌在正面的哪個角："left" 或 "right"；直立長條招牌自動放另一角
//   bannerH     騎樓上緣那片橫幅招牌板的高度（0.8～1.2 順眼）
//   bannerLift  橫幅板底部離騎樓上緣多高（0 = 貼著騎樓頂）
//   plateLift   方形薄片招牌底部離橫幅板頂部多高（越大掛越高）
//   vsignLift   直立長條招牌底部離二樓地板多高（招牌本身高 3.6，見 KIT.vsign.height）
//   vsign2Lift  第二片直立招牌的底部離二樓地板多高；它會貼在第一片旁邊往內一點（空隙 KIT.vsignGap）。
//               省略這欄就只有一片。高的樓放兩片比較像
//   vsignOut    直立招牌用細支柱從牆面撐出去多遠（招牌內側面離牆的距離，0.2～1.0 順眼）；省略 = 0.1 幾乎貼牆
//   （二樓鐵窗會自動避開橫幅板：bannerLift + bannerH 超過 1.4 的話鐵窗就快沒地方放了）
//   cageJitter  鐵窗方塊位置的隨機偏移上限（0 = 每層整齊排好，0.25 = 各自歪一點）
//   seed        鐵窗偏移的亂數種子：同一個 seed 永遠出同樣的偏移；想換一組排法就換數字
//   store       店家：用 public/assets/decals/stores/<store>/ 裡的 storefront / banner / cube / vsign .png
//               （缺的檔那個槽留白）。省略 = 四個槽全部留白
//   windows     鐵窗圖：public/assets/decals/windows/<windows>.png（這棟所有鐵窗用同一張）。省略 = 留白
//   wall        牆面紋理：public/assets/decals/walls/<wall>.png（灰階、1 m × 1 m 無縫，wallColor 染色）。省略 = 純色
//               現有：tile_long（二丁掛）、tile_square（小口方磚）、pebble（洗石子）、brick（紅磚，wallColor 用磚紅）
import type { ShophouseSpec } from "./kit";

export const SPECS: ShophouseSpec[] = [
  { name: "shophouse-01", floors: 4, width: 5.0, wallColor: 0xd9cdb4, signCorner: "right", bannerH: 1.0, bannerLift: 0.2, plateLift: 0, vsignLift: 1.2, vsignOut: 0.45, cageJitter: 0.2, seed: 101, store: "711", windows: "iron_gray", wall: "tile_long" },
  { name: "shophouse-02", floors: 3, width: 4.5, wallColor: 0xc4b295, signCorner: "left", bannerH: 0.9, bannerLift: 0.4, plateLift: 0, vsignLift: 0.6, vsignOut: 0.25, cageJitter: 0.25, seed: 102, store: "familymart", windows: "iron_ac", wall: "tile_square" },
  { name: "shophouse-03", floors: 5, width: 5.9, wallColor: 0xa9b3a2, signCorner: "right", bannerH: 1.2, bannerLift: 0.1, plateLift: 0, vsignLift: 2.0, vsign2Lift: 4.6, vsignOut: 0.8, cageJitter: 0.15, seed: 103, store: "sym", windows: "iron_plant", wall: "pebble" },
  { name: "shophouse-04", floors: 4, width: 5.4, wallColor: 0xb8624e, signCorner: "left", bannerH: 0.8, bannerLift: 0.5, plateLift: 0, vsignLift: 1.6, vsignOut: 0.35, cageJitter: 0.25, seed: 104, store: "meiermei", windows: "iron_gray", wall: "brick" },
  { name: "shophouse-05", floors: 3, width: 6.0, wallColor: 0xb5b5b5, signCorner: "right", bannerH: 1.1, bannerLift: 0.3, plateLift: 0, vsignLift: 0.9, vsignOut: 0.6, cageJitter: 0.2, seed: 105, store: "50feng", windows: "iron_plant", wall: "tile_long" },
  { name: "shophouse-06", floors: 5, width: 5.8, wallColor: 0xe2dbcd, signCorner: "left", bannerH: 1.0, bannerLift: 0.3, plateLift: 0, vsignLift: 1.0, vsign2Lift: 5.2, vsignOut: 0.95, cageJitter: 0.1, seed: 106, store: "lianan_tcm", windows: "iron_ac", wall: "tile_square" },
  { name: "shophouse-07", floors: 4, width: 4.8, wallColor: 0xa85a48, signCorner: "right", bannerH: 1.0, bannerLift: 0.3, plateLift: 0, vsignLift: 1.4, vsignOut: 0.3, cageJitter: 0.2, seed: 107, store: "garage_tutor", windows: "iron_plant", wall: "brick" },
  { name: "shophouse-08", floors: 4, width: 5.6, wallColor: 0xd9cdb4, signCorner: "left", bannerH: 0.9, bannerLift: 0.2, plateLift: 0, vsignLift: 1.8, vsignOut: 0.5, cageJitter: 0.15, seed: 108, store: "shutter", windows: "iron_gray", wall: "pebble" },
  { name: "shophouse-09", floors: 3, width: 5.2, wallColor: 0xa9b3a2, signCorner: "right", bannerH: 1.1, bannerLift: 0.25, plateLift: 0, vsignLift: 0.8, vsignOut: 0.7, cageJitter: 0.25, seed: 109, store: "acai", windows: "iron_ac", wall: "tile_long" },
  { name: "shophouse-10", floors: 5, width: 5.5, wallColor: 0xc4b295, signCorner: "left", bannerH: 1.2, bannerLift: 0.1, plateLift: 0, vsignLift: 2.4, vsign2Lift: 0.6, vsignOut: 0.85, cageJitter: 0.2, seed: 110, store: "50lan", windows: "iron_gray", wall: "tile_square" },
];
