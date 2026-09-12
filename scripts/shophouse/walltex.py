# 牆面紋理產生器：畫四款 512×512、四邊無縫的灰階 PNG 到 public/assets/decals/walls/。
# 一張圖代表牆上 1 m × 1 m；遊戲裡用 specs.ts 的 wallColor 染色，所以圖是灰階、整體偏亮。
# 跑法：python3 scripts/shophouse/walltex.py（只要 numpy）
import zlib, struct, numpy as np

N = 512  # 像素 = 1 m
OUT = "public/assets/decals/walls"
rng = np.random.default_rng(7)


def save_png(path, gray):
    """gray: (N,N) float 0..1 → 8-bit 灰階 PNG"""
    a = np.clip(gray * 255 + 0.5, 0, 255).astype(np.uint8)
    raw = b"".join(b"\x00" + a[y].tobytes() for y in range(a.shape[0]))
    def chunk(t, d):
        return struct.pack(">I", len(d)) + t + d + struct.pack(">I", zlib.crc32(t + d) & 0xFFFFFFFF)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", a.shape[1], a.shape[0], 8, 0, 0, 0, 0))
    png += chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b"")
    open(path, "wb").write(png)


def periodic_noise(cells, octaves=3, gain=0.5):
    """週期性雜訊（四邊接得起來）：低解析亂數格，環狀雙線性放大，疊幾層"""
    total = np.zeros((N, N)); amp = 1.0; norm = 0.0
    for o in range(octaves):
        c = cells * (2 ** o)
        g = rng.random((c, c))
        ys = np.arange(N) * c / N; xs = np.arange(N) * c / N
        y0 = np.floor(ys).astype(int); x0 = np.floor(xs).astype(int)
        fy = (ys - y0)[:, None]; fx = (xs - x0)[None, :]
        fy = fy * fy * (3 - 2 * fy); fx = fx * fx * (3 - 2 * fx)
        y1 = (y0 + 1) % c; x1 = (x0 + 1) % c
        v = (g[y0][:, x0] * (1 - fy) * (1 - fx) + g[y0][:, x1] * (1 - fy) * fx
             + g[y1][:, x0] * fy * (1 - fx) + g[y1][:, x1] * fy * fx)
        total += (v - 0.5) * amp; norm += amp; amp *= gain
    return total / norm  # 約 -0.5..0.5


def bond(cols, rows, grout, offset=0.5, face_var=0.06, grout_dark=0.45, base=0.88, bevel=0.0):
    """順砌磚牆：cols/rows 每公尺幾塊（整數才無縫），grout 縫寬（公尺），offset 隔行錯位比例"""
    tw = N / cols; th = N / rows; gw = max(1.0, grout * N)
    y, x = np.mgrid[0:N, 0:N].astype(float)
    row = np.floor(y / th).astype(int)
    xs = (x + row * tw * offset) % N  # 隔行錯位
    col = np.floor(xs / tw).astype(int)
    lx = xs - col * tw; ly = y - row * th
    in_grout = (lx < gw) | (ly < gw)
    # 每塊磚亮度略不同（用磚的索引取亂數，週期一致）
    face = rng.random((rows, cols)) * 2 - 1
    img = base + face[row % rows, col % cols] * face_var
    if bevel > 0:  # 磚面邊緣稍暗，看起來有厚度
        edge = np.minimum(np.minimum(lx - gw, tw - 1 - lx), np.minimum(ly - gw, th - 1 - ly)) / max(tw, th)
        img -= np.clip(bevel - edge * 6, 0, bevel)
    img += periodic_noise(32, 3) * 0.06
    img = np.where(in_grout, grout_dark + periodic_noise(64, 2) * 0.08, img)
    return img


# 1. 二丁掛：長條磚 0.25×0.0625 m（每公尺 4 列×16 行），順砌錯半塊，縫細
save_png(f"{OUT}/tile_long.png", bond(4, 16, 0.006, offset=0.5, face_var=0.05, grout_dark=0.5, base=0.86, bevel=0.06))
# 2. 小口方磚：0.1 m 方形（每公尺 10×10），整齊排列，縫細，磚面略有光澤變化
save_png(f"{OUT}/tile_square.png", bond(10, 10, 0.006, offset=0.0, face_var=0.04, grout_dark=0.55, base=0.9, bevel=0.05))
# 3. 洗石子：細顆粒雜訊，沒有縫
pebble = 0.84 + periodic_noise(128, 3, 0.6) * 0.28 + periodic_noise(16, 2) * 0.08
speck = rng.random((N, N)); pebble = np.where(speck < 0.015, 0.62, np.where(speck > 0.992, 0.97, pebble))
save_png(f"{OUT}/pebble.png", pebble)
# 4. 紅磚：0.2×0.0625 m（每公尺 5 列×16 行），順砌，縫粗、磚面粗糙、亮度差大
save_png(f"{OUT}/brick.png", bond(5, 16, 0.012, offset=0.5, face_var=0.12, grout_dark=0.6, base=0.8, bevel=0.0))
print("已輸出 tile_long / tile_square / pebble / brick 到", OUT)
