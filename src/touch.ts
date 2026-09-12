// 虛擬搖桿：拇指按住畫面任意處就地生成搖桿，拖曳方向＝移動方向（八方向），
// 放開就停——跟鍵盤「按住移動」同一種手感。
// 寫入跟鍵盤共用的 held 集合，遊戲邏輯不知道（也不需要知道）輸入來自哪裡。

const DEAD_ZONE = 14; // 拖曳超過幾 px 才算有方向（避免手抖）
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
  private readonly myKeys = new Set<string>(); // 只清掉自己加的方向，不動鍵盤的

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
    this.clearDirs();
    if (dy < -DEAD_ZONE) this.add("up");
    if (dy > DEAD_ZONE) this.add("down");
    if (dx < -DEAD_ZONE) this.add("left");
    if (dx > DEAD_ZONE) this.add("right");
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
