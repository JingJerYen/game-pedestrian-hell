// 開發用 overlay：按 `（Esc 下面那顆）開關。顯示 FPS 和目前的關卡/車流狀態，
// 調 tuning.ts 時看得到遊戲內部的數字。純開發工具，不影響遊戲。

export class DebugOverlay {
  private readonly el = document.getElementById("debug")!;
  private visible = false;
  private acc = 0;
  private frames = 0;
  private fps = 0;

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "`") {
        this.visible = !this.visible;
        this.el.classList.toggle("show", this.visible);
      }
    });
  }

  // lines 用函式傳，隱藏時完全不花力氣組字串
  update(dt: number, lines: () => string): void {
    this.acc += dt;
    this.frames++;
    if (this.acc < 0.5) return; // 每 0.5 秒刷新一次就夠了
    this.fps = this.frames / this.acc;
    this.acc = 0;
    this.frames = 0;
    if (this.visible) {
      this.el.textContent = `fps ${this.fps.toFixed(0)}\n${lines()}`;
    }
  }
}
