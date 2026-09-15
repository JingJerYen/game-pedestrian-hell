// 無盡模式結算的分享：組一句「我走了 xxx m」＋遊戲網址，手機用系統分享面板、電腦複製到剪貼簿。
// 網址帶 ?challenge=<公尺數>，朋友點開時標題畫面會顯示「朋友走了 xxx m，你能走多遠？」。
// 文字模板在這裡改（不進 tuning.ts：純文案，跟手感無關）。

const CHALLENGE_PARAM = "challenge";

// 分享文字：causeTitle 是死亡字幕的標題（「你被汽車撞了 🚗」），拿掉「你」變成第一人稱
export function buildShareText(gameName: string, distance: number, causeTitle: string): string {
  const cause = causeTitle.replace(/^你/, "");
  return `我在《${gameName}》走了 ${Math.floor(distance)} m，${cause}。你能走多遠？`;
}

// 遊戲網址（不含這次的參數）＋挑戰公尺數
export function shareUrl(distance: number): string {
  const url = new URL(location.href);
  url.search = "";
  url.hash = "";
  url.searchParams.set(CHALLENGE_PARAM, String(Math.floor(distance)));
  return url.toString();
}

// 這次是從朋友的分享連結點進來的話，回傳他走的公尺數；不是就 null
export function readChallenge(): number | null {
  const raw = new URLSearchParams(location.search).get(CHALLENGE_PARAM);
  const n = Number(raw);
  return raw !== null && Number.isFinite(n) && n > 0 ? Math.floor(n) : null;
}

// 分享：有系統分享面板（手機）就用它，沒有就複製「文字＋網址」到剪貼簿。
// 回傳結果讓按鈕換字：shared = 分享面板開了、copied = 複製好了、failed = 兩種都不行（很舊的瀏覽器或非 https）
export async function shareResult(text: string, url: string): Promise<"shared" | "copied" | "failed"> {
  const nav = navigator as Navigator & { share?: (data: { text: string; url: string }) => Promise<void> };
  if (nav.share) {
    try {
      await nav.share({ text, url });
      return "shared";
    } catch {
      /* 使用者取消或不支援 → 退回複製 */
    }
  }
  try {
    await navigator.clipboard.writeText(`${text}\n${url}`);
    return "copied";
  } catch {
    return "failed";
  }
}
