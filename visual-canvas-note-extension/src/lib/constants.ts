export interface PaletteColor {
  id: string;
  name: string;
  hex: string;
}

export const PALETTE: PaletteColor[] = [
  { id: "slate", name: "خاکستری", hex: "#8b95a7" },
  { id: "amber", name: "کهربایی", hex: "#f5a623" },
  { id: "rose", name: "رزگلد", hex: "#fb7185" },
  { id: "sky", name: "آسمانی", hex: "#38bdf8" },
  { id: "emerald", name: "زمردی", hex: "#34d399" },
  { id: "violet", name: "بنفش", hex: "#a78bfa" },
  { id: "orange", name: "نارنجی", hex: "#fb923c" },
  { id: "cyan", name: "فیروزه‌ای", hex: "#2dd4ee" },
];

export const colorHex = (id: string): string =>
  PALETTE.find((c) => c.id === id)?.hex ?? PALETTE[0].hex;

export const STORE_KEY = "boom-yaddasht-state-v1";
export const PENDING_KEY = "boom-yaddasht-pending-v1";
export const SEED_FLAG = "boom-yaddasht-seeded-v1";

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const GRID_SIZE = 26;

export const faNum = (n: number): string => n.toLocaleString("fa-IR");

export const uid = (): string =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
