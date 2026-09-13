// 把 specs.ts 表裡的每一棟蓋出來、匯出成 GLB：npm run export:buildings
// 輸出到 public/assets/models/buildings/<name>.glb（覆蓋）。遊戲只用現成的 GLB 和 PNG，不含產生器。
//
// 貼圖用「外部檔案」：GLB 裡只記圖檔的相對路徑（../../decals/...），不內嵌。
// 店面／招牌／鐵窗的所有 PNG 先拼成一張圖集 decals/atlas.webp（這裡產生），每棟的貼圖面 UV 改指向
// 圖集裡的位置後合併成一個網格「decals」——一棟只剩 3 個網格（body、wall、decals），draw call 少一半以上；
// 全部街屋共用同一張圖集，瀏覽器只下載一次。牆面紋理要無縫重複，不能進圖集，維持獨立檔案。
// 哪個槽找不到圖，那個槽的面就從 GLB 移掉（留白）。
import { existsSync, writeFileSync } from "node:fs";
import * as THREE from "three";
import sharp from "sharp";
import { GLTFExporter } from "three/examples/jsm/exporters/GLTFExporter.js";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { makeShophouse, type DecalSlot, type ShophouseSpec } from "./kit";
import { SPECS } from "./specs";

const OUT = "public/assets/models/buildings";
const DECALS = "public/assets/decals"; // 實體資料夾
const DECALS_REL = "../../decals"; // 從 GLB 所在資料夾到 decals 的相對路徑（寫進 GLB）
const ATLAS_FILE = "atlas.webp"; // 圖集（decals/ 底下），匯出時重產，不要手改
const ATLAS_W = 4096; // 圖集寬（高度依內容算，上限也是 4096）
const ATLAS_PAD = 8; // 圖與圖之間留白，mipmap 縮小時才不會互相染色
const DECAL_SLOTS: DecalSlot[] = ["storefront", "banner", "cube", "vsign", "window"];

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

// 這棟每個槽要貼的 PNG（相對 decals/ 的路徑）；找不到檔案回傳 null（quiet = 不印缺圖）
function decalFile(spec: ShophouseSpec, slot: DecalSlot | "wall", quiet = false): string | null {
  const rel =
    slot === "wall"
      ? spec.wall
        ? `walls/${spec.wall}.png`
        : null
      : slot === "window"
        ? spec.windows
          ? `windows/${spec.windows}.png`
          : null
        : spec.store
          ? `stores/${spec.store}/${slot}.png`
          : null;
  if (!rel) return null;
  if (!existsSync(`${DECALS}/${rel}`)) {
    if (!quiet) console.log(`  （缺圖）${rel} → 槽 ${slot} 留白`);
    return null;
  }
  return rel;
}

// ── 圖集 ──
interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}
interface Atlas {
  regions: Map<string, Region>; // 檔案（相對 decals/）→ 在圖集裡的位置（像素，y 從上往下）
  width: number;
  height: number;
}
// 收集所有 spec 用到的店面／招牌／鐵窗圖，依高度排好一排排放（shelf packing），合成 atlas.webp
async function buildAtlas(): Promise<Atlas> {
  const files = new Set<string>();
  for (const spec of SPECS) for (const slot of DECAL_SLOTS) {
    const f = decalFile(spec, slot, true);
    if (f) files.add(f);
  }
  // 1024 寬的圖縮到 1000（一排剛好放 4 張加間距；圖貼到面上本來就會拉伸，看不出差別）
  const MAX_W = 1000;
  const items: { f: string; w: number; h: number; buf: Buffer }[] = [];
  for (const f of files) {
    const img = sharp(`${DECALS}/${f}`);
    const m = await img.metadata();
    let w = m.width!;
    let h = m.height!;
    if (w > MAX_W) {
      h = Math.round((h * MAX_W) / w);
      w = MAX_W;
    }
    items.push({ f, w, h, buf: await img.resize(w, h).png().toBuffer() });
  }
  // 由高到低排；每張先找「放得下的舊排」（矮的圖塞進高排的剩餘空間），沒有才開新排
  items.sort((a, b) => b.h - a.h || b.w - a.w);
  const rows: { y: number; h: number; x: number }[] = [];
  const regions = new Map<string, Region>();
  let nextY = ATLAS_PAD;
  for (const it of items) {
    let row = rows.find((r) => it.h <= r.h && r.x + it.w + ATLAS_PAD <= ATLAS_W);
    if (!row) {
      row = { y: nextY, h: it.h, x: ATLAS_PAD };
      rows.push(row);
      nextY += it.h + ATLAS_PAD;
    }
    regions.set(it.f, { x: row.x, y: row.y, w: it.w, h: it.h });
    row.x += it.w + ATLAS_PAD;
  }
  const height = Math.ceil(nextY / 4) * 4;
  if (height > 4096) throw new Error(`圖集太高（${height} px）：店家太多，要縮圖或分兩張`);
  await sharp({ create: { width: ATLAS_W, height, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite(items.map((it) => ({ input: it.buf, left: regions.get(it.f)!.x, top: regions.get(it.f)!.y })))
    .webp({ quality: 88, alphaQuality: 90 })
    .toFile(`${DECALS}/${ATLAS_FILE}`);
  console.log(`圖集 ${DECALS}/${ATLAS_FILE}  ${ATLAS_W}×${height}  ${items.length} 張圖`);
  return { regions, width: ATLAS_W, height };
}

// 把這棟的 decal_<槽> 網格：UV 改指向圖集區域，全部合併成一個網格「decals」；沒圖的槽直接丟掉
function mergeDecals(root: THREE.Object3D, spec: ShophouseSpec, atlas: Atlas): void {
  const parts: THREE.BufferGeometry[] = [];
  for (const child of [...root.children]) {
    const mesh = child as THREE.Mesh;
    if (!mesh.isMesh || !mesh.name.startsWith("decal_")) continue;
    root.remove(mesh);
    const slot = mesh.name.slice("decal_".length) as DecalSlot;
    const file = decalFile(spec, slot);
    if (!file) continue;
    const r = atlas.regions.get(file)!;
    const g = mesh.geometry.clone();
    const uv = g.attributes.uv;
    for (let i = 0; i < uv.count; i++) {
      uv.setXY(i, (r.x + uv.getX(i) * r.w) / atlas.width, (r.y + uv.getY(i) * r.h) / atlas.height);
    }
    parts.push(g);
  }
  if (parts.length === 0) return;
  const merged = new THREE.Mesh(mergeGeometries(parts), new THREE.MeshLambertMaterial({ color: 0xffffff }));
  merged.name = "decals";
  root.add(merged);
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

// 把圖接到網格上（外部 uri）：「decals」網格 → 圖集（CLAMP、去背），「wall」網格 → 牆面紋理（REPEAT）
function attachTextures(json: any, spec: ShophouseSpec): void {
  json.images ??= [];
  json.textures ??= [];
  json.samplers ??= [];
  json.materials ??= [];
  const clampIdx = json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }) - 1;
  const repeatIdx = json.samplers.push({ magFilter: 9729, minFilter: 9987, wrapS: 10497, wrapT: 10497 }) - 1;
  for (const node of json.nodes) {
    if (node.mesh === undefined) continue;
    const isWall = node.name === "wall";
    const isDecals = node.name === "decals";
    if (!isWall && !isDecals) continue;
    const file = isWall ? decalFile(spec, "wall") : ATLAS_FILE;
    if (!file) continue; // 牆體沒紋理就維持純色
    const uri = `${DECALS_REL}/${file}`;
    const imgIdx = json.images.push({ uri, name: uri }) - 1; // name = uri，遊戲端靠它共用同一張貼圖
    const texIdx = json.textures.push({ source: imgIdx, sampler: isWall ? repeatIdx : clampIdx, name: uri }) - 1;
    const matIdx = isWall
      ? json.materials.push({
          name: "wall",
          // 灰階紋理 × 頂點色（wallColor）：glTF 規定 COLOR_0 會乘進 baseColor
          pbrMetallicRoughness: { baseColorTexture: { index: texIdx }, metallicFactor: 0, roughnessFactor: 1 },
        }) - 1
      : json.materials.push({
          name: "decals",
          pbrMetallicRoughness: { baseColorTexture: { index: texIdx }, metallicFactor: 0, roughnessFactor: 1 },
          alphaMode: "MASK",
          alphaCutoff: 0.5,
        }) - 1;
    for (const prim of json.meshes[node.mesh].primitives) prim.material = matIdx;
  }
}

const atlas = await buildAtlas();
for (const spec of SPECS) {
  const house = makeShophouse(spec);
  mergeDecals(house.root, spec, atlas);
  const raw = (await new GLTFExporter().parseAsync(house.root, { binary: true })) as ArrayBuffer;
  const { json, bin } = splitGlb(raw);
  attachTextures(json, spec);
  const file = `${OUT}/${spec.name}.glb`;
  writeFileSync(file, joinGlb(json, bin));
  console.log(`${file}  ${spec.floors} 層  面寬 ${house.width.toFixed(2)} m  店家 ${spec.store ?? "-"}  鐵窗 ${spec.windows ?? "-"}  牆 ${spec.wall ?? "純色"}`);
}
