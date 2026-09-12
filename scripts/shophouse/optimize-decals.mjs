// 壓 public/assets/decals/ 底下所有 PNG：轉成 256 色調色盤（libimagequant，跟 pngquant 同源），原地覆蓋。
// 只在真的變小時才覆蓋；已經壓過的再跑一次不會再變。跑法：npm run optimize:decals
// 想留原圖的話先另外備份——這是有損壓縮（顏色減到 256 色，肉眼幾乎看不出）。
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import sharp from "sharp";

const ROOT = "public/assets/decals";
const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (e.name.toLowerCase().endsWith(".png")) files.push(p);
  }
})(ROOT);

let before = 0, after = 0;
for (const f of files.sort()) {
  const src = readFileSync(f);
  const out = await sharp(src).png({ palette: true, quality: 85, effort: 8, dither: 0.6 }).toBuffer();
  const keep = out.length < src.length * 0.95;
  if (keep) writeFileSync(f, out);
  before += src.length; after += keep ? out.length : src.length;
  const kb = (n) => (n / 1024).toFixed(0).padStart(5) + " KB";
  console.log(`${kb(src.length)} → ${kb(keep ? out.length : src.length)}  ${keep ? "" : "（沒變小，保留）"} ${f.slice(ROOT.length + 1)}`);
}
console.log(`\n合計 ${(before / 1048576).toFixed(1)} MB → ${(after / 1048576).toFixed(1)} MB`);
