# 路旁建築模型

`shophouse-01..10.glb` 是塊狀街屋，由 `scripts/shophouse/` 產生（不進遊戲，遊戲只用這裡的現成 GLB）：
- 規格表 `scripts/shophouse/specs.ts`：每款一行（樓層、面寬、磁磚色、招牌在哪個角、橫幅／薄片／直立招牌高度、鐵窗偏移）。
- 共用尺寸與顏色 `scripts/shophouse/kit.ts` 的 `KIT`。
- 改完跑 `npm run export:buildings`，GLB 重出（覆蓋）。同一份表永遠出同樣的結果。
- 每一行多兩個欄位 `store` / `windows` 指定貼哪家店的 PNG（見 public/assets/decals/README.md）；
  GLB 只記 PNG 路徑不內嵌，同一張圖多棟共用只下載一次。
- 加第 11 棟：specs.ts 加一行，再到 `src/skins.ts` 的 `BUILDING_MODELS` 把數量改成 11。

GLB 單位公尺、正面朝 +Z。也可以拿去 Blender 修再放回來，但之後別再跑匯出，會被蓋掉。

其他來源的 GLB（Meshy 等）也能用：放進來、在 `BUILDING_MODELS` 登記 `{ name: "xxx", height: 13 }`
（模型不是公尺就填實際高度；正面不朝 +Z 再填 `rotationY`）。
