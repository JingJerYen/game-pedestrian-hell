// 把 buildingkit 蓋的街屋匯出成 GLB：npm run export:buildings
// 每次執行重新隨機蓋 COUNT 款（樓層/面寬/顏色/招牌位置），覆蓋 public/assets/models/buildings/shophouse-N.glb
import { writeFileSync } from "node:fs";
import * as THREE from "three";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { makeShophouse } from "../src/buildingkit";

const COUNT = 6;
const OUT = "public/assets/models/buildings";

// Node 沒有 FileReader / document：GLTFExporter 只用到 readAsArrayBuffer，補一個最小的
(globalThis as any).FileReader = class {
  result: ArrayBuffer | null = null;
  onloadend: (() => void) | null = null;
  readAsArrayBuffer(blob: Blob) {
    blob.arrayBuffer().then((buf) => {
      this.result = buf;
      this.onloadend?.();
    });
  }
};
(globalThis as any).document = {
  createElement: () => ({ width: 0, height: 0, getContext: () => new Proxy({}, { get: () => () => {} }) }),
};

async function exportOne(i: number): Promise<void> {
  const house = makeShophouse();
  const exporter = new GLTFExporter();
  const glb = (await exporter.parseAsync(house.root, { binary: true })) as ArrayBuffer;
  const file = `${OUT}/shophouse-${i}.glb`;
  writeFileSync(file, Buffer.from(glb));
  console.log(`${file}  面寬 ${house.width.toFixed(2)} m  ${(glb.byteLength / 1024).toFixed(0)} KB`);
}
for (let i = 1; i <= COUNT; i++) await exportOne(i);
