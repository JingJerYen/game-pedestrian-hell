// 開發用 overlay：按 `（Esc 下面那顆）開關。顯示 FPS 和目前的關卡/車流狀態，
// 調 tuning.ts 時看得到遊戲內部的數字。純開發工具，不影響遊戲。

export class DebugOverlay {
  private readonly el = document.getElementById("debug")!;
  private visibleFlag = false;
  private acc = 0;
  private frames = 0;
  private fps = 0;
  // 每幀 JS 耗時（毫秒）：邏輯 / 畫面提交 / 整幀，這 0.5 秒的平均與最大
  private simSum = 0;
  private renderSum = 0;
  private totalSum = 0;
  private totalMax = 0;
  private frameStart = 0;
  private timing = "";

  constructor() {
    window.addEventListener("keydown", (e) => {
      if (e.key === "`") {
        this.visibleFlag = !this.visibleFlag;
        this.el.classList.toggle("show", this.visibleFlag);
      }
    });
  }

  get visible(): boolean {
    return this.visibleFlag;
  }

  // t.sim = 這幀到目前為止的邏輯耗時、t.frameStart = 這幀開始的 performance.now()
  // lines 用函式傳，隱藏時完全不花力氣組字串
  update(dt: number, t: { sim: number; frameStart: number }, lines: () => string): void {
    this.acc += dt;
    this.frames++;
    this.simSum += t.sim;
    this.frameStart = t.frameStart;
    if (this.acc < 0.5) return; // 每 0.5 秒刷新一次就夠了
    this.fps = this.frames / this.acc;
    const n = this.frames;
    this.timing =
      `JS 每幀 平均 ${(this.totalSum / n).toFixed(1)} ms（最大 ${this.totalMax.toFixed(1)}）` +
      `＝邏輯 ${(this.simSum / n).toFixed(1)}＋畫面提交 ${(this.renderSum / n).toFixed(1)}＋其他；` +
      `60fps 要 < 16.7、30fps 要 < 33`;
    this.acc = 0;
    this.frames = 0;
    this.simSum = this.renderSum = this.totalSum = this.totalMax = 0;
    if (this.visibleFlag) {
      this.el.textContent = `fps ${this.fps.toFixed(0)}  ${this.timing}\n${lines()}`;
    }
  }

  // renderer.render 前呼叫時記 renderStart；render 之後呼叫結算這幀
  endFrame(renderStart: number): void {
    const now = performance.now();
    this.renderSum += now - renderStart;
    const total = now - this.frameStart;
    this.totalSum += total;
    this.totalMax = Math.max(this.totalMax, total);
  }
}
