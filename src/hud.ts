// 玩家看得到的 UI：狀態列（❤／關數／進度／倒數）與三種覆蓋畫面。
// 覆蓋畫面的版面在 index.html（#banner / #fail / #win），要換素材改那邊；
// 這裡只負責塞文字和開關顯示。

function el(id: string): HTMLElement {
  return document.getElementById(id)!;
}

export class Hud {
  private readonly hearts = el("hearts");
  private readonly level = el("level");
  private readonly goal = el("goal");
  private readonly progress = el("progress");
  private readonly timer = el("timer");
  private readonly bannerLoading = el("banner-loading");
  private readonly hitVignette = el("hit-vignette");
  private readonly warn = el("warn");
  private readonly toast = el("toast");
  private warnKey = ""; // 上次顯示的狀態，沒變就不動 DOM
  private readonly hud = el("hud");
  private readonly hint = el("hint");
  private readonly sound = el("sound") as HTMLButtonElement;
  private readonly title = el("title");
  private readonly titleName = el("title-name");
  private readonly titleControls = el("title-controls");
  private readonly titleBarFill = el("title-bar-fill");
  private readonly titlePrompt = el("title-prompt");
  private readonly titleBest = el("title-best");
  private readonly titleChallenge = el("title-challenge");
  private readonly failShare = el("fail-share") as HTMLButtonElement;
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
  private readonly winTitle = el("win-title");
  private readonly winFlavor = el("win-flavor");
  private readonly winPrompt = el("win-prompt");
  private promptTimer = 0; // 延遲顯示「按任意鍵」的計時器

  // 右上角的音效開關按鈕（手機沒鍵盤，按不到 M）：點了就呼叫 onToggle，
  // 圖示由 main.ts 那邊呼叫 setMuted 更新（M 鍵按下去時也走同一條路）
  bindSoundButton(onToggle: () => void): void {
    this.sound.addEventListener("click", onToggle);
  }
  setMuted(muted: boolean): void {
    this.sound.textContent = muted ? "🔇" : "🔊";
    this.sound.classList.toggle("off", muted);
  }

  // 這關的目的地任務，整關掛在狀態列（空字串 = 不顯示，無盡模式用）
  setGoal(text: string): void {
    this.goal.textContent = text;
  }

  // hearts = null：不顯示命（無盡模式一條命）；timeLeft = Infinity：沒有時限，第四列改顯示 extraText（最遠紀錄）
  setStatus(
    hearts: number | null,
    maxHearts: number,
    levelText: string,
    progressText: string,
    timeLeft: number,
    extraText = "",
  ): void {
    this.hearts.textContent =
      hearts === null ? "" : "❤ ".repeat(hearts) + "🖤 ".repeat(maxHearts - hearts);
    this.level.textContent = levelText;
    this.progress.textContent = progressText;
    if (Number.isFinite(timeLeft)) {
      this.timer.textContent = `⏱ ${Math.max(timeLeft, 0).toFixed(1)}`;
      this.timer.classList.toggle("low", timeLeft < 10);
    } else {
      this.timer.textContent = extraText;
      this.timer.classList.remove("low");
    }
  }

  // 畫面中上方短暫浮出一行字（無盡模式升階提示），不擋操作、自己淡出
  showToast(text: string): void {
    this.toast.textContent = text;
    this.toast.classList.remove("show");
    void this.toast.offsetWidth; // 重新觸發 CSS 動畫
    this.toast.classList.add("show");
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

  // 無盡模式結算的分享鈕：按了呼叫 onClick（分享邏輯在 share.ts）；setShareVisible 決定顯不顯示
  bindShare(onClick: () => void): void {
    this.failShare.addEventListener("click", (e) => {
      e.preventDefault();
      onClick();
      this.failShare.blur(); // 焦點還給遊戲，不然按 Enter 會再按到按鈕
    });
  }
  setShareVisible(on: boolean): void {
    this.failShare.hidden = !on;
    this.failShare.textContent = "分享成績";
  }
  setShareLabel(text: string): void {
    this.failShare.textContent = text;
  }

  // 開場標題畫面：遊戲名、操作說明（每行一條）、最遠紀錄（0 = 不顯示）、挑戰一行（空字串 = 不顯示）
  showTitle(name: string, controls: readonly string[], best: number, challenge = ""): void {
    this.hideOverlays(); // 開遊戲時 startLevel 已經把第 1 關橫幅打開了，標題期間先藏起來
    this.titleName.textContent = name;
    this.titleChallenge.textContent = challenge;
    this.titleControls.textContent = controls.join("\n");
    this.titleBest.textContent = best > 0 ? `最遠紀錄 ${Math.floor(best)} m` : "";
    this.setTitleProgress(0, 1, false);
    this.title.classList.add("show");
    this.hud.classList.add("hidden"); // 標題畫面不顯示狀態列
    this.hint.hidden = true; // 底下那行操作提示跟標題框重複，先藏
  }
  // 載入進度：done/total 組素材；ready = 全部到齊（或等太久不等了），提示換成「點一下開始」並閃
  setTitleProgress(done: number, total: number, ready: boolean): void {
    this.titleBarFill.style.width = `${Math.round((ready ? 1 : done / total) * 100)}%`;
    this.titlePrompt.textContent = ready ? "點一下畫面或按任意鍵開始" : `素材載入中 ${done}/${total}`;
    this.titlePrompt.classList.toggle("ready", ready);
  }
  hideTitle(): void {
    this.title.classList.remove("show");
    this.hud.classList.remove("hidden");
    this.hint.hidden = false;
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

  // 被撞那一刻：紅色暈影閃一下（亮起 0.12 秒，然後由 CSS 淡出）
  flashHit(): void {
    this.hitVignette.classList.add("show");
    window.setTimeout(() => this.hitVignette.classList.remove("show"), 120);
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

  // 抵達畫面：title = 「到了！全聯」、flavor = 過關字幕（空字串不顯示）；
  // promptDelayMs 過後才顯示「按任意鍵」（沒按的話 main.ts 時間到自動進下一關）
  showClear(title: string, flavor: string, promptDelayMs: number): void {
    this.winTitle.textContent = title;
    this.winFlavor.textContent = flavor;
    this.winPrompt.textContent = "";
    this.win.classList.add("show");
    this.promptTimer = window.setTimeout(() => {
      this.winPrompt.textContent = "按任意鍵繼續";
    }, promptDelayMs);
  }

  hideOverlays(): void {
    window.clearTimeout(this.promptTimer);
    this.setRearWarning(null);
    for (const overlay of [this.banner, this.fail, this.win, this.toast]) {
      overlay.classList.remove("show");
    }
  }
}
