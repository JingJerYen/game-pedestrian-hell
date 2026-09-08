import { defineConfig } from "vite";

// GitHub Pages 部署在 /game-pedestrian-hell/ 子路徑下；
// 本機開發（npm run dev）維持根路徑，網址不變。
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/game-pedestrian-hell/" : "/",
}));
