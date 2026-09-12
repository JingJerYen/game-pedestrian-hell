// 把 specs.ts 表裡的每一棟蓋出來、匯出成 GLB：npm run export:buildings
// 輸出到 public/assets/models/buildings/<name>.glb（覆蓋）。遊戲只用現成的 GLB 和 PNG，不含產生器。
//
// 貼圖用「外部檔案」：GLB 裡只記 PNG 的相對路徑（../../decals/...），不內嵌——
// 多棟用同一家店的圖時瀏覽器只下載一次。哪個槽找不到圖，那個槽就從 GLB 移掉（留白）。
import { existsSync, writeFileSync } from "node:fs";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { makeShophouse, type DecalSlot, type ShophouseSpec } from "./kit";
import { SPECS } from "./specs";

const OUT = "public/assets/models/buildings";
const DECALS = "public/assets/decals"; // 實體資料夾
const DECALS_REL = "../../decals"; // 從 GLB 所在資料夾到 decals 的相對路徑（寫進 GLB）

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
console.warn = () => {}; // 匯出器對 Lambert 材質的提醒，略過

// 這棟每個槽要貼的 PNG（相對 decals/ 的路徑）；找不到檔案回傳 null
function decalFile(spec: ShophouseSpec, slot: DecalSlot): string | null {
  const rel = slot === "window" ? (spec.windows ? `windows/${spec.windows}.png` : null) : spec.store ? `stores/${spec.store}/${slot}.png` : null;
  if (!rel) return null;
  if (!existsSync(`${DECALS}/${rel}`)) {
    console.log(`  （缺圖）${rel} → 槽 ${slot} 留白`);
    return null;
  }
  return rel;
}

// GLB 二進位 → {json, bin}；改完再組回去
function splitGlb(buf: ArrayBuffer): { json: any; bin: Uint8Array } {
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  const binLen = dv.getUint32(20 + jsonLen, true);
  return { json, bin: new Uint8Array(buf, 28 + jsonLen, binLen) };
}
function joinGlb(json: any, bin: Uint8Array): Buffer {
  let jb = Buffer.from(JSON.stringify(json));
  while (jb.length % 4) jb = Buffer.concat([jb, Buffer.from(" ")]);
  let bb = Buffer.from(bin);
  while (bb.length % 4) bb = Buffer.concat([bb, Buffer.from([0])]);
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(12 + 8 + jb.length + 8 + bb.length, 8);
  const jh = Buffer.alloc(8);
  jh.writeUInt32LE(jb.length, 0);
  jh.writeUInt32LE(0x4e4f534a, 4);
  const bh = Buffer.alloc(8);
  bh.writeUInt32LE(bb.length, 0);
  bh.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jh, jb, bh, bb]);
}

// 把 PNG 接到 decal_<槽名> 網格上（外部 uri）；沒圖的槽從場景移除
function attachDecals(json: any, spec: ShophouseSpec): void {
  json.images ??= [];
  json.textures ??= [];
  json.samplers ??= [];
  json.materials ??= [];
  const samplerIdx = json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }) - 1;
  const removed = new Set<number>();
  json.nodes.forEach((node: any, nodeIdx: number) => {
    if (typeof node.name !== "string" || !node.name.startsWith("decal_") || node.mesh === undefined) return;
    const slot = node.name.slice("decal_".length) as DecalSlot;
    const file = decalFile(spec, slot);
    if (!file) {
      removed.add(nodeIdx);
      return;
    }
    const uri = `${DECALS_REL}/${file}`;
    const imgIdx = json.images.push({ uri, name: uri }) - 1; // name = uri，遊戲端靠它共用同一張貼圖
    const texIdx = json.textures.push({ source: imgIdx, sampler: samplerIdx, name: uri }) - 1;
    const matIdx =
      json.materials.push({
        name: `decal_${slot}`,
        pbrMetallicRoughness: { baseColorTexture: { index: texIdx }, metallicFactor: 0, roughnessFactor: 1 },
        alphaMode: "MASK",
        alphaCutoff: 0.5,
      }) - 1;
    for (const prim of json.meshes[node.mesh].primitives) prim.material = matIdx;
  });
  // 從父節點與場景根移除留白的槽
  for (const node of json.nodes) if (node.children) node.children = node.children.filter((c: number) => !removed.has(c));
  for (const scene of json.scenes) scene.nodes = scene.nodes.filter((c: number) => !removed.has(c));
}

for (const spec of SPECS) {
  const house = makeShophouse(spec);
  const raw = (await new GLTFExporter().parseAsync(house.root, { binary: true })) as ArrayBuffer;
  const { json, bin } = splitGlb(raw);
  attachDecals(json, spec);
  const file = `${OUT}/${spec.name}.glb`;
  writeFileSync(file, joinGlb(json, bin));
  console.log(`${file}  ${spec.floors} 層  面寬 ${house.width.toFixed(2)} m  店家 ${spec.store ?? "-"}  鐵窗 ${spec.windows ?? "-"}`);
}
