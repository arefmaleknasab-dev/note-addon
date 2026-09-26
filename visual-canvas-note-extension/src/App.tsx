import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Clipboard,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  CopyPlus,
  ExternalLink,
  FilePlus,
  Hand,
  Heading1,
  Heading2,
  Heading3,
  Heading4,
  Heading5,
  Heading6,
  Link,
  List,
  ListChecks,
  ListOrdered,
  LoaderCircle,
  Maximize,
  Minus,
  Moon,
  MousePointer2,
  Pilcrow,
  Plus,
  Quote,
  RotateCcw,
  Scissors,
  Sun,
  TextCursorInput,
  Trash2,
} from "lucide-react";
import NoteCard from "./components/NoteCard";
import ContextMenu, { type MenuRow } from "./components/ContextMenu";
import Toolbar from "./components/Toolbar";
import EmptyState from "./components/EmptyState";
import { ToastStack, useToasts } from "./components/Toasts";
import type { ConnectionSide, Note, NoteConnection, Theme, ViewState } from "./types";
import {
  clearPendingNotes,
  getPendingNotes,
  getSeedFlag,
  isExtension,
  loadState,
  saveState,
  setSeedFlag,
  subscribePending,
} from "./lib/storage";
import { copyCombined, copySeparately, copySingle } from "./lib/clipboard";
import {
  createNote,
  DEFAULT_NOTE_H,
  DEFAULT_NOTE_W,
  noteFromPending,
  seedNotes,
  viewCenter,
} from "./lib/notes";
import { faNum, GRID_SIZE, MAX_ZOOM, MIN_ZOOM, uid } from "./lib/constants";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));

type Gesture =
  | { type: "pan"; sx: number; sy: number; ox: number; oy: number; moved: boolean }
  | { type: "select"; sx: number; sy: number; additive: boolean; base: string[]; moved: boolean }
  | {
      type: "note";
      sx: number;
      sy: number;
      moved: boolean;
      ids: string[];
      origins: Record<string, { x: number; y: number }>;
    }
  | null;

type Point = { x: number; y: number };
type Endpoint = { noteId: string; side: ConnectionSide };
type DraftConnection = { from: Endpoint; to: Point; target?: Endpoint | null };
type ConnectionPrompt = { x: number; y: number; from: Endpoint; to: Point };

const sideVector = (side: ConnectionSide): Point => {
  switch (side) {
    case "top":
      return { x: 0, y: -1 };
    case "right":
      return { x: 1, y: 0 };
    case "bottom":
      return { x: 0, y: 1 };
    case "left":
      return { x: -1, y: 0 };
  }
};

const oppositeSide = (side: ConnectionSide): ConnectionSide => {
  switch (side) {
    case "top":
      return "bottom";
    case "bottom":
      return "top";
    case "left":
      return "right";
    case "right":
      return "left";
  }
};

const noteSize = (n: Note) => ({ width: n.width ?? DEFAULT_NOTE_W, height: n.height ?? DEFAULT_NOTE_H });

const sidePoint = (n: Note, side: ConnectionSide): Point => {
  const { width, height } = noteSize(n);
  switch (side) {
    case "top":
      return { x: n.x + width / 2, y: n.y };
    case "right":
      return { x: n.x + width, y: n.y + height / 2 };
    case "bottom":
      return { x: n.x + width / 2, y: n.y + height };
    case "left":
      return { x: n.x, y: n.y + height / 2 };
  }
};

const connectionPath = (from: Point, fromSide: ConnectionSide, to: Point, toSide: ConnectionSide) => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const curve = Math.max(70, Math.min(220, Math.hypot(dx, dy) * 0.42));
  const fv = sideVector(fromSide);
  const tv = sideVector(toSide);
  const c1 = { x: from.x + fv.x * curve, y: from.y + fv.y * curve };
  const c2 = { x: to.x + tv.x * curve, y: to.y + tv.y * curve };
  return `M ${from.x} ${from.y} C ${c1.x} ${c1.y}, ${c2.x} ${c2.y}, ${to.x} ${to.y}`;
};

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [connections, setConnections] = useState<NoteConnection[]>([]);
  const [draftConnection, setDraftConnection] = useState<DraftConnection | null>(null);
  const [connectionPrompt, setConnectionPrompt] = useState<ConnectionPrompt | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<Theme>("dark"); // dark by default
  const [loaded, setLoaded] = useState(false);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [recentId, setRecentId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; rows: MenuRow[] } | null>(null);
  const [zoomLabel, setZoomLabel] = useState(1);
  const [copyJob, setCopyJob] = useState<{ done: number; total: number } | null>(null);
  const copyingRef = useRef(false);
  const { toasts, push } = useToasts();

  const viewRef = useRef<ViewState>({ x: 0, y: 0, zoom: 1 });
  const notesRef = useRef<Note[]>([]);
  const connectionsRef = useRef<NoteConnection[]>([]);
  const themeRef = useRef<Theme>("dark");
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const selRectRef = useRef<HTMLDivElement>(null);
  const noteEls = useRef(new Map<string, HTMLDivElement>());
  const gesture = useRef<Gesture>(null);
  const suppressCtx = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);

  notesRef.current = notes;
  connectionsRef.current = connections;
  themeRef.current = theme;

  /* ------------------------------ view ------------------------------ */
  const applyView = useCallback(() => {
    const v = viewRef.current;
    if (worldRef.current)
      worldRef.current.style.transform = `translate(${v.x}px, ${v.y}px) scale(${v.zoom})`;
    if (canvasRef.current) {
      canvasRef.current.style.backgroundSize = `${GRID_SIZE * v.zoom}px ${GRID_SIZE * v.zoom}px`;
      canvasRef.current.style.backgroundPosition = `${v.x}px ${v.y}px`;
    }
    setZoomLabel(v.zoom);
  }, []);

  const persistSoon = useCallback(() => {
    window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(() => {
      saveState({
        notes: notesRef.current,
        connections: connectionsRef.current,
        view: viewRef.current,
        theme: themeRef.current,
      }).catch(() => {});
    }, 550);
  }, []);

  useEffect(() => {
    if (loaded) persistSoon();
  }, [notes, connections, theme, loaded, persistSoon]);

  const zoomAt = useCallback(
    (cx: number, cy: number, factor: number) => {
      const v = viewRef.current;
      const zoom = clamp(v.zoom * factor, MIN_ZOOM, MAX_ZOOM);
      if (zoom === v.zoom) return;
      const k = zoom / v.zoom;
      v.x = cx - (cx - v.x) * k;
      v.y = cy - (cy - v.y) * k;
      v.zoom = zoom;
      applyView();
      persistSoon();
    },
    [applyView, persistSoon]
  );

  const fitView = useCallback(() => {
    const v = viewRef.current;
    const list = notesRef.current;
    if (!list.length) {
      Object.assign(v, { x: 0, y: 0, zoom: 1 });
      applyView();
      persistSoon();
      return;
    }
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const n of list) {
      const h = n.height ?? DEFAULT_NOTE_H;
      const w = n.width ?? DEFAULT_NOTE_W;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + w);
      maxY = Math.max(maxY, n.y + h);
    }
    const pad = 100;
    const bw = maxX - minX + pad * 2;
    const bh = maxY - minY + pad * 2;
    const zoom = clamp(Math.min(window.innerWidth / bw, window.innerHeight / bh), MIN_ZOOM, 1.3);
    v.zoom = zoom;
    v.x = window.innerWidth / 2 - (minX + (maxX - minX) / 2) * zoom;
    v.y = window.innerHeight / 2 - (minY + (maxY - minY) / 2) * zoom;
    applyView();
    persistSoon();
  }, [applyView, persistSoon]);

  /* --------------------------- persistence -------------------------- */
  const drainPending = useCallback(
    async (initial: boolean) => {
      try {
        const items = await getPendingNotes();
        if (!items.length) return;
        await clearPendingNotes();
        const c = viewCenter(viewRef.current);
        const base = notesRef.current.length;
        const fresh = items.map((p, i) => ({
          ...noteFromPending(p, base + i),
          x: c.x - DEFAULT_NOTE_W / 2 + ((i % 3) - 1) * 34,
          y: c.y - 130 + ((i % 3) - 1) * 30,
        }));
        setNotes((prev) => [...prev, ...fresh]);
        setRecentId(fresh[0].id);
        window.setTimeout(() => setRecentId(null), 2600);
        if (!initial)
          push("success", `${faNum(fresh.length)} یادداشت جدید از صفحه‌ی وب اضافه شد`);
      } catch {
        /* ignore */
      }
    },
    [push]
  );

  useEffect(() => {
    let alive = true;
    (async () => {
      const s = await loadState().catch(() => undefined);
      if (!alive) return;
      if (s?.notes) {
        setNotes(s.notes.map((n) => ({ ...n, width: n.width ?? DEFAULT_NOTE_W, height: n.height ?? DEFAULT_NOTE_H })));
        setConnections(s.connections ?? []);
        setTheme(s.theme ?? "dark");
        if (s.view) viewRef.current = s.view;
      } else if (!(await getSeedFlag())) {
        await setSeedFlag();
        const c = viewCenter(viewRef.current);
        setNotes(seedNotes().map((n) => ({ ...n, x: n.x + c.x, y: n.y + c.y })));
      }
      applyView();
      setLoaded(true);
      drainPending(true);
    })();
    const unsub = subscribePending(() => drainPending(false));
    const onBlur = () => persistSoon();
    window.addEventListener("blur", onBlur);
    return () => {
      alive = false;
      unsub();
      window.removeEventListener("blur", onBlur);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ------------------------------ theme ----------------------------- */
  useEffect(() => {
    document.documentElement.classList.toggle("light", theme === "light");
  }, [theme]);

  /* --------------------------- note actions ------------------------- */
  const updateNote = useCallback((id: string, patch: Partial<Note>) => {
    setNotes((prev) => prev.map((n) => (n.id === id ? { ...n, ...patch } : n)));
  }, []);

  const addNoteAt = useCallback((wx?: number, wy?: number) => {
    const c = viewCenter(viewRef.current);
    const j = () => (Math.random() - 0.5) * 36;
    const n = createNote({
      x: (wx ?? c.x - DEFAULT_NOTE_W / 2) + j(),
      y: (wy ?? c.y - 100) + j(),
    });
    setNotes((prev) => [...prev, n]);
    setAutoFocusId(n.id);
    window.setTimeout(() => setAutoFocusId(null), 1600);
  }, []);

  const deleteIds = useCallback(
    (ids: string[]) => {
      if (!ids.length) return;
      setNotes((prev) => prev.filter((n) => !ids.includes(n.id)));
      setConnections((prev) =>
        prev.filter((c) => !ids.includes(c.from.noteId) && !ids.includes(c.to.noteId))
      );
      setSelected((prev) => {
        const s = new Set(prev);
        ids.forEach((id) => s.delete(id));
        return s;
      });
      push("info", ids.length > 1 ? `${faNum(ids.length)} یادداشت حذف شد` : "یادداشت حذف شد");
    },
    [push]
  );

  const duplicateIds = useCallback(
    (ids: string[]) => {
      setNotes((prev) => [
        ...prev,
        ...prev
          .filter((n) => ids.includes(n.id))
          .map((n) => ({
            ...n,
            id: uid(),
            x: n.x + 30,
            y: n.y + 30,
            createdAt: Date.now(),
          })),
      ]);
      push("success", ids.length > 1 ? "یادداشت‌ها تکثیر شدند" : "یادداشت تکثیر شد");
    },
    [push]
  );

  const copyNoteById = useCallback(
    async (id: string) => {
      const n = notesRef.current.find((x) => x.id === id);
      if (!n) return;
      try {
        await copySingle(n);
        push("success", "یادداشت در کلیپ‌بورد کپی شد");
      } catch {
        push("error", "کپی ناموفق بود — دسترسی کلیپ‌بورد داده نشد");
      }
    },
    [push]
  );

  const addConnection = useCallback((from: Endpoint, to: Endpoint) => {
    if (from.noteId === to.noteId) return;
    setConnections((prev) => {
      const exists = prev.some(
        (c) =>
          c.from.noteId === from.noteId &&
          c.from.side === from.side &&
          c.to.noteId === to.noteId &&
          c.to.side === to.side
      );
      if (exists) return prev;
      return [...prev, { id: uid(), from, to }];
    });
  }, []);

  const selectedNotes = useCallback(
    () => notesRef.current.filter((n) => selected.has(n.id)),
    [selected]
  );

  const copySeparate = useCallback(async () => {
    if (copyingRef.current) return;
    const list = selectedNotes();
    if (!list.length) return;
    copyingRef.current = true;
    setCopyJob({ done: 0, total: list.length });
    try {
      await copySeparately(list, (done, total) => setCopyJob({ done, total }));
      push(
        "success",
        list.length > 1
          ? `${faNum(list.length)} یادداشت جداگانه کپی شد — در تاریخچه‌ی کلیپ‌بورد (Win+V) دم‌به‌دم هستند`
          : "یادداشت کپی شد"
      );
    } catch {
      push("error", "کپی جداگانه کامل نشد — صفحه در فوکوس باشد و دوباره تلاش کن");
    } finally {
      copyingRef.current = false;
      setCopyJob(null);
    }
  }, [selectedNotes, push]);

  const copyAll = useCallback(async () => {
    const list = selectedNotes();
    if (!list.length) return;
    try {
      await copyCombined(list);
      push("success", "یادداشت‌ها یکجا در کلیپ‌بورد کپی شد");
    } catch {
      push("error", "کپی ناموفق بود");
    }
  }, [selectedNotes, push]);

  const arrangeGrid = useCallback(() => {
    const ids = selected.size ? selected : new Set(notesRef.current.map((n) => n.id));
    const items = notesRef.current
      .filter((n) => ids.has(n.id))
      .sort((a, b) => (a.y === b.y ? a.x - b.x : a.y - b.y));
    if (items.length < 2) return;
    const cols = Math.ceil(Math.sqrt(items.length));
    const cellW = Math.max(...items.map((n) => n.width)) + 42;
    const cellH = Math.max(...items.map((n) => n.height ?? DEFAULT_NOTE_H)) + 42;
    const x0 = Math.min(...items.map((n) => n.x));
    const y0 = Math.min(...items.map((n) => n.y));
    const pos = new Map<string, { x: number; y: number }>();
    items.forEach((n, i) =>
      pos.set(n.id, { x: x0 + (i % cols) * cellW, y: y0 + Math.floor(i / cols) * cellH })
    );
    setNotes((prev) => prev.map((n) => (pos.has(n.id) ? { ...n, ...pos.get(n.id)! } : n)));
    push("success", "یادداشت‌ها به‌صورت شبکه‌ای مرتب شد");
  }, [selected, push]);

  /* --------------------------- gestures ----------------------------- */
  const registerNoteRef = useCallback((id: string, el: HTMLDivElement | null) => {
    if (el) noteEls.current.set(id, el);
    else noteEls.current.delete(id);
  }, []);

  const worldPointFromScreen = useCallback((clientX: number, clientY: number): Point => {
    const v = viewRef.current;
    return { x: (clientX - v.x) / v.zoom, y: (clientY - v.y) / v.zoom };
  }, []);

  const endpointPoint = useCallback((endpoint: Endpoint): Point | null => {
    const note = notesRef.current.find((n) => n.id === endpoint.noteId);
    return note ? sidePoint(note, endpoint.side) : null;
  }, []);

  const nearestConnector = useCallback(
    (clientX: number, clientY: number, excludeId: string): Endpoint | null => {
      const v = viewRef.current;
      let best: { endpoint: Endpoint; d: number } | null = null;
      for (const note of notesRef.current) {
        if (note.id === excludeId) continue;
        for (const side of ["top", "right", "bottom", "left"] as ConnectionSide[]) {
          const p = sidePoint(note, side);
          const sx = p.x * v.zoom + v.x;
          const sy = p.y * v.zoom + v.y;
          const d = Math.hypot(sx - clientX, sy - clientY);
          if (d < 34 && (!best || d < best.d)) best = { endpoint: { noteId: note.id, side }, d };
        }
      }
      return best?.endpoint ?? null;
    },
    []
  );

  const onConnectorDragStart = useCallback(
    (e: React.PointerEvent, id: string, side: ConnectionSide) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      setMenu(null);
      setConnectionPrompt(null);
      const from = { noteId: id, side };
      const start = sidePoint(notesRef.current.find((n) => n.id === id)!, side);
      const move = (ev: PointerEvent) => {
        const target = nearestConnector(ev.clientX, ev.clientY, id);
        const targetPoint = target ? endpointPoint(target) : null;
        setDraftConnection({ from, target, to: targetPoint ?? worldPointFromScreen(ev.clientX, ev.clientY) });
      };
      const up = (ev: PointerEvent) => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        const target = nearestConnector(ev.clientX, ev.clientY, id);
        const targetPoint = target ? endpointPoint(target) : null;
        setDraftConnection(null);
        if (target && targetPoint) {
          addConnection(from, target);
          push("success", "اتصال یادداشت‌ها ساخته شد");
          return;
        }
        const to = worldPointFromScreen(ev.clientX, ev.clientY);
        setConnectionPrompt({
          x: clamp(ev.clientX, 12, window.innerWidth - 190),
          y: clamp(ev.clientY, 12, window.innerHeight - 64),
          from,
          to,
        });
      };
      setDraftConnection({ from, to: start, target: null });
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    },
    [addConnection, endpointPoint, nearestConnector, push, worldPointFromScreen]
  );

  const addConnectedNoteFromPrompt = useCallback(() => {
    const prompt = connectionPrompt;
    if (!prompt) return;
    const newSide = oppositeSide(prompt.from.side);
    const id = uid();
    const w = DEFAULT_NOTE_W;
    const h = DEFAULT_NOTE_H;
    let x = prompt.to.x - w / 2;
    let y = prompt.to.y - h / 2;
    if (newSide === "top") {
      x = prompt.to.x - w / 2;
      y = prompt.to.y;
    } else if (newSide === "right") {
      x = prompt.to.x - w;
      y = prompt.to.y - h / 2;
    } else if (newSide === "bottom") {
      x = prompt.to.x - w / 2;
      y = prompt.to.y - h;
    } else if (newSide === "left") {
      x = prompt.to.x;
      y = prompt.to.y - h / 2;
    }
    const note = createNote({ id, x: Math.round(x), y: Math.round(y), color: "violet" });
    setNotes((prev) => [...prev, note]);
    addConnection(prompt.from, { noteId: id, side: newSide });
    setSelected(new Set([id]));
    setAutoFocusId(id);
    setRecentId(id);
    setConnectionPrompt(null);
    window.setTimeout(() => setAutoFocusId(null), 1600);
    window.setTimeout(() => setRecentId(null), 2600);
  }, [addConnection, connectionPrompt]);

  const onNoteDragStart = useCallback(
    (e: React.PointerEvent, id: string) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      setMenu(null);
      if (e.ctrlKey || e.metaKey) {
        setSelected((prev) => {
          const s = new Set(prev);
          if (s.has(id)) s.delete(id);
          else s.add(id);
          return s;
        });
        return;
      }
      let ids: string[];
      if (selected.has(id)) ids = [...selected];
      else {
        ids = [id];
        setSelected(new Set([id]));
      }
      const origins: Record<string, { x: number; y: number }> = {};
      for (const nid of ids) {
        const n = notesRef.current.find((x) => x.id === nid);
        if (n) origins[nid] = { x: n.x, y: n.y };
      }
      gesture.current = { type: "note", sx: e.clientX, sy: e.clientY, moved: false, ids, origins };
      (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    },
    [selected]
  );

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      if ((e.target as HTMLElement).closest("[data-note]")) return;
      if ((e.target as HTMLElement).closest("input, textarea, a, button")) return;
      if ((e.target as HTMLElement).closest("[data-ui]")) return;
      setMenu(null);
      setConnectionPrompt(null);
      const v = viewRef.current;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (e.button === 2 || e.pointerType === "touch") {
        gesture.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y, moved: false };
        document.body.classList.add("grabbing");
      } else if (e.button === 0) {
        const additive = e.ctrlKey || e.metaKey;
        gesture.current = {
          type: "select",
          sx: e.clientX,
          sy: e.clientY,
          additive,
          base: additive ? [...selected] : [],
          moved: false,
        };
        document.body.classList.add("selecting");
      }
    },
    [selected]
  );

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const g = gesture.current;
    if (!g) return;
    const v = viewRef.current;
    if (g.type === "pan") {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.moved && Math.abs(dx) + Math.abs(dy) > 3) g.moved = true;
      v.x = g.ox + dx;
      v.y = g.oy + dy;
      applyView();
    } else if (g.type === "select") {
      const dx = e.clientX - g.sx;
      const dy = e.clientY - g.sy;
      if (!g.moved && Math.abs(dx) + Math.abs(dy) > 4) g.moved = true;
      if (!g.moved) return;
      const rect = {
        x1: Math.min(g.sx, e.clientX),
        y1: Math.min(g.sy, e.clientY),
        x2: Math.max(g.sx, e.clientX),
        y2: Math.max(g.sy, e.clientY),
      };
      const el = selRectRef.current;
      if (el) {
        el.style.display = "block";
        el.style.left = rect.x1 + "px";
        el.style.top = rect.y1 + "px";
        el.style.width = rect.x2 - rect.x1 + "px";
        el.style.height = rect.y2 - rect.y1 + "px";
      }
      const hits: string[] = [];
      for (const n of notesRef.current) {
        const { width, height } = noteSize(n);
        const sx = n.x * v.zoom + v.x;
        const sy = n.y * v.zoom + v.y;
        const sw = width * v.zoom;
        const sh = height * v.zoom;
        if (sx < rect.x2 && sx + sw > rect.x1 && sy < rect.y2 && sy + sh > rect.y1) hits.push(n.id);
      }
      setSelected(new Set([...g.base, ...hits]));
    } else if (g.type === "note") {
      const dx = (e.clientX - g.sx) / v.zoom;
      const dy = (e.clientY - g.sy) / v.zoom;
      if (!g.moved && Math.abs(dx) * v.zoom + Math.abs(dy) * v.zoom > 3) {
        g.moved = true;
        document.body.classList.add("dragging-note");
      }
      if (!g.moved) return;
      for (const id of g.ids) {
        const o = g.origins[id];
        const el = noteEls.current.get(id);
        if (o && el) el.style.transform = `translate3d(${o.x + dx}px, ${o.y + dy}px, 0)`;
      }
    }
  }, [applyView]);

  const onPointerUp = useCallback(
    (e: React.PointerEvent) => {
      const g = gesture.current;
      gesture.current = null;
      document.body.classList.remove("grabbing", "selecting", "dragging-note");
      if (!g) return;
      if (g.type === "pan") {
        if (g.moved) {
          suppressCtx.current = true;
          persistSoon();
        }
      } else if (g.type === "select") {
        if (selRectRef.current) selRectRef.current.style.display = "none";
        if (!g.moved && !g.additive) setSelected(new Set());
      } else if (g.type === "note") {
        if (g.moved) {
          const v = viewRef.current;
          const dx = (e.clientX - g.sx) / v.zoom;
          const dy = (e.clientY - g.sy) / v.zoom;
          setNotes((prev) =>
            prev.map((n) =>
              g.origins[n.id]
                ? { ...n, x: Math.round(g.origins[n.id].x + dx), y: Math.round(g.origins[n.id].y + dy) }
                : n
            )
          );
        }
      }
    },
    [persistSoon]
  );

  /* ------------------------------ wheel ----------------------------- */
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.0085 : 0.0016)));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  /* ---------------------------- keyboard ---------------------------- */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t?.closest("input, textarea, [contenteditable]")) return;
      if ((e.key === "Delete" || e.key === "Backspace") && selected.size) {
        e.preventDefault();
        deleteIds([...selected]);
      } else if (e.key === "Escape") {
        setMenu(null);
        setSelected(new Set());
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(notesRef.current.map((n) => n.id)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, deleteIds]);

  /* -------------------------- context menus ------------------------- */
  const clampMenu = (x: number, y: number, estH: number) => ({
    x: clamp(x, 8, window.innerWidth - 248),
    y: clamp(y, 8, window.innerHeight - estH - 12),
  });

  const openEditorMenu = useCallback(
    (
      e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>,
      id: string,
      field: "title" | "text"
    ) => {
      e.preventDefault();
      e.stopPropagation();
      const el = e.currentTarget;
      const hasSelection = el.selectionStart !== el.selectionEnd;

      const applyValue = (next: string, start: number, end = start) => {
        updateNote(id, { [field]: next } as Partial<Note>);
        requestAnimationFrame(() => {
          el.focus();
          el.setSelectionRange(start, end);
        });
      };

      const replaceSelection = (text: string, selectStart?: number, selectEnd?: number) => {
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        const next = el.value.slice(0, start) + text + el.value.slice(end);
        applyValue(next, selectStart ?? start + text.length, selectEnd ?? start + text.length);
      };

      const wrapSelection = (before: string, after = before, placeholder = "متن") => {
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        const selectedText = el.value.slice(start, end) || placeholder;
        const inserted = `${before}${selectedText}${after}`;
        replaceSelection(inserted, start + before.length, start + before.length + selectedText.length);
      };

      const transformSelectedLines = (transform: (line: string, i: number) => string) => {
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        const lineStart = el.value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
        const foundEnd = el.value.indexOf("\n", end);
        const lineEnd = foundEnd === -1 ? el.value.length : foundEnd;
        const selectedText = el.value.slice(lineStart, lineEnd) || el.value.slice(start, end) || "";
        const transformed = selectedText.split("\n").map(transform).join("\n");
        const next = el.value.slice(0, lineStart) + transformed + el.value.slice(lineEnd);
        applyValue(next, lineStart, lineStart + transformed.length);
      };

      const removeLineMarkers = (line: string) =>
        line.replace(/^\s{0,3}(#{1,6}\s+|[-*+]\s+|\d+[.)]\s+|-\s+\[[ xX]\]\s+|>\s+)/, "");

      const copySelected = async () => {
        if (!hasSelection) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        await navigator.clipboard.writeText(el.value.slice(start, end));
        push("success", "متن کپی شد");
      };

      const cutSelected = async () => {
        if (!hasSelection) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        await navigator.clipboard.writeText(el.value.slice(start, end));
        applyValue(el.value.slice(0, start) + el.value.slice(end), start);
        push("success", "متن بریده شد");
      };

      const pasteText = async () => {
        try {
          const text = await navigator.clipboard.readText();
          if (text) replaceSelection(text);
        } catch {
          push("error", "دسترسی خواندن کلیپ‌بورد داده نشد");
        }
      };

      const insertLink = (external = false) => {
        const url = window.prompt(external ? "آدرس پیوند بیرونی:" : "آدرس پیوند:", "https://");
        if (!url) return;
        const start = el.selectionStart ?? 0;
        const end = el.selectionEnd ?? start;
        const label = el.value.slice(start, end) || (external ? "پیوند بیرونی" : "پیوند");
        replaceSelection(`[${label}](${url})`, start + 1, start + 1 + label.length);
      };

      const attachFile = () => {
        const input = document.createElement("input");
        input.type = "file";
        input.multiple = true;
        input.onchange = () => {
          const files = Array.from(input.files ?? []);
          if (!files.length) return;
          replaceSelection(files.map((f) => `📎 ${f.name}`).join("\n"));
        };
        input.click();
      };

      const rows: MenuRow[] = [
        { icon: Link, label: "افزودن پیوند", onClick: () => insertLink(false) },
        { icon: ExternalLink, label: "افزودن پیوند بیرونی", onClick: () => insertLink(true) },
        { icon: FilePlus, label: "فایل پیوست", onClick: attachFile },
        { type: "sep" },
        {
          type: "submenu",
          icon: Pilcrow,
          label: "بندنوشت",
          rows: [
            { icon: List, label: "فهرست گلوله‌ای", onClick: () => transformSelectedLines((line) => `- ${removeLineMarkers(line)}`) },
            { icon: ListOrdered, label: "فهرست شماره‌دار", onClick: () => transformSelectedLines((line, i) => `${i + 1}. ${removeLineMarkers(line)}`) },
            { icon: ListChecks, label: "فهرست کارها", onClick: () => transformSelectedLines((line) => `- [ ] ${removeLineMarkers(line)}`) },
            { icon: Heading1, label: "۱ سرفصل", onClick: () => transformSelectedLines((line) => `# ${removeLineMarkers(line)}`) },
            { icon: Heading2, label: "۲ سرفصل", onClick: () => transformSelectedLines((line) => `## ${removeLineMarkers(line)}`) },
            { icon: Heading3, label: "۳ سرفصل", onClick: () => transformSelectedLines((line) => `### ${removeLineMarkers(line)}`) },
            { icon: Heading4, label: "۴ سرفصل", onClick: () => transformSelectedLines((line) => `#### ${removeLineMarkers(line)}`) },
            { icon: Heading5, label: "۵ سرفصل", onClick: () => transformSelectedLines((line) => `##### ${removeLineMarkers(line)}`) },
            { icon: Heading6, label: "۶ سرفصل", onClick: () => transformSelectedLines((line) => `###### ${removeLineMarkers(line)}`) },
            { icon: Pilcrow, label: "تنه", onClick: () => transformSelectedLines((line) => removeLineMarkers(line)) },
            { icon: Quote, label: "نقل‌قول", onClick: () => transformSelectedLines((line) => `> ${removeLineMarkers(line)}`) },
          ],
        },
        {
          type: "submenu",
          icon: TextCursorInput,
          label: "درج",
          rows: [
            { icon: Minus, label: "جداکننده", onClick: () => replaceSelection("\n---\n") },
            { icon: TextCursorInput, label: "تاریخ امروز", onClick: () => replaceSelection(new Date().toLocaleDateString("fa-IR")) },
            { icon: TextCursorInput, label: "زمان فعلی", onClick: () => replaceSelection(new Date().toLocaleTimeString("fa-IR")) },
            { icon: Quote, label: "بلوک نقل‌قول", onClick: () => transformSelectedLines((line) => `> ${removeLineMarkers(line)}`) },
          ],
        },
        { type: "sep" },
        { icon: Scissors, label: "برش", disabled: !hasSelection, onClick: () => void cutSelected() },
        { icon: Copy, label: "کپی", disabled: !hasSelection, onClick: () => void copySelected() },
        { icon: ClipboardPaste, label: "جایگذاری", onClick: () => void pasteText() },
        { icon: Clipboard, label: "جایگذاری به‌صورت متن ساده", onClick: () => void pasteText() },
        {
          icon: ClipboardCopy,
          label: "انتخاب همه",
          onClick: () => {
            el.focus();
            el.select();
          },
        },
      ];

      setMenu({ ...clampMenu(e.clientX, e.clientY, 430), rows });
    },
    [push, updateNote]
  );

  const openCanvasMenu = useCallback(
    (x: number, y: number) => {
      const v = viewRef.current;
      const rows: MenuRow[] = [
        {
          icon: Plus,
          label: "یادداشت جدید همین‌جا",
          hint: "دابل‌کلیک",
          onClick: () => addNoteAt((x - v.x) / v.zoom, (y - v.y) / v.zoom),
        },
        {
          icon: MousePointer2,
          label: "انتخاب همه‌ی یادداشت‌ها",
          hint: "Ctrl+A",
          onClick: () => setSelected(new Set(notesRef.current.map((n) => n.id))),
        },
        { icon: LayoutGrid, label: "چیدمان شبکه‌ای", onClick: () => arrangeGrid() },
        { type: "sep" },
        { icon: Maximize, label: "نمایش همه‌ی یادداشت‌ها", onClick: fitView },
        {
          icon: RotateCcw,
          label: "بازنشانی نما (۱۰۰٪)",
          onClick: () => {
            viewRef.current = { x: 0, y: 0, zoom: 1 };
            applyView();
            persistSoon();
          },
        },
        {
          icon: themeRef.current === "dark" ? Sun : Moon,
          label: themeRef.current === "dark" ? "حالت روشن" : "حالت تاریک",
          onClick: () => setTheme((t) => (t === "dark" ? "light" : "dark")),
        },
      ];
      setMenu({ ...clampMenu(x, y, 340), rows });
    },
    [addNoteAt, arrangeGrid, fitView, applyView, persistSoon]
  );

  const onNoteContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      let ids = [...selected];
      if (!selected.has(id)) {
        ids = [id];
        setSelected(new Set([id]));
      }
      const multi = ids.length > 1;
      const colorShared =
        notesRef.current.find((n) => n.id === id)?.color ?? "slate";
      const rows: MenuRow[] = [
        { type: "label", text: multi ? `${faNum(ids.length)} یادداشت انتخاب شده` : "یادداشت" },
        ...(multi
          ? [
              { icon: Copy, label: "کپی جداگانه (هر کدام یک کلیپ‌بورد)", onClick: copySeparate } as MenuRow,
              { icon: ClipboardCopy, label: "کپی یکجا در یک کلیپ‌بورد", onClick: copyAll } as MenuRow,
            ]
          : [{ icon: Copy, label: "کپی یادداشت", hint: "Ctrl+C", onClick: () => copyNoteById(id) } as MenuRow]),
        {
          icon: CopyPlus,
          label: multi ? "تکثیر همه" : "تکثیر",
          onClick: () => duplicateIds(ids),
        },
        { type: "label", text: "رنگ یادداشت" },
        {
          type: "swatches",
          current: colorShared,
          onPick: (cid) =>
            setNotes((prev) => prev.map((n) => (ids.includes(n.id) ? { ...n, color: cid } : n))),
        },
        { type: "sep" },
        { icon: Trash2, label: multi ? "حذف همه" : "حذف", hint: "Del", danger: true, onClick: () => deleteIds(ids) },
      ];
      setMenu({ ...clampMenu(e.clientX, e.clientY, 330), rows });
    },
    [selected, copySeparate, copyAll, copyNoteById, duplicateIds, deleteIds]
  );

  const onRootContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("input, textarea")) return; // native spellcheck menu while editing
      e.preventDefault();
      if (t.closest("[data-ui]")) return;
      if (suppressCtx.current) {
        suppressCtx.current = false;
        return;
      }
      if (t.closest("[data-note]")) return; // handled by NoteCard
      openCanvasMenu(e.clientX, e.clientY);
    },
    [openCanvasMenu]
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-note]") || t.closest("input, textarea, button, a") || t.closest("[data-ui]"))
        return;
      const v = viewRef.current;
      addNoteAt((e.clientX - v.x) / v.zoom, (e.clientY - v.y) / v.zoom);
    },
    [addNoteAt]
  );

  /* ------------------------------ render ---------------------------- */
  return (
    <div
      ref={canvasRef}
      className="canvas-grid fixed inset-0 overflow-hidden"
      style={{ touchAction: "none" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onContextMenu={onRootContextMenu}
      onDoubleClick={onDoubleClick}
    >
      <div className="vignette" />

      {/* world */}
      <div ref={worldRef} className="absolute left-0 top-0 will-change-transform" style={{ transformOrigin: "0 0" }}>
        <svg className="absolute left-0 top-0 overflow-visible pointer-events-none z-0" width="1" height="1">
          <defs>
            <marker id="note-arrow" markerWidth="10" markerHeight="10" refX="8.5" refY="5" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 10 5 L 0 10 z" fill="#a78bfa" />
            </marker>
          </defs>
          {connections.map((c) => {
            const from = endpointPoint(c.from);
            const to = endpointPoint(c.to);
            if (!from || !to) return null;
            return (
              <path
                key={c.id}
                d={connectionPath(from, c.from.side, to, c.to.side)}
                fill="none"
                stroke="#a78bfa"
                strokeWidth={2.5}
                strokeLinecap="round"
                markerEnd="url(#note-arrow)"
                opacity={0.9}
              />
            );
          })}
          {draftConnection && (() => {
            const from = endpointPoint(draftConnection.from);
            if (!from) return null;
            const toSide = draftConnection.target?.side ?? oppositeSide(draftConnection.from.side);
            return (
              <path
                d={connectionPath(from, draftConnection.from.side, draftConnection.to, toSide)}
                fill="none"
                stroke="#c4b5fd"
                strokeWidth={2.5}
                strokeDasharray="7 7"
                strokeLinecap="round"
                markerEnd="url(#note-arrow)"
                opacity={0.95}
              />
            );
          })()}
        </svg>
        {notes.map((n) => (
          <NoteCard
            key={n.id}
            note={n}
            selected={selected.has(n.id)}
            zoom={zoomLabel}
            autoFocusId={autoFocusId}
            recentId={recentId}
            onChange={updateNote}
            onDelete={(id) => deleteIds([id])}
            onCopy={copyNoteById}
            onDragStart={onNoteDragStart}
            onConnectorDragStart={onConnectorDragStart}
            onEditorContextMenu={openEditorMenu}
            onContextMenu={onNoteContextMenu}
            registerRef={registerNoteRef}
            interactive
          />
        ))}
      </div>

      {/* selection rectangle */}
      <div ref={selRectRef} className="selection-rect" style={{ display: "none" }} />

      {loaded && notes.length === 0 && (
        <EmptyState onAdd={() => addNoteAt()} />
      )}

      <Toolbar
        zoom={zoomLabel}
        theme={theme}
        selectedCount={selected.size}
        isExtension={isExtension}
        onZoomIn={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 1.28)}
        onZoomOut={() => zoomAt(window.innerWidth / 2, window.innerHeight / 2, 0.78)}
        onFit={fitView}
        onResetView={() => {
          viewRef.current = { x: 0, y: 0, zoom: 1 };
          applyView();
          persistSoon();
        }}
        onAdd={() => addNoteAt()}
        onToggleTheme={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}
        onCopySeparate={copySeparate}
        onCopyCombined={copyAll}
        onDeleteSelected={() => deleteIds([...selected])}
        onClearSelection={() => setSelected(new Set())}
      />

      <AnimatePresence>
        {connectionPrompt && (
          <motion.div
            data-ui
            initial={{ opacity: 0, y: 8, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.96 }}
            className="fixed z-[90] glass rounded-2xl p-1.5 shadow-2xl"
            style={{ left: connectionPrompt.x, top: connectionPrompt.y }}
          >
            <button
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-[13px] font-bold hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
              onClick={addConnectedNoteFromPrompt}
            >
              <Plus size={15} style={{ color: "var(--accent)" }} /> افزودن یادداشت
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* bottom status + hints */}
      <div data-ui className="fixed bottom-4 inset-x-0 z-[65] flex justify-center pointer-events-none px-3">
        <div className="glass rounded-2xl px-4 py-2 flex items-center gap-3 text-[11px] shadow-xl max-w-full overflow-x-auto" style={{ color: "var(--text-dim)" }}>
          <span className="flex items-center gap-1.5 whitespace-nowrap">
            <Hand size={12} style={{ color: "var(--accent)" }} /> راست‌کلیک + درگ: جابه‌جایی بوم
          </span>
          <span className="opacity-40">•</span>
          <span className="whitespace-nowrap">چپ‌کلیک + درگ: کادر انتخاب</span>
          <span className="opacity-40 hidden sm:inline">•</span>
          <span className="whitespace-nowrap hidden sm:inline">اسکرول: زوم</span>
          <span className="opacity-40">•</span>
          <span className="tabular whitespace-nowrap font-bold" style={{ color: "var(--text)" }}>
            {faNum(notes.length)} یادداشت
            {selected.size > 0 && ` • ${faNum(selected.size)} انتخاب`}
          </span>
        </div>
      </div>

      {/* separate-copy progress */}
      <AnimatePresence>
        {copyJob && (
          <motion.div
            initial={{ opacity: 0, y: 14, scale: 0.94 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
            className="fixed bottom-6 right-5 z-[92] glass rounded-xl px-4 py-2.5 flex items-center gap-2.5 shadow-2xl"
          >
            <LoaderCircle size={15} className="animate-spin shrink-0" style={{ color: "var(--accent)" }} />
            <span className="text-[12.5px] font-bold tabular">
              کپی جداگانه: {faNum(copyJob.done)} از {faNum(copyJob.total)}
            </span>
          </motion.div>
        )}
      </AnimatePresence>

      <ContextMenu menu={menu} onClose={() => setMenu(null)} />
      <ToastStack toasts={toasts} />
      <div className="noise-overlay" />
    </div>
  );
}
