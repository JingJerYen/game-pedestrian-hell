# 路旁建築模型

目前的街屋 `shophouse-1..6.glb` 是程式蓋的塊狀街屋（`src/buildingkit.ts`），用
`npm run export:buildings` 匯出（每次重新隨機蓋 6 款：樓層、面寬、磁磚色、招牌在哪個角）。
單位公尺、正面朝 +Z，裡面的 `decal_<槽名>` 網格會在遊戲載入時貼上 `public/assets/decals/` 的 PNG。
可以拿去 Blender 修改再放回來，只要保留 `decal_*` 的網格名稱貼圖槽就還會作用。

其他來源的 GLB（Meshy 等）也能用：放進來、在 `src/skins.ts` 的 `BUILDING_MODELS` 登記
`{ name: "xxx", height: 13 }`（模型不是公尺就填實際高度，程式縮放；正面不朝 +Z 再填 `rotationY`）。

模型規格：
- 瘦高盒子：街屋面寬 4～6 m、每層 3.2 m、3～5 層。深度不重要。
- 左右側牆盡量平（會被鄰居貼住）；底部平的；正面可以凸出招牌、雨遮。
- 對齊人行道只看離地 2.5 m 以下的牆面輪廓。
