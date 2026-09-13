// 虛擬搖桿：拇指按住畫面任意處就地生成搖桿，拖曳方向＝移動方向（八方向），
// 放開就停——跟鍵盤「按住移動」同一種手感。
// 寫入跟鍵盤共用的 held 集合，遊戲邏輯不知道（也不需要知道）輸入來自哪裡。
// 方向用「角度分成 8 個扇區」判定，換扇區要跨過一點遲滯角，手指小抖不會一直換方向
// （第一人稱每換一次方向就重新鎖定一次視線方向，抖動會讓視線跟著晃）。

const DEAD_ZONE = 14; // 拖曳超過幾 px 才算有方向（避免手抖）
const DEAD_ZONE_EXIT = 8; // 已經有方向後，要縮回到幾 px 內才算放開（遲滯）
const SECTOR = Math.PI / 4; // 8 方向，每個扇區 45°
const SECTOR_HYST = SECTOR * 0.18; // 換扇區要比扇區邊界再多跨這麼多（約 8°）
const KNOB_RANGE = 44; // 搖桿頭最多離中心幾 px（純視覺）
// 扇區 0 = 右，逆時針（螢幕座標 y 朝下，所以 up 是 -y）：右、右上、上、左上、左、左下、下、右下
const SECTOR_KEYS: string[][] = [["right"], ["right", "up"], ["up"], ["left", "up"], ["left"], ["left", "down"], ["down"], ["right", "down"]];

// 點到 UI 按鈕（例如右上角的視角切換）就交給按鈕處理：不生成搖桿、也不擋掉它的點擊
function onUiButton(e: Event): boolean {
  const target = e.target as HTMLElement | null;
  return !!target?.closest?.("button");
}

export class TouchControls {
  private readonly base = document.getElementById("stick-base")!;
  private readonly knob = document.getElementById("stick-knob")!;
  private pointerId: number | null = null;
  private originX = 0;
  private originY = 0;
  private readonly myKeys = new Set<string>(); // 只清掉自己加的方向，不動鍵盤的
  private sector = -1; // 目前的扇區（-1 = 在死區、沒方向）

  constructor(
    private readonly held: Set<string>,
    private readonly onTap: () => void,
  ) {
    // 手機瀏覽器的雙擊縮放/下拉重整靠 CSS touch-action:none＋這個 preventDefault 擋掉
    window.addEventListener(
      "touchstart",
      (e) => {
        if (!onUiButton(e)) e.preventDefault();
      },
      { passive: false },
    );

    window.addEventListener("pointerdown", (e) => {
      if (e.pointerType !== "touch" || this.pointerId !== null) return;
      if (onUiButton(e)) return;
      this.onTap(); // 結算畫面的「按任意鍵」，點螢幕也算
      this.pointerId = e.pointerId;
      this.originX = e.clientX;
      this.originY = e.clientY;
      this.base.style.left = `${e.clientX}px`;
      this.base.style.top = `${e.clientY}px`;
      this.base.style.display = "block";
      this.moveKnob(0, 0);
    });

    window.addEventListener("pointermove", (e) => {
      if (e.pointerId !== this.pointerId) return;
      const dx = e.clientX - this.originX;
      const dy = e.clientY - this.originY;
      this.setDirs(dx, dy);
      // 搖桿頭視覺跟著拖，但不超出範圍
      const len = Math.hypot(dx, dy);
      const scale = len > KNOB_RANGE ? KNOB_RANGE / len : 1;
      this.moveKnob(dx * scale, dy * scale);
    });

    const release = (e: PointerEvent) => {
      if (e.pointerId !== this.pointerId) return;
      this.pointerId = null;
      this.sector = -1;
      this.clearDirs();
      this.base.style.display = "none";
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }

  private moveKnob(dx: number, dy: number): void {
    this.knob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  }

  private setDirs(dx: number, dy: number): void {
    const len = Math.hypot(dx, dy);
    if (len < (this.sector < 0 ? DEAD_ZONE : DEAD_ZONE_EXIT)) {
      this.sector = -1;
      this.clearDirs();
      return;
    }
    const angle = Math.atan2(-dy, dx); // 逆時針、右 = 0
    let next = this.sector;
    if (next < 0) next = Math.round(angle / SECTOR) & 7;
    else {
      // 只有離目前扇區中心超過（半個扇區＋遲滯）才換
      const center = next * SECTOR;
      const diff = Math.atan2(Math.sin(angle - center), Math.cos(angle - center));
      if (Math.abs(diff) > SECTOR / 2 + SECTOR_HYST) next = Math.round(angle / SECTOR) & 7;
    }
    if (next === this.sector) return;
    this.sector = next;
    this.clearDirs();
    for (const key of SECTOR_KEYS[next]) this.add(key);
  }

  private add(key: string): void {
    this.held.add(key);
    this.myKeys.add(key);
  }

  private clearDirs(): void {
    for (const key of this.myKeys) this.held.delete(key);
    this.myKeys.clear();
  }
}
