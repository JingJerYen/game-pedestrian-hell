# 遠景背景圖：規格與生圖提示詞

背景圖是立在馬路盡頭的弧形大看板，每關輪換。所有圖用同一套規格，程式參數才不用每張重調。

## 規格（每張都要一樣）

| 項目 | 規格 |
|---|---|
| 比例 | **16:9**（越寬越好；4:3 也能用但兩側鏡射的部分會變多） |
| 解析度 | 越高越好，至少 1920×1080；放進來前用 `magick 原檔 -quality 88 public/assets/xxx.jpg` 轉成 JPG |
| 地平線位置 | **天際線的底部（樓群、山腳）落在畫面高度從下往上算 15～20% 的地方**。下面那一小段會被霧蓋掉，上面 80% 是天空 |
| 內容 | 只有遠景：天際線、山、雲。**不要**近景的馬路、電線桿、車、人、樹、招牌、任何文字或浮水印 |
| 地平線霧色 | 靠近地平線要有一層均勻的薄霧（一個顏色），程式把天空和霧設成那個顏色來接縫 |
| 風格 | 乾淨、略帶插畫感的半寫實（跟目前 101 那張一樣），不要極端寫實的照片顆粒 |
| 光線 | 太陽不要在畫面正中央；日落可以有太陽但放低、偏一側 |

## 放進遊戲

1. 檔案放 `public/assets/`，例如 `backdrop-kaohsiung.jpg`。
2. 到 `src/tuning.ts` 的 `TUNING.backdrop.sets` 加一行：`{ image: "assets/backdrop-kaohsiung.jpg", sky: 0x9fc3dc }`。
   `sky` 填那張圖地平線附近霧的顏色（用小畫家/取色器吸一下），日落配橘、夜景配深藍。
3. 預設每關輪下一張；想指定哪關用哪張，在 `LEVELS` 那關加 `backdrop: 2`（第幾張，0 起算）。

## 提示詞（英文效果最穩，直接複製貼上）

每段最後那句固定約束不要刪，是規格的一部分。

### 共同結尾（每個提示詞都要接這段）

```
Wide 16:9 panoramic view, distant skyline only. The base of the skyline sits at the lower 15–20% of the frame; the top 80% is open sky. Uniform soft atmospheric haze along the horizon in a single color. No foreground objects: no roads, no street, no poles, no cars, no people, no close trees. No text, no watermark, no logo. Clean semi-realistic, slightly painterly illustration style, soft edges, high resolution.
```

### 1. 台北 101 夜景

```
Taipei city skyline at night with Taipei 101 tower lit up as the centerpiece, dense apartment blocks with warm window lights, dark navy blue sky with a few thin clouds, faint city glow near the horizon, distant dark mountains silhouettes behind the city.
```
建議 sky：`0x1c2740`（深藍）

### 2. 高雄 85 大樓天際線（白天）

```
Kaohsiung city skyline on a clear day with the 85 Sky Tower as the centerpiece, harbor city with mid-rise buildings, bright blue sky with scattered white clouds, light blue haze along the horizon, hint of the sea and port cranes far in the distance on one side.
```
建議 sky：`0x9fc3dc`

### 3. 高雄 85 大樓黃昏

```
Kaohsiung skyline at golden hour with the 85 Sky Tower silhouetted against a warm orange and pink sunset sky, low sun near the horizon on the left side, thin golden clouds, warm hazy glow along the horizon, distant harbor.
```
建議 sky：`0xe6a97c`

### 4. 日落天際線（通用台灣都市）

```
Taiwanese city skyline at sunset, generic dense mid-rise apartment blocks with rooftop water tanks and iron-sheet rooftop additions, warm orange to purple gradient sky, sun low and slightly off-center, soft peach-colored haze along the horizon, distant mountains.
```
建議 sky：`0xe0a07a`

### 5. 台中天際線（白天）

```
Taichung city skyline on a hazy afternoon, cluster of modern towers in the center including the tall twin-tower shape of the Taichung landmark, wide flat city of mid-rise buildings, pale blue-white sky, milky haze near the horizon, faint mountains on the far right.
```
建議 sky：`0xb9cbd9`

### 6. 陰雨天

```
Taiwanese city skyline on an overcast rainy day, grey clouds covering the sky, muted desaturated buildings, low grey mist along the horizon, soft diffuse light, no visible sun.
```
建議 sky：`0x9aa3ab`

### 7. 清晨（藍調時刻）

```
Taiwanese city skyline at dawn, cool blue pre-sunrise sky turning pale pink at the horizon, buildings still dim with a few lights on, thin mist along the horizon, calm and quiet mood.
```
建議 sky：`0x8fa5c4`

### 8. 遠山（花東/宜蘭風）

```
Small Taiwanese town skyline with a few low buildings in front of tall green mountains, layered mountain ridges fading into blue haze, bright sky with cumulus clouds, humid tropical atmosphere.
```
建議 sky：`0xa8c4d8`

## 生完圖檢查三件事

1. 天際線底部大約在下緣往上 15～20%（太高會浮在馬路上、太低會被霧吃光）。
2. 地平線附近是一片均勻的霧色，用取色器吸出來填 `sky`。
3. 沒有近景物件、沒有文字。
