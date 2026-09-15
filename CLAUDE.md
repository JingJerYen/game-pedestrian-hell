# taiwan-ped

台灣行人地獄主題的 3D endless runner。設計決策與里程碑見 DESIGN.md——動工前先讀它。

## 指令

- `npm run dev` — 開發伺服器（Vite）
- `npm run build` — 型別檢查（tsc --noEmit）+ 產出正式版
- `npm run export:buildings` — 街屋產生器出 GLB（改 scripts/shophouse/specs.ts 之後跑）
- 沒有測試框架；驗證方式是實際玩

## 架構原則（不可違反）

- **玩家固定在 Z=0 附近，世界往 +Z 捲動。** 任何「讓玩家往前移動」的寫法都是錯的。
  捲動速度由玩家按住 ↑/↓ 決定（main.ts 每幀算出 dz 傳給各模組）；車輛另有自己的車速。
- **所有魔術數字進 `src/tuning.ts`**，不准散落在各模組。調手感 = 改 tuning.ts。
- 碰撞只用 AABB（`collision.ts`），不引入物理引擎。runtime 依賴只有 `three`。

## 模組職責

| 檔案 | 職責 |
|---|---|
| `src/main.ts` | bootstrap、遊戲迴圈、狀態機（title / levelStart / running / clear / fail）、鍵盤輸入、鏡頭、撞擊效果、無盡模式的升階與最遠紀錄 |
| `src/tuning.ts` | 全部可調參數＋手寫關卡表 `LEVELS`＋目的地總表 `destinations` |
| `src/levelgen.ts` | 無盡模式的難度曲線：依走了幾公尺回傳一份 LevelConfig（每 100 m 一階） |
| `src/world.ts` | 場景、光、路面、車道線捲動、兩排街屋回收、人行道鋪面、遠景背景圖（含淡入淡出） |
| `src/player.ts` | 玩家角色：橫移、轉身、路障擋住、走路動畫 |
| `src/touch.ts` | 虛擬搖桿（手指或滑鼠左鍵拖曳）；點螢幕 = 結算畫面的「按任意鍵」 |
| `src/traffic.ts` | 車輛生成/移動/右轉/回收（迎面＋同向都會撞死人）；人行道腳踏車也在這（同向、繞路障、跟車排隊） |
| `src/obstacles.ts` | 靜止路障：擋前進、擋橫移、不致死 |
| `src/intersections.ts` | 路口：橫向小路、斑馬線、紅綠燈；右轉邏輯在 traffic |
| `src/destination.ts` | 每關終點的目的地建築（goalSide 判定在 main） |
| `src/skins.ts` | 世界裝飾的外觀 factory 集中處——換素材改這裡（街屋模型載入、目的地貼皮、停車格鋪面、號誌、背景圖） |
| `src/vehicleskins.ts` | 車輛／道具外觀：GLB 載入、規格化、車身換色、車頭燈光暈 |
| `src/charskins.ts` | 玩家角色外觀：Kenney 角色 GLB＋動畫、輪椅模型、程式組的嬰兒車 |
| `scripts/shophouse/` | 街屋產生器（不進遊戲）：specs.ts 規格表 → `npm run export:buildings` 出 GLB，PNG 以外部檔案掛上；walltex.py 畫牆面紋理 |
| `src/collision.ts` | AABB 判定 |
| `src/sfx.ts` | 音效：Web Audio，聲音預設用程式合成（零檔案），tuning 可改成掛音檔；M 鍵全開/全關 |
| `src/hud.ts` | HUD 狀態列、標題畫面、開場橫幅、抵達/失敗畫面、升階提示、後方來車「!」、分享鈕（DOM overlay，版面在 index.html） |
| `src/share.ts` | 無盡模式結算的分享：文案、網址帶 `?challenge=`、系統分享面板／剪貼簿 |
| `src/debug.ts` | 開發用 overlay（` 鍵開關：fps、各模組每幀耗時、繪製次數），玩家不知道也不影響遊戲。測試熱鍵：1 換型態、2 換背景、3 跳下一關 |

## 與使用者合作方式

使用者是程式全新手。用繁體中文溝通；大設計決定先問再做；先交付可玩成果，他問哪段再解釋哪段。
