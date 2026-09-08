# taiwan-ped

台灣行人地獄主題的 3D endless runner。設計決策與里程碑見 DESIGN.md——動工前先讀它。

## 指令

- `npm run dev` — 開發伺服器（Vite）
- `npm run build` — 型別檢查（tsc --noEmit）+ 產出正式版
- 沒有測試框架；驗證方式是實際玩

## 架構原則（不可違反）

- **玩家固定在 Z=0 附近，世界往 +Z 捲動。** 任何「讓玩家往前移動」的寫法都是錯的。
  捲動速度由玩家按住 ↑/↓ 決定（main.ts 每幀算出 dz 傳給各模組）；車輛另有自己的車速。
- **所有魔術數字進 `src/tuning.ts`**，不准散落在各模組。調手感 = 改 tuning.ts。
- 碰撞只用 AABB（`collision.ts`），不引入物理引擎。runtime 依賴只有 `three`。

## 模組職責

| 檔案 | 職責 |
|---|---|
| `src/main.ts` | bootstrap、遊戲迴圈、狀態機（running / dead） |
| `src/tuning.ts` | 全部可調參數 |
| `src/world.ts` | 場景、光、路面、車道線捲動 |
| `src/player.ts` | 玩家、鍵盤輸入、換道平滑移動 |
| `src/traffic.ts` | 車輛生成/移動/右轉/回收（迎面＋同向都會撞死人） |
| `src/obstacles.ts` | 靜止路障：擋前進、擋橫移、不致死 |
| `src/intersections.ts` | 路口：橫向小路、斑馬線、紅綠燈；右轉邏輯在 traffic |
| `src/destination.ts` | 每關終點的目的地建築（goalSide 判定在 main） |
| `src/skins.ts` | 世界裝飾的外觀 factory 集中處——換素材改這裡 |
| `src/collision.ts` | AABB 判定 |
| `src/hud.ts` | HUD 狀態列與橫幅/失敗/通關畫面（DOM overlay，版面在 index.html） |
| `src/debug.ts` | 開發用 overlay（` 鍵開關），玩家不知道也不影響遊戲 |

## 與使用者合作方式

使用者是程式全新手。用繁體中文溝通；大設計決定先問再做；先交付可玩成果，他問哪段再解釋哪段。
