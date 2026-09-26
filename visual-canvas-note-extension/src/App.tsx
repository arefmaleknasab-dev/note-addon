import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ClipboardCopy,
  Copy,
  CopyPlus,
  Download,
  Hand,
  HelpCircle,
  LayoutGrid,
  LoaderCircle,
  Maximize,
  Moon,
  MousePointer2,
  Plus,
  RotateCcw,
  Sun,
  Trash2,
} from "lucide-react";
import NoteCard from "./components/NoteCard";
import ContextMenu, { type MenuRow } from "./components/ContextMenu";
import Toolbar from "./components/Toolbar";
import HelpModal from "./components/HelpModal";
import EmptyState from "./components/EmptyState";
import { ToastStack, useToasts } from "./components/Toasts";
import type { Note, Theme, ViewState } from "./types";
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
  DEFAULT_NOTE_W,
  noteFromPending,
  seedNotes,
  viewCenter,
} from "./lib/notes";
import { faNum, GRID_SIZE, MAX_ZOOM, MIN_ZOOM, uid } from "./lib/constants";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const EXTENSION_PACKAGE_NAME = "persian-notes-extension.zip";

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

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [theme, setTheme] = useState<Theme>("dark"); // dark by default
  const [loaded, setLoaded] = useState(false);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [recentId, setRecentId] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);
  const [menu, setMenu] = useState<{ x: number; y: number; rows: MenuRow[] } | null>(null);
  const [zoomLabel, setZoomLabel] = useState(1);
  const [copyJob, setCopyJob] = useState<{ done: number; total: number } | null>(null);
  const copyingRef = useRef(false);
  const { toasts, push } = useToasts();

  const viewRef = useRef<ViewState>({ x: 0, y: 0, zoom: 1 });
  const notesRef = useRef<Note[]>([]);
  const themeRef = useRef<Theme>("dark");
  const canvasRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const selRectRef = useRef<HTMLDivElement>(null);
  const noteEls = useRef(new Map<string, HTMLDivElement>());
  const gesture = useRef<Gesture>(null);
  const suppressCtx = useRef(false);
  const saveTimer = useRef<number | undefined>(undefined);

  notesRef.current = notes;
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
      saveState({ notes: notesRef.current, view: viewRef.current, theme: themeRef.current }).catch(
        () => {}
      );
    }, 550);
  }, []);

  useEffect(() => {
    if (loaded) persistSoon();
  }, [notes, theme, loaded, persistSoon]);

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
      const h = noteEls.current.get(n.id)?.offsetHeight ?? 200;
      minX = Math.min(minX, n.x);
      minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + n.width);
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
        setNotes(s.notes);
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
      // first-run: show install guide if not inside the extension
      if (!isExtension) window.setTimeout(() => setHelpOpen(true), 900);
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
    const cellH =
      Math.max(...items.map((n) => noteEls.current.get(n.id)?.offsetHeight ?? 220)) + 42;
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
        const h = noteEls.current.get(n.id)?.offsetHeight ?? 200;
        const sx = n.x * v.zoom + v.x;
        const sy = n.y * v.zoom + v.y;
        const sw = n.width * v.zoom;
        const sh = h * v.zoom;
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
        setHelpOpen(false);
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

  const downloadExtension = useCallback(() => {
    const a = document.createElement("a");
    a.href = `${EXTENSION_PACKAGE_NAME}?v=${Date.now()}`;
    a.download = EXTENSION_PACKAGE_NAME;
    a.rel = "noopener";
    a.style.display = "none";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }, []);

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
        { type: "sep" },
        { icon: Download, label: "دانلود فایل نصبی افزونه", onClick: downloadExtension },
        { icon: HelpCircle, label: "راهنما و نصب", onClick: () => setHelpOpen(true) },
      ];
      setMenu({ ...clampMenu(x, y, 380), rows });
    },
    [addNoteAt, arrangeGrid, fitView, applyView, persistSoon, downloadExtension]
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
            onContextMenu={onNoteContextMenu}
            registerRef={registerNoteRef}
            interactive
          />
        ))}
      </div>

      {/* selection rectangle */}
      <div ref={selRectRef} className="selection-rect" style={{ display: "none" }} />

      {loaded && notes.length === 0 && (
        <EmptyState onAdd={() => addNoteAt()} onHelp={() => setHelpOpen(true)} />
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
        onHelp={() => setHelpOpen(true)}
        onCopySeparate={copySeparate}
        onCopyCombined={copyAll}
        onDeleteSelected={() => deleteIds([...selected])}
        onClearSelection={() => setSelected(new Set())}
      />

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
      <HelpModal open={helpOpen} onClose={() => setHelpOpen(false)} />
      <ToastStack toasts={toasts} />
      <div className="noise-overlay" />
    </div>
  );
}
