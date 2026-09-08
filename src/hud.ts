// 玩家看得到的 UI：狀態列（❤／關數／進度／倒數）與三種覆蓋畫面。
// 覆蓋畫面的版面在 index.html（#banner / #fail / #win），要換素材改那邊；
// 這裡只負責塞文字和開關顯示。

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export class Hud {
  private readonly hearts = el("hearts");
  private readonly level = el("level");
  private readonly progress = el("progress");
  private readonly timer = el("timer");
  private readonly banner = el("banner");
  private readonly bannerTitle = el("banner-title");
  private readonly bannerSub = el("banner-sub");
  private readonly fail = el("fail");
  private readonly failTitle = el("fail-title");
  private readonly failSub = el("fail-sub");
  private readonly failPrompt = el("fail-prompt");
  private readonly win = el("win");
  private readonly winPrompt = el("win-prompt");
  private promptTimer = 0; // 延遲顯示「按任意鍵」的計時器

  setStatus(
    hearts: number,
    maxHearts: number,
    levelIndex: number,
    levelCount: number,
    dist: number,
    goal: number,
    timeLeft: number,
  ): void {
    this.hearts.textContent =
      "❤ ".repeat(hearts) + "🖤 ".repeat(maxHearts - hearts);
    this.level.textContent = `第 ${levelIndex + 1} / ${levelCount} 關`;
    this.progress.textContent = `${Math.floor(dist)} / ${goal} m`;
    this.timer.textContent = `⏱ ${Math.max(timeLeft, 0).toFixed(1)}`;
    this.timer.classList.toggle("low", timeLeft < 10);
  }

  showBanner(title: string, sub: string): void {
    this.bannerTitle.textContent = title;
    this.bannerSub.textContent = sub;
    this.banner.classList.add("show");
  }

  // promptDelayMs 過後才顯示「按任意鍵」，跟 main.ts 開始接受按鍵的時間點一致
  showFail(title: string, sub: string, prompt: string, promptDelayMs: number): void {
    this.failTitle.textContent = title;
    this.failSub.textContent = sub;
    this.failPrompt.textContent = "";
    this.fail.classList.add("show");
    this.promptTimer = window.setTimeout(() => {
      this.failPrompt.textContent = prompt;
    }, promptDelayMs);
  }

  showWin(promptDelayMs: number): void {
    this.winPrompt.textContent = "";
    this.win.classList.add("show");
    this.promptTimer = window.setTimeout(() => {
      this.winPrompt.textContent = "按任意鍵再走一輪";
    }, promptDelayMs);
  }

  hideOverlays(): void {
    window.clearTimeout(this.promptTimer);
    for (const overlay of [this.banner, this.fail, this.win]) {
      overlay.classList.remove("show");
    }
  }
}
