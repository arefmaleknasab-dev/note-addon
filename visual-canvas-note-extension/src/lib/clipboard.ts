import type { Note } from "../types";
import { formatMany, formatNote } from "./notes";

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * نوشتن هم‌زمان در کلیپ‌بورد با execCommand.
 * مزیتش این است که تغییر کلیپ‌بورد در یک لحظه‌ی مشخص اتفاق می‌افتد و
 * تاریخچه‌ی کلیپ‌بورد ویندوز (Win+V) آن را مطمئن‌تر ثبت می‌کند.
 */
function legacyCopy(text: string): boolean {
  let ta: HTMLTextAreaElement | null = null;
  try {
    ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.dir = "ltr";
    ta.style.cssText =
      "position:fixed;top:-2000px;left:-2000px;width:20px;height:20px;opacity:0;";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    ta.setSelectionRange(0, ta.value.length);
    const ok = document.execCommand("copy");
    ta.remove();
    return ok;
  } catch {
    ta?.remove();
    return false;
  }
}

/** تلاش برای فوکوس گرفتن سند تا نوشتن در کلیپ‌بورد رد نشود */
function ensureFocus() {
  try {
    if (!document.hasFocus()) window.focus();
  } catch {
    /* ignore */
  }
}

export async function writeClipboard(text: string): Promise<void> {
  ensureFocus();
  if (legacyCopy(text)) return;
  await navigator.clipboard.writeText(text);
}

export async function copySingle(note: Note): Promise<void> {
  await writeClipboard(formatNote(note));
}

export async function copyCombined(notes: Note[]): Promise<void> {
  await writeClipboard(formatMany(notes));
}

/**
 * کپی جداگانه: هر یادداشت به‌عنوان یک ورودی مستقل در حافظه‌ی کلیپ‌بورد
 * (مثلاً Win+V در ویندوز) قرار می‌گیرد. بین نوشتن‌ها مکث می‌کنیم چون
 * سیستم‌عامل تغییرات خیلی سریع و متوالی را یکجا/ناقص ثبت می‌کند.
 */
export async function copySeparately(
  notes: Note[],
  onProgress?: (done: number, total: number) => void
): Promise<void> {
  const total = notes.length;
  let firstError: unknown = null;

  for (let i = 0; i < total; i++) {
    const text = formatNote(notes[i]);
    try {
      await writeClipboard(text);
    } catch (e) {
      // یک بار با مکث کوتاه دوباره تلاش کن (مثلاً وقتی فوکوس از دست رفته)
      firstError = firstError ?? e;
      await wait(300);
      await writeClipboard(text); // اگر این هم شکست بخورد، خطا بیرون پرتاب می‌شود
    }
    onProgress?.(i + 1, total);
    if (i < total - 1) await wait(430);
  }
}
