import type { PendingNote, PersistedState } from "../types";
import { PENDING_KEY, SEED_FLAG, STORE_KEY } from "./constants";

/* ------------------------------------------------------------------ */
/*  Environment detection: real extension vs. plain web preview        */
/* ------------------------------------------------------------------ */
const ext = (globalThis as any).chrome;

export const isExtension: boolean = Boolean(
  ext && ext.runtime && ext.runtime.id && ext.storage && ext.storage.local
);

/* ------------------------------------------------------------------ */
/*  Low-level KV helpers                                               */
/* ------------------------------------------------------------------ */
async function kvGet<T>(key: string): Promise<T | undefined> {
  if (isExtension) {
    const res = await ext.storage.local.get(key);
    return res?.[key] as T | undefined;
  }
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : undefined;
  } catch {
    return undefined;
  }
}

async function kvSet(key: string, value: unknown): Promise<void> {
  if (isExtension) {
    await ext.storage.local.set({ [key]: value });
    return;
  }
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage full / unavailable – ignore */
  }
}

/* ------------------------------------------------------------------ */
/*  Public API                                                         */
/* ------------------------------------------------------------------ */
export async function loadState(): Promise<PersistedState | undefined> {
  return kvGet<PersistedState>(STORE_KEY);
}

export async function saveState(state: PersistedState): Promise<void> {
  return kvSet(STORE_KEY, state);
}

/** Notes coming from the right-click «add to notes» context menu. */
export async function getPendingNotes(): Promise<PendingNote[]> {
  return (await kvGet<PendingNote[]>(PENDING_KEY)) ?? [];
}

export async function clearPendingNotes(): Promise<void> {
  return kvSet(PENDING_KEY, []);
}

export async function getSeedFlag(): Promise<boolean> {
  return Boolean(await kvGet<boolean>(SEED_FLAG));
}

export async function setSeedFlag(): Promise<void> {
  return kvSet(SEED_FLAG, true);
}

/** Live subscription while the tab is open (reacts to background worker). */
export function subscribePending(callback: () => void): () => void {
  if (isExtension && ext.storage?.onChanged) {
    const listener = (changes: any, area: string) => {
      if (area === "local" && changes?.[PENDING_KEY]) callback();
    };
    ext.storage.onChanged.addListener(listener);
    return () => ext.storage.onChanged.removeListener(listener);
  }
  // web preview fallback: nothing pushes pending notes, but stay consistent
  const handler = (e: StorageEvent) => {
    if (e.key === PENDING_KEY) callback();
  };
  window.addEventListener("storage", handler);
  return () => window.removeEventListener("storage", handler);
}
