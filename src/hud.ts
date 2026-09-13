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
  private readonly bannerLoading = el("banner-loading");
  private readonly warn = el("warn");
  private warnKey = ""; // 上次顯示的狀態，沒變就不動 DOM
  private readonly banner = el("banner");
  private readonly bannerTitle = el("banner-title");
  private readonly bannerFlavor = el("banner-flavor");
  private readonly bannerSub = el("banner-sub");
  private readonly fail = el("fail");
  private readonly failTitle = el("fail-title");
  private readonly failFlavor = el("fail-flavor");
  private readonly failSub = el("fail-sub");
  private readonly failPrompt = el("fail-prompt");
  private readonly win = el("win");
  private readonly winPrompt = el("win-prompt");
  private readonly camToggle = el("cam-toggle") as HTMLButtonElement;
  private promptTimer = 0; // 延遲顯示「按任意鍵」的計時器

  // 鏡頭模式切換鈕：按了呼叫 onToggle；按鈕上的字由 setCameraModeLabel 更新
  bindCameraToggle(onToggle: () => void): void {
    this.camToggle.addEventListener("click", (e) => {
      e.preventDefault();
      onToggle();
      this.camToggle.blur(); // 焦點還給遊戲，不然之後按空白鍵會再按到按鈕
    });
  }
  setCameraModeLabel(text: string): void {
    this.camToggle.textContent = text;
  }

  setStatus(
    hearts: number,
    maxHearts: number,
    levelIndex: number,
    progressText: string,
    timeLeft: number,
  ): void {
    this.hearts.textContent =
      "❤ ".repeat(hearts) + "🖤 ".repeat(maxHearts - hearts);
    // 關數一直往上累計（之後接無限隨機關卡，沒有「總共幾關」這種事）
    this.level.textContent = `第 ${levelIndex + 1} 關`;
    this.progress.textContent = progressText;
    this.timer.textContent = `⏱ ${Math.max(timeLeft, 0).toFixed(1)}`;
    this.timer.classList.toggle("low", timeLeft < 10);
  }

  // flavor = 關卡風味小語（「趕著打卡」…），空字串就不顯示
  // 後方來車警示：null = 不顯示；side 決定「!」偏左/偏右與箭頭方向；seconds < 1 更大更急
  setRearWarning(w: { side: -1 | 0 | 1; seconds: number } | null): void {
    const key = w ? `${w.side}:${w.seconds < 1 ? 1 : 0}` : "";
    if (key === this.warnKey) return;
    this.warnKey = key;
    if (!w) {
      this.warn.className = "";
      return;
    }
    this.warn.textContent = w.side < 0 ? "◀ !" : w.side > 0 ? "! ▶" : "!";
    this.warn.className = `show${w.side < 0 ? " left" : w.side > 0 ? " right" : ""}${w.seconds < 1 ? " urgent" : ""}`;
  }

  // 開場素材還沒載完：橫幅變不透明並顯示「載入中」；載完呼叫 setLoading(false) 恢復
  setLoading(on: boolean): void {
    this.banner.classList.toggle("loading", on);
    this.bannerLoading.textContent = on ? "素材載入中…" : "";
  }

  showBanner(title: string, flavor: string, sub: string): void {
    this.bannerTitle.textContent = title;
    this.bannerFlavor.textContent = flavor;
    this.bannerSub.textContent = sub;
    this.banner.classList.add("show");
  }

  // flavor = 死亡小知識（空字串就不顯示）；
  // promptDelayMs 過後才顯示「按任意鍵」，跟 main.ts 開始接受按鍵的時間點一致
  showFail(
    title: string,
    flavor: string,
    sub: string,
    prompt: string,
    promptDelayMs: number,
  ): void {
    this.failTitle.textContent = title;
    this.failFlavor.textContent = flavor;
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
    this.setRearWarning(null);
    for (const overlay of [this.banner, this.fail, this.win]) {
      overlay.classList.remove("show");
    }
  }
}
