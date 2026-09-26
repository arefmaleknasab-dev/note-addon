import type { Note, PendingNote, ViewState } from "../types";
import { PALETTE, uid } from "./constants";

export const DEFAULT_NOTE_W = 288;

export function createNote(partial: Partial<Note> = {}): Note {
  return {
    id: uid(),
    title: "",
    text: "",
    x: 0,
    y: 0,
    width: DEFAULT_NOTE_W,
    color: "slate",
    createdAt: Date.now(),
    ...partial,
  };
}

export function noteFromPending(p: PendingNote, index: number): Note {
  const accent = PALETTE[(index % (PALETTE.length - 1)) + 1]; // skip slate, colorful web notes
  return createNote({
    title: "",
    text: p.text,
    color: accent.id,
    createdAt: p.createdAt || Date.now(),
  });
}

export function truncate(s: string, n: number): string {
  const t = s.trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
}

export function formatNote(n: Note): string {
  const title = n.title.trim();
  const text = n.text.trim();
  if (title && text) return `${title}\n${text}`;
  return title || text;
}

export function formatMany(notes: Note[]): string {
  return notes.map(formatNote).join("\n\n──────────\n\n");
}

/** Screen-space centre of the viewport converted to world coordinates. */
export function viewCenter(view: ViewState): { x: number; y: number } {
  return {
    x: (window.innerWidth / 2 - view.x) / view.zoom,
    y: (window.innerHeight / 2 - view.y) / view.zoom,
  };
}

const rtf = new Intl.RelativeTimeFormat("fa-IR", { numeric: "auto" });

export function relativeTime(ts: number): string {
  const diff = ts - Date.now();
  const abs = Math.abs(diff);
  const min = Math.round(abs / 60000);
  if (min < 1) return "همین حالا";
  if (min < 60) return rtf.format(-min, "minute");
  const h = Math.round(min / 60);
  if (h < 24) return rtf.format(-h, "hour");
  const d = Math.round(h / 24);
  if (d < 30) return rtf.format(-d, "day");
  return new Date(ts).toLocaleDateString("fa-IR");
}

export function seedNotes(): Note[] {
  const now = Date.now();
  return [
    createNote({
      title: "به بوم یادداشت خوش آمدی",
      text: "این بوم نامحدود توست؛ یادداشت‌ها را آزادانه این‌طرف و آن‌طرف بکش، با اسکرول زوم کن و با نگه‌داشتن راست‌کلیک روی فضای خالی، بوم را جابه‌جا کن.",
      x: -460,
      y: -190,
      color: "amber",
      createdAt: now - 60000 * 9,
    }),
    createNote({
      title: "افزودن از صفحات وب",
      text: "وقتی افزونه را نصب کنی، در هر صفحه‌ای متنی را انتخاب کن، راست‌کلیک بزن و «افزودن به یادداشت‌ها» را انتخاب کن؛ متن به‌صورت خودکار به‌عنوان یک باکس جدید همین‌جا ظاهر می‌شود.",
      x: -90,
      y: -60,
      color: "sky",
      createdAt: now - 60000 * 5,
    }),
    createNote({
      title: "میانبرهای سریع",
      text: "اسکرول: بزرگ‌نمایی و کوچک‌نمایی\nراست‌کلیک + درگ: جابه‌جایی بوم\nچپ‌کلیک + درگ روی فضای خالی: انتخاب گروهی\nدابل‌کلیک روی فضای خالی: یادداشت جدید\nDelete: حذف یادداشت‌های انتخاب‌شده",
      x: 300,
      y: -170,
      width: 320,
      color: "emerald",
      createdAt: now - 60000 * 2,
    }),
  ];
}
