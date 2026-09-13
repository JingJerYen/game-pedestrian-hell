// 虛擬搖桿：手指（或電腦的滑鼠左鍵）按住畫面任意處就地生成搖桿，拖曳方向＝移動方向、拖越遠越快（無段式），
// 放開就停。輸出是畫面座標的類比向量 axis（x 往右、y 往下，長度 0～1），main.ts 搖桿按著時就用它取代鍵盤。

const DEAD_ZONE = 10; // 拖曳超過幾 px 才算有方向（避免手抖）
const FULL_RANGE = 60; // 拖到幾 px 就是全速
const KNOB_RANGE = 44; // 搖桿頭最多離中心幾 px（純視覺）

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
  readonly axis = { x: 0, y: 0 }; // 目前的搖桿向量（畫面座標，長度 0～1）；沒按就是 0
  get active(): boolean {
    return this.pointerId !== null;
  }

  constructor(private readonly onTap: () => void) {
    // 手機瀏覽器的雙擊縮放/下拉重整靠 CSS touch-action:none＋這個 preventDefault 擋掉
    window.addEventListener(
      "touchstart",
      (e) => {
        if (!onUiButton(e)) e.preventDefault();
      },
      { passive: false },
    );

    window.addEventListener("pointerdown", (e) => {
      if (this.pointerId !== null) return;
      if (e.pointerType === "mouse" && e.button !== 0) return; // 滑鼠只認左鍵
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
      this.axis.x = this.axis.y = 0;
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
    if (len < DEAD_ZONE) {
      this.axis.x = this.axis.y = 0;
      return;
    }
    // 死區外到 FULL_RANGE 之間線性放大到 0～1，方向照拖曳方向不量化
    const mag = Math.min(1, (len - DEAD_ZONE) / (FULL_RANGE - DEAD_ZONE));
    this.axis.x = (dx / len) * mag;
    this.axis.y = (dy / len) * mag;
  }
}
