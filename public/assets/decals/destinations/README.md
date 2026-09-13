# 目的地建築立面圖（JPG）

每關終點的目的地建築是一個 9 m 寬 × 12 m 高 × 10 m 深的方塊，四個側面貼同一張「正投影立面圖」，
沒有立體感、沒有屋頂細節。哪個招牌字用哪張圖在 `src/tuning.ts` 的 `destinationSkins`；
檔案不在就用米色方塊＋招牌字頂著，遊戲照跑。

## 檔案

```
destinations/
  pixmart.jpg    全聯（招牌字「全聯」）
  business.jpg   商辦大樓（「公司」）
  hospital.jpg   醫院（「醫院」）
  bank.jpg       銀行（「銀行」）
  shopee.jpg     蝦皮店到店（「超商」）
```

原圖（1086 × 1448 PNG）不進版控；要重壓：`python3 -c` 用 Pillow 縮到 384×512、JPG 品質 50～75，壓到 40 KB 以下。

## 規格

| 項目 | 值 |
|---|---|
| 尺寸 | **384 × 512**（寬:高 = 3:4，對應 9 m × 12 m） |
| 格式 | JPG，品質 60～75，每張 **40 KB 以下**（模糊沒關係，玩家從幾十公尺外看） |
| 內容 | 建築正面的**正投影立面**：正對著看、沒有透視、沒有斜角 |
| 邊界 | 圖的四邊就是建築的四邊：**上緣＝屋頂線、下緣＝地面、左右緣＝建築兩側**，不要留天空、地面、馬路、鄰居 |
| 招牌 | 店名／機構名直接畫在立面上（一樓上方或頂樓），字要大、對比高 |
| 光線 | 平光、無陰影、無夜景燈光；顏色可以飽和一點，遊戲燈光會暗一成 |
| 樓層 | 12 m 大約 3～4 層樓，畫成 3 或 4 層看起來比例才對 |

## 生圖提示詞範本（英文，替換【】）

```
Flat orthographic front elevation of a 【Taiwanese PX Mart supermarket / office building / hospital】,
3 to 4 storeys, viewed straight-on with no perspective. The building fills the entire image edge to edge:
top edge is the roofline, bottom edge is the ground floor entrance, no sky, no road, no neighbouring buildings.
Large clear signboard reading "【全聯福利中心】" above the ground floor. Flat even lighting, no shadows,
simple clean colours, game texture style. Portrait 3:4.
```
