// 音效系統：Web Audio API。
//
// 為什麼不用 <audio> 標籤（原本喇叭聲的寫法）：那個走 DOM 媒體元素，第一次播會卡一下、
// 同一個聲音要重疊播還得複製元素。Web Audio 的做法是——
//   1. 玩家第一次碰畫面時，把每個聲音「算」成一段 AudioBuffer（波形陣列），只做這一次
//   2. 之後每次播放只是丟一個 AudioBufferSourceNode 給瀏覽器的音訊執行緒
// 音訊執行緒跟畫面是分開跑的，所以播音效對 fps 的影響趨近於零；每幀要做的事只有
// 「累積走了幾公尺、要不要踏一步」這種一兩行的判斷。
//
// 聲音來源有兩種，共用同一個名字：
//   合成音（預設）：下面的 SYNTH 用數學直接算出波形 —— 零檔案、零下載、零解碼
//   音檔覆蓋：在 tuning.ts 的 audio.sfx.<名字>.file 填檔名（檔案放 public/assets/sfx/），
//             就改用那個檔。留空字串 = 用合成音，而且不會發出沒必要的網路請求
//
// 開關有三層：TUNING.audio.enabled（總開關）→ 每個音效各自的 on（實驗用）→ 玩家按 M 鍵
// 全開/全關（記在瀏覽器，下次開遊戲還記得）。

import { TUNING } from "./tuning";

export type SfxName = keyof typeof TUNING.audio.sfx;

const MUTE_KEY = "sfxMuted"; // 玩家的靜音選擇存在 localStorage

// ── 波形產生器（只在開場跑一次）──────────────────────────────

// 把波形音量拉到固定大小：這樣各個聲音的相對大小完全由 tuning 的 volume 決定，
// 也不會因為疊太多諧波而爆音（超過 ±1 會破音）
function normalize(out: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (let i = 0; i < out.length; i++) max = Math.max(max, Math.abs(out[i]));
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < out.length; i++) out[i] *= k;
  }
  return out;
}

// 算一段波形：fn(t) 給第 t 秒的值（-1 ~ 1）。fn 是照順序呼叫的，所以裡面可以留狀態（見 footstep）
function render(sampleRate: number, seconds: number, fn: (t: number) => number): Float32Array {
  const n = Math.max(1, Math.floor(sampleRate * seconds));
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = fn(i / sampleRate);
  return normalize(out);
}

// 1 + 1/2 + ... + 1/k 先算好放著：這個值只跟諧波數有關，每個取樣點重算是白費力氣
const HARMONIC_NORM = Array.from({ length: 12 }, (_, n) => {
  let sum = 0;
  for (let k = 1; k <= n; k++) sum += 1 / k;
  return sum;
});

// 一個音：harmonics = 疊幾個諧波。1 = 純音（柔、電子感），越多越像鋸齒波（刺耳——喇叭要的就是這個）
function tone(t: number, freq: number, harmonics = 1): number {
  let v = 0;
  for (let k = 1; k <= harmonics; k++) v += Math.sin(2 * Math.PI * freq * k * t) / k;
  return v / HARMONIC_NORM[harmonics];
}

// 一階低通濾波器的係數：把「截止頻率（Hz）」換算成每個取樣點要混進多少新值。
// 一定要用這個算、不能把係數寫死——係數的意義跟取樣率綁在一起，
// 寫死的話改 renderRate 會連音色一起改掉（截止頻率跟著取樣率一起跑）。
// 小喇叭（手機、筆電）放不出大約 200 Hz 以下的東西，所以截止頻率訂太低 = 玩家什麼都聽不到
function lpCoef(sampleRate: number, hz: number): number {
  return 1 - Math.exp((-2 * Math.PI * hz) / sampleRate);
}

// 這個音效的波形要用多高的取樣率算。取樣率一半 = 能表現的最高頻率，
// 22050 → 11 kHz，該聽到的都在裡面；算越低越快、也越省記憶體。
// 播放時瀏覽器會自動轉成裝置的取樣率，音高和長度都不會變。
// 環境底噪只有低頻的轟隆，用 1/4（→ 2.7 kHz 上限）就夠，算起來快 4 倍
function rateFor(name: SfxName): number {
  return name === "ambient" ? TUNING.audio.renderRate / 4 : TUNING.audio.renderRate;
}

// 環境底噪：要能無縫循環，所以特別處理。
// 白噪音過兩級低通 = 遠處車流的「轟隆」；再乘上週期整除 loop 長度的起伏（接點才不會忽大忽小）；
// 最後把尾巴那段交叉淡接回開頭，循環時聽不到接縫
function renderAmbient(sampleRate: number, seconds: number): Float32Array {
  const n = Math.floor(sampleRate * seconds);
  const fade = Math.floor(sampleRate * 0.5); // 交叉淡接的長度
  const raw = new Float32Array(n + fade);
  const a = lpCoef(sampleRate, TUNING.audio.ambientTone); // 兩級疊起來 = 斜率更陡的「遠處」感
  let lp1 = 0;
  let lp2 = 0;
  for (let i = 0; i < raw.length; i++) {
    const t = i / sampleRate;
    lp1 += (Math.random() * 2 - 1 - lp1) * a;
    lp2 += (lp1 - lp2) * a;
    const swell =
      0.75 + 0.25 * Math.sin((2 * Math.PI * t) / seconds) + 0.12 * Math.sin((4 * Math.PI * t) / seconds);
    raw[i] = lp2 * swell;
  }
  const out = new Float32Array(n);
  out.set(raw.subarray(0, n));
  for (let i = 0; i < fade; i++) {
    const w = i / fade;
    out[i] = out[i] * w + raw[n + i] * (1 - w);
  }
  // 這裡不能用 normalize（那是按「尖峰」拉音量）。噪音的尖峰是偶爾冒出來的毛刺，
  // 人耳聽的卻是平均能量——同樣的尖峰，噪音聽起來比樂音小一半。
  // 所以改成按平均能量（RMS）拉到目標值，再用 tanh 把冒出來的尖峰壓平（不會破音）
  let sum = 0;
  for (let i = 0; i < n; i++) sum += out[i] * out[i];
  const rms = Math.sqrt(sum / n);
  const k = rms > 0 ? TUNING.audio.ambientLoudness / rms : 0;
  for (let i = 0; i < n; i++) out[i] = Math.tanh(out[i] * k);
  return out;
}

// 每個音效怎麼合成。名字要跟 tuning.ts 的 audio.sfx 一模一樣（型別會幫忙檢查）
const SYNTH: Record<SfxName, (sampleRate: number) => Float32Array> = {
  // 汽車喇叭：兩個音（大三度）一起響，疊多層諧波才有台灣路上那種「叭——」的刺耳感
  horn: (sr) =>
    render(sr, 0.5, (t) => {
      const attack = Math.min(t / 0.012, 1);
      const release = Math.min((0.5 - t) / 0.06, 1);
      return (tone(t, 415, 7) + tone(t, 520, 7)) * 0.5 * attack * release;
    }),

  // 腳踏車鈴鐺：高頻金屬「鈴——」。兩個只差 12 Hz 的頻率疊在一起會互相干涉，
  // 每秒抖 12 下——真實鈴鐺尾音那種微微顫動就是這樣來的
  bell: (sr) =>
    render(sr, 0.9, (t) => {
      const strike = (Math.random() * 2 - 1) * Math.exp(-t * 120); // 敲下去那一瞬間
      const ring =
        (Math.sin(2 * Math.PI * 2360 * t) +
          Math.sin(2 * Math.PI * 2372 * t) * 0.9 +
          Math.sin(2 * Math.PI * 3140 * t) * 0.45 +
          Math.sin(2 * Math.PI * 4720 * t) * 0.2) *
        Math.exp(-t * 3.5);
      return strike * 0.5 + ring * 0.55;
    }),

  // 被撞：三層疊起來才夠份量
  hit: (sr) => {
    let lp = 0;
    // 碎裂那層的截止頻率會隨時間往下掃，但 lpCoef 裡有 Math.exp，每個取樣點都算太貴
    // （整個音效會從 11 ms 變成 25 ms）。每 2 ms 更新一次就好，聽不出差別
    let a = 0;
    let nextCoefAt = -1;
    return render(sr, 1.1, (t) => {
      // 1. 低頻 boom（往下沉）：起點不要訂太低——手機和筆電喇叭放不出 100 Hz 以下，
      //    訂太低只會變成「什麼都沒聽到」，這是原本那版聽起來很薄的原因
      const boom = Math.sin(2 * Math.PI * (180 * t - 75 * t * t)) * Math.exp(-t * 4);
      // 2. 車體的「咚」：三個不成整數倍的泛音疊起來 = 金屬感；落在中頻，小喇叭聽得最清楚
      const body =
        (Math.sin(2 * Math.PI * 233 * t) +
          Math.sin(2 * Math.PI * 349 * t) * 0.7 +
          Math.sin(2 * Math.PI * 587 * t) * 0.5) *
        Math.exp(-t * 6);
      // 3. 碎裂：噪音過一個「越關越緊」的低通
      // 截止頻率從 4500 Hz 一路關到 400 Hz：一開始刺耳，馬上變悶，像東西散開
      if (t >= nextCoefAt) {
        a = lpCoef(sr, Math.max(4500 - t * 8000, 400));
        nextCoefAt = t + 0.002;
      }
      lp += (Math.random() * 2 - 1 - lp) * a;
      const crash = lp * Math.exp(-t * 5);
      // tanh 把尖峰壓平（軟削波）：波形變厚、平均音量大幅提高，
      // 在小喇叭上「震撼」靠的是這個，不是把音量開大
      return Math.tanh((boom * 1.4 + body * 0.7 + crash * 1.1) * 1.6);
    });
  },

  // 超時失敗：三個往下掉的音（「嗚——嗚——嗚」）
  timeout: (sr) =>
    render(sr, 0.85, (t) => {
      const step = 0.26;
      const i = Math.min(Math.floor(t / step), 2);
      const lt = t - i * step; // 每個音都從頭起算，接點才不會「喀」一聲
      const freq = [620, 500, 390][i];
      return tone(lt, freq, 3) * Math.min(lt / 0.01, 1) * Math.exp(-lt * 4.5);
    }),

  // 過關：往上爬的四個音（Do Mi So Do）
  clear: (sr) =>
    render(sr, 0.8, (t) => {
      const step = 0.11;
      const i = Math.min(Math.floor(t / step), 3);
      const lt = t - i * step;
      const freq = [523, 659, 784, 1047][i];
      return tone(lt, freq, 4) * Math.min(lt / 0.006, 1) * Math.exp(-lt * (i === 3 ? 4 : 9));
    }),

  // 開始遊戲：兩個往上的短音
  start: (sr) =>
    render(sr, 0.3, (t) => {
      const second = t >= 0.09;
      const lt = second ? t - 0.09 : t;
      return tone(lt, second ? 660 : 440, 3) * Math.min(lt / 0.005, 1) * Math.exp(-lt * (second ? 6 : 10));
    }),

  // 倒數最後幾秒：每秒一聲短「嗶」
  tick: (sr) =>
    render(sr, 0.09, (t) => Math.sin(2 * Math.PI * 1000 * t) * Math.min(t / 0.003, 1) * Math.exp(-t * 40)),

  // 腳步：只有悶悶的鞋底摩擦。低通係數越小越悶（0.09 很悶）；
  // 不加低頻的「咚」——那個會讓每一步都像巨人踩地，是原本很吵的主因
  footstep: (sr) => {
    const a = lpCoef(sr, 320); // 320 Hz：悶，但還在小喇叭放得出來的範圍
    let lp = 0;
    return render(sr, 0.09, (t) => {
      lp += (Math.random() * 2 - 1 - lp) * a;
      return lp * Math.exp(-t * 34);
    });
  },

  // 撞到路障：比腳步更低更悶的一聲（不致死，所以不要太嚇人）
  bump: (sr) => {
    const a = lpCoef(sr, 300);
    let lp = 0;
    return render(sr, 0.22, (t) => {
      lp += (Math.random() * 2 - 1 - lp) * a;
      return (Math.sin(2 * Math.PI * (95 - 60 * t) * t) * 0.8 + lp * 0.9) * Math.exp(-t * 14);
    });
  },

  // 無盡模式升階：兩個往上的「叮咚」
  stage: (sr) =>
    render(sr, 0.35, (t) => {
      const second = t >= 0.08;
      const lt = second ? t - 0.08 : t;
      return tone(lt, second ? 1047 : 784, 2) * Math.min(lt / 0.004, 1) * Math.exp(-lt * (second ? 7 : 12));
    }),

  // 環境車流底噪（循環播放）
  ambient: (sr) => renderAmbient(sr, TUNING.audio.ambientLoopSeconds),
};

// ── 播放器 ────────────────────────────────────────────────

class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private readonly buffers = new Map<string, AudioBuffer>(); // 可以直接播的
  private readonly pcm = new Map<SfxName, { data: Float32Array; rate: number }>(); // 算好的波形數字
  private queue: SfxName[] = []; // 還沒算的
  private prepared = false;
  private readonly lastAt = new Map<string, number>(); // 每個音效上次響的時間（給 minGap 用）
  private ambient: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private ambientWanted = false;
  private stepAcc = 0; // 腳步：累積走了幾公尺
  private lastTick = -1; // 倒數：上次嗶的是第幾秒
  private muted = false;

  constructor() {
    try {
      this.muted = localStorage.getItem(MUTE_KEY) === "1";
    } catch {
      // 無痕模式等讀不到就當沒靜音
    }
  }

  get isMuted(): boolean {
    return this.muted;
  }

  // 現在到底要不要出聲（總開關 ∧ 沒被玩家關掉）
  private get live(): boolean {
    return TUNING.audio.enabled && !this.muted;
  }

  // 開場就呼叫（不用等玩家互動）：排好「要算哪些波形」的清單。
  // 波形說穿了只是一串數字，算的時候完全不需要 AudioContext，
  // 所以可以趁標題畫面在等 3D 素材時先算——瀏覽器那條「沒互動過不准建 AudioContext」的規定管不到這裡
  prepare(): void {
    if (this.prepared || !TUNING.audio.enabled) return;
    this.prepared = true;
    const all = (Object.keys(SYNTH) as SfxName[]).filter((n) => TUNING.audio.sfx[n].on);
    // 最早可能用到的先算（沒列到的自動排後面，之後加新音效忘了寫也不會漏）
    const first: SfxName[] = ["start", "footstep", "horn", "bell", "ambient"];
    this.queue = [...first.filter((n) => all.includes(n)), ...all.filter((n) => !first.includes(n))];
  }

  // main.ts 每幀呼叫一次：算「一個」波形。
  // 全部塞在同一幀要 150 ms 以上（手機更久），畫面會明顯卡一下；一幀算一個就攤平了。
  // 算完之後這個函式永遠什麼都不做
  prepareStep(): void {
    const name = this.queue.shift();
    if (!name) return;
    const rate = rateFor(name);
    this.pcm.set(name, { data: SYNTH[name](rate), rate });
    if (this.ctx) this.toBuffer(name); // 玩家點很快、已經 unlock 過了：直接轉成可播的
  }

  // 進入遊戲前呼叫：把剩下的波形一次算完。
  // 開場多卡一下沒關係，遊戲中掉幀才要命——所以寧可全部塞在橫幅那一刻
  finishPrepare(): void {
    while (this.queue.length) this.prepareStep();
  }

  // 波形數字 → 瀏覽器的 AudioBuffer（只是記憶體複製，很快）
  private toBuffer(name: SfxName): void {
    const pcm = this.pcm.get(name);
    if (!pcm || !this.ctx) return;
    const buffer = this.ctx.createBuffer(1, pcm.data.length, pcm.rate);
    buffer.getChannelData(0).set(pcm.data);
    this.buffers.set(name, buffer);
  }

  // 玩家第一次碰畫面／按鍵時呼叫：這時才建 AudioContext（瀏覽器規定沒互動過不准出聲）。
  // 波形已經在 prepareStep 算好了，這裡只做記憶體複製，不會卡
  unlock(): void {
    if (!TUNING.audio.enabled) return; // 總開關關著：連 AudioContext 都不建
    if (this.ctx) {
      void this.ctx.resume(); // 被瀏覽器暫停過就叫醒
      return;
    }
    const Ctor: typeof AudioContext | undefined =
      window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return; // 太舊的瀏覽器：整套靜音，遊戲照跑
    const ctx = new Ctor();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = TUNING.audio.masterVolume;
    this.master.connect(ctx.destination);

    for (const name of this.pcm.keys()) this.toBuffer(name); // 還沒算完的之後由 prepareStep 自己補上
    this.loadFiles();

    // 切到別的分頁就把音訊執行緒停掉（省電，也不會在背景一直響）
    document.addEventListener("visibilitychange", () => {
      if (!this.ctx) return;
      if (document.hidden) void this.ctx.suspend();
      else void this.ctx.resume();
    });
    this.applyAmbient();
  }

  // 音檔覆蓋：只抓有在 tuning 填檔名的，抓失敗就安靜地繼續用合成音
  private loadFiles(): void {
    const ctx = this.ctx;
    if (!ctx) return;
    for (const name of Object.keys(SYNTH) as SfxName[]) {
      const cfg = TUNING.audio.sfx[name];
      if (!cfg.on || !cfg.file) continue;
      fetch(`${import.meta.env.BASE_URL}assets/sfx/${cfg.file}`)
        .then((r) => (r.ok ? r.arrayBuffer() : Promise.reject(new Error("404"))))
        .then((ab) => ctx.decodeAudioData(ab))
        .then((buffer) => {
          this.buffers.set(name, buffer);
          if (name === "ambient" && this.ambient) {
            this.stopAmbient(); // 底噪已經在放合成音了：換成音檔重新開始
            this.applyAmbient();
          }
        })
        .catch(() => {});
    }
  }

  // 播一次。還沒 unlock、被關掉、或離上次太近（minGap）都直接不做事
  play(name: SfxName): void {
    const cfg = TUNING.audio.sfx[name];
    const ctx = this.ctx;
    if (!ctx || !this.master || !this.live || !cfg.on) return;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const now = ctx.currentTime;
    if (cfg.minGap > 0 && now - (this.lastAt.get(name) ?? -Infinity) < cfg.minGap) return;
    this.lastAt.set(name, now);
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    // 每次播稍微變個音高，同一個聲音連續響才不會像機器人（腳步聲最需要）
    if (cfg.jitter > 0) src.playbackRate.value = 1 + (Math.random() * 2 - 1) * cfg.jitter;
    const gain = ctx.createGain();
    gain.gain.value = cfg.volume;
    src.connect(gain).connect(this.master);
    src.start();
  }

  // 環境底噪開關（main.ts 每幀呼叫，沒變就什麼都不做）。
  // immediate = 幾乎立刻收掉（被撞的瞬間用）：背景一安靜，撞擊聲聽起來就重很多
  setAmbient(on: boolean, immediate = false): void {
    if (on === this.ambientWanted) return;
    this.ambientWanted = on;
    if (on) this.applyAmbient();
    else this.stopAmbient(immediate ? TUNING.audio.ambientDuck : TUNING.audio.ambientFade);
  }

  private applyAmbient(): void {
    const cfg = TUNING.audio.sfx.ambient;
    const ctx = this.ctx;
    if (this.ambient || !this.ambientWanted || !this.live || !cfg.on || !ctx || !this.master) return;
    const buffer = this.buffers.get("ambient");
    if (!buffer) return;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const gain = ctx.createGain();
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0, t); // 淡入，不要突然冒出來
    gain.gain.linearRampToValueAtTime(cfg.volume, t + TUNING.audio.ambientFade);
    src.connect(gain).connect(this.master);
    src.start();
    this.ambient = { src, gain };
  }

  private stopAmbient(fade: number = TUNING.audio.ambientFade): void {
    const a = this.ambient;
    this.ambient = null;
    if (!a || !this.ctx) return;
    const t = this.ctx.currentTime;
    a.gain.gain.cancelScheduledValues(t);
    a.gain.gain.setValueAtTime(a.gain.gain.value, t);
    a.gain.gain.linearRampToValueAtTime(0, t + fade);
    a.src.stop(t + fade); // 淡完自己停掉，節點會被瀏覽器回收
  }

  // 腳步：每幀傳入「這一幀移動了幾公尺」，累積到 stepDistance 就踏一步
  step(meters: number): void {
    if (!this.live || !TUNING.audio.sfx.footstep.on) return;
    this.stepAcc += Math.abs(meters);
    if (this.stepAcc < TUNING.audio.stepDistance) return;
    this.stepAcc = 0;
    this.play("footstep");
  }

  // 倒數提醒：剩 tickBelow 秒開始，每過一秒嗶一聲
  countdown(timeLeft: number): void {
    if (!Number.isFinite(timeLeft) || timeLeft <= 0 || timeLeft > TUNING.audio.tickBelow) {
      this.lastTick = -1;
      return;
    }
    const sec = Math.ceil(timeLeft);
    if (sec === this.lastTick) return;
    this.lastTick = sec;
    this.play("tick");
  }

  // 每關開始時歸零（不然重來時會馬上補一個腳步或一聲嗶）
  resetLevel(): void {
    this.stepAcc = 0;
    this.lastTick = -1;
  }

  // 玩家按 M：全開/全關，選擇記在瀏覽器。回傳「現在是不是靜音」
  toggleMute(): boolean {
    this.muted = !this.muted;
    try {
      localStorage.setItem(MUTE_KEY, this.muted ? "1" : "0");
    } catch {
      // 存不了就只有這次有效
    }
    if (this.muted) this.stopAmbient(TUNING.audio.ambientDuck);
    else {
      this.unlock(); // 一開始就靜音的話，這時候才第一次建 AudioContext
      this.applyAmbient();
    }
    return this.muted;
  }
}

export const sfx = new Sfx();
