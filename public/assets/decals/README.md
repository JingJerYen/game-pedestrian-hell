# 街屋貼圖（PNG）

街屋 GLB（scripts/shophouse 產生）的店面和招牌貼這裡的 PNG。GLB 只記檔案路徑、不內嵌，
所以同一家店的圖被多棟用也只下載一次。哪一棟用哪家店在 `scripts/shophouse/specs.ts` 的 `store` / `windows` 欄位，
改完跑 `npm run export:buildings`。

## 資料夾與檔名（固定，程式靠檔名找）

```
decals/
  stores/<店名>/storefront.png   一樓騎樓內牆：整個店面正面（玻璃門、貨架、燈光）
  stores/<店名>/banner.png       騎樓上緣橫幅招牌板：店名＋logo
  stores/<店名>/cube.png         正面一角垂直凸出的方形薄片招牌，兩面同一張
  stores/<店名>/vsign.png        直立長條招牌，兩側面同一張（直排字）
  windows/<名>.png               鐵窗方塊正面（鐵窗格＋窗簾或冷氣），一棟所有鐵窗同一張
  walls/<名>.png                 牆面紋理：牆體＋一樓柱子＋女兒牆重複貼，specs.ts 的 wall 欄位指定
```
店名例如 `711`、`familymart`（specs.ts 裡 `store: "711"` 就找 `stores/711/`）。缺哪張，那個槽就留白。

## 尺寸（像素）——請照這個比例做，程式會拉到槽的大小，比例不對會變形

| 檔 | 尺寸 | 比例 | 對應槽的實際大小 |
|---|---|---|---|
| storefront.png | 1024 × 384 | 8:3 | 寬 3.5～5 m × 高 2.9 m |
| banner.png | 1024 × 204 | 5:1 | 寬 4.5～6 m × 高 0.8～1.2 m |
| cube.png | 512 × 512 | 1:1 | 0.94 × 0.94 m |
| vsign.png | 256 × 1024 | 1:4 | 寬 0.84 m × 高 3.5 m |
| windows/*.png | 512 × 512 | 1:1 | 1.2 × 1.4 m |
| walls/*.png | 512 × 512 | 1:1 | 1 m × 1 m，四邊要無縫；**灰階**、整體偏亮，遊戲用 wallColor 染色 |

- **PNG、透明背景**：透明的地方會露出底色（招牌板白色、鐵窗方塊深灰）。半透明邊緣會被切成非黑即白（alpha 0.5 為界）。
- 圖的正上方 = 世界的上方；直立招牌一樣是直的圖，字由上往下排。
- 顏色請放飽和一點，遊戲燈光會讓它暗一成左右。

## 目前的圖

店家（`stores/<名>/` 四張齊全）：
1. `711`
2. `familymart`
3. `sym`（SYM 機車行）
4. `meiermei`（美而美早餐店）
5. `50feng`（50 嵐飲料店，改成「50風」避免商標問題）
6. `lianan_tcm`（聯安中醫）
7. `garage_tutor`（王明補習班）
8. `shutter`（鐵捲門拉下的空店面）
9. `acai`（阿財小吃店）
10. `50lan`（50 嵐正版招牌）

牆面（`walls/<名>.png`，由 `python3 scripts/shophouse/walltex.py` 程式畫的，要改樣式改那支）：`tile_long`（二丁掛）、`tile_square`（小口方磚）、`pebble`（洗石子）、`brick`（紅磚，配磚紅 wallColor）。

鐵窗（`windows/<名>.png`）：`iron_gray`（素色）、`iron_ac`（冷氣）、`iron_plant`（盆栽）。
