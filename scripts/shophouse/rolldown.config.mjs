// npm run export:buildings 用：把 TS 匯出腳本打包成 Node 能跑的單檔
export default {
  input: "scripts/shophouse/export.ts",
  platform: "node",
  external: ["three", /^three\//, /^node:/],
  output: { file: "scripts/dist/export-shophouses.mjs", format: "esm" },
};
