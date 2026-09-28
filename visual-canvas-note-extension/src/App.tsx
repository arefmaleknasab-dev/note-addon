import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  ArrowLeftRight,
  ArrowRight,
  Clipboard,
  ClipboardCopy,
  ClipboardPaste,
  Copy,
  CopyPlus,
  ExternalLink,
  FilePlus,
  Hand,
  Heading1,
  LayoutGrid,
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
import type { ConnectionDirection, ConnectionSide, Note, NoteConnection, Theme, ViewState } from "./types";
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
  MAX_NOTE_H,
  MAX_NOTE_W,
  MIN_NOTE_H,
  MIN_NOTE_W,
  noteFromPending,
  seedNotes,
  viewCenter,
} from "./lib/notes";
import { faNum, GRID_SIZE, MAX_ZOOM, MIN_ZOOM, uid } from "./lib/constants";

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const CONNECTION_COLOR = "#8b95a7";
const CONNECTION_COLORS = [
  { name: "خاکستری", hex: "#8b95a7" },
  { name: "کهربایی", hex: "#f5a623" },
  { name: "صورتی", hex: "#fb7185" },
  { name: "آبی", hex: "#38bdf8" },
  { name: "سبز", hex: "#34d399" },
  { name: "بنفش", hex: "#a78bfa" },
];

const connectionColor = (connection: NoteConnection) => connection.color || CONNECTION_COLOR;
const connectionDirection = (connection: NoteConnection): ConnectionDirection => connection.direction ?? "forward";

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

const CONNECTION_ENDPOINT_GAP = 2.25;

const outsetPoint = (point: Point, side: ConnectionSide, gap = CONNECTION_ENDPOINT_GAP): Point => {
  const v = sideVector(side);
  return { x: point.x + v.x * gap, y: point.y + v.y * gap };
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

const estimateNoteSize = (text: string) => {
  const lines = text.replace(/\r\n/g, "\n").split("\n");
  const longest = Math.max(0, ...lines.map((line) => line.length));
  const width = clamp(Math.max(DEFAULT_NOTE_W, longest * 7.2 + 76), MIN_NOTE_W, MAX_NOTE_W);
  const charsPerLine = Math.max(22, Math.floor((width - 48) / 7.2));
  const visualLines = lines.reduce(
    (sum, line) => sum + Math.max(1, Math.ceil(Math.max(1, line.length) / charsPerLine)),
    0
  );
  const height = clamp(visualLines * 25 + 84, MIN_NOTE_H, MAX_NOTE_H);
  return { width: Math.round(width), height: Math.round(height) };
};

const midpoint = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

const rectsIntersect = (a: { x1: number; y1: number; x2: number; y2: number }, b: { x1: number; y1: number; x2: number; y2: number }) =>
  a.x1 < b.x2 && a.x2 > b.x1 && a.y1 < b.y2 && a.y2 > b.y1;

export default function App() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [connections, setConnections] = useState<NoteConnection[]>([]);
  const [draftConnection, setDraftConnection] = useState<DraftConnection | null>(null);
  const [connectionPrompt, setConnectionPrompt] = useState<ConnectionPrompt | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [selectedConnections, setSelectedConnections] = useState<Set<string>>(new Set());
  const [selectedConnectionLabelId, setSelectedConnectionLabelId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>("dark"); // dark by default
  const [loaded, setLoaded] = useState(false);
  const [autoFocusId, setAutoFocusId] = useState<string | null>(null);
  const [recentId, setRecentId] = useState<string | null>(null);
  const [menu, setMenu] = useState<{ x: number; y: number; rows: MenuRow[] } | null>(null);
  const [deletePrompt, setDeletePrompt] = useState<string[] | null>(null);
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
  const undoStack = useRef<{ notes: Note[]; connections: NoteConnection[] }[]>([]);
  const redoStack = useRef<{ notes: Note[]; connections: NoteConnection[] }[]>([]);
  const connectionFocusToggle = useRef<Record<string, number>>({});

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
        const rightmost = notesRef.current.reduce<Note | null>((best, note) => {
          if (!best) return note;
          return note.x + (note.width ?? DEFAULT_NOTE_W) > best.x + (best.width ?? DEFAULT_NOTE_W)
            ? note
            : best;
        }, null);
        let cursorX = rightmost
          ? rightmost.x + (rightmost.width ?? DEFAULT_NOTE_W) + 64
          : c.x - DEFAULT_NOTE_W / 2;
        const baseY = rightmost ? rightmost.y : c.y - DEFAULT_NOTE_H / 2;
        const fresh = items.map((p, i) => {
          const size = estimateNoteSize(p.text);
          const note = {
            ...noteFromPending(p, base + i),
            ...size,
            x: Math.round(cursorX),
            y: Math.round(baseY + i * 34),
          };
          cursorX += size.width + 64;
          return note;
        });
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

  const deleteIds = useCallback((ids: string[]) => {
    const unique = [...new Set(ids)].filter((id) => notesRef.current.some((n) => n.id === id));
    if (!unique.length) return;
    setMenu(null);
    setDeletePrompt(unique);
  }, []);

  const confirmDelete = useCallback(() => {
    const unique = deletePrompt;
    if (!unique?.length) return;
    const idSet = new Set(unique);
    const doomed = notesRef.current.filter((n) => idSet.has(n.id));
    if (!doomed.length) {
      setDeletePrompt(null);
      return;
    }
    const related = connectionsRef.current.filter(
      (c) => idSet.has(c.from.noteId) || idSet.has(c.to.noteId)
    );
    undoStack.current.push({ notes: doomed, connections: related });
    redoStack.current = [];
    setNotes((prev) => prev.filter((n) => !idSet.has(n.id)));
    setConnections((prev) => prev.filter((c) => !idSet.has(c.from.noteId) && !idSet.has(c.to.noteId)));
    const relatedIds = new Set(related.map((c) => c.id));
    setSelectedConnections((prev) => {
      const s = new Set(prev);
      relatedIds.forEach((id) => s.delete(id));
      return s;
    });
    setEditingConnectionId((id) => (id && relatedIds.has(id) ? null : id));
    setSelectedConnectionLabelId((id) => (id && relatedIds.has(id) ? null : id));
    setEditingId((id) => (id && idSet.has(id) ? null : id));
    setSelected((prev) => {
      const s = new Set(prev);
      unique.forEach((id) => s.delete(id));
      return s;
    });
    setDeletePrompt(null);
    push("info", doomed.length > 1 ? `${faNum(doomed.length)} یادداشت حذف شد` : "یادداشت حذف شد");
  }, [deletePrompt, push]);

  const cancelDelete = useCallback(() => setDeletePrompt(null), []);

  const undoDelete = useCallback(() => {
    const snap = undoStack.current.pop();
    if (!snap) return;
    redoStack.current.push(snap);
    const ids = new Set(snap.notes.map((n) => n.id));
    setNotes((prev) => [...prev.filter((n) => !ids.has(n.id)), ...snap.notes]);
    setConnections((prev) => {
      const existing = new Set(prev.map((c) => c.id));
      return [...prev, ...snap.connections.filter((c) => !existing.has(c.id))];
    });
    setSelected(ids);
    push("success", "حذف یادداشت بازگردانده شد");
  }, [push]);

  const redoDelete = useCallback(() => {
    const snap = redoStack.current.pop();
    if (!snap) return;
    undoStack.current.push(snap);
    const ids = new Set(snap.notes.map((n) => n.id));
    setNotes((prev) => prev.filter((n) => !ids.has(n.id)));
    setConnections((prev) => prev.filter((c) => !ids.has(c.from.noteId) && !ids.has(c.to.noteId)));
    setSelected((prev) => {
      const s = new Set(prev);
      ids.forEach((id) => s.delete(id));
      return s;
    });
    push("info", "حذف دوباره انجام شد");
  }, [push]);

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
      return [...prev, { id: uid(), from, to, direction: "forward" }];
    });
  }, []);

  const updateConnection = useCallback((id: string, patch: Partial<NoteConnection>) => {
    setConnections((prev) => prev.map((c) => (c.id === id ? { ...c, ...patch } : c)));
  }, []);

  const finishConnectionLabelEdit = useCallback(
    (id: string) => {
      const value = connectionsRef.current.find((c) => c.id === id)?.label ?? "";
      if (!value.trim()) {
        updateConnection(id, { label: undefined });
        setSelectedConnectionLabelId((current) => (current === id ? null : current));
      }
      setEditingConnectionId((current) => (current === id ? null : current));
    },
    [updateConnection]
  );

  const clearConnectionLabel = useCallback(
    (id: string) => {
      updateConnection(id, { label: undefined });
      setEditingConnectionId((current) => (current === id ? null : current));
      setSelectedConnectionLabelId((current) => (current === id ? null : current));
      push("info", "نوشته‌ی اتصال پاک شد");
    },
    [push, updateConnection]
  );

  const deleteConnectionIds = useCallback(
    (ids: string[]) => {
      const idSet = new Set(ids);
      if (!idSet.size) return;
      setConnections((prev) => prev.filter((c) => !idSet.has(c.id)));
      setSelectedConnections((prev) => {
        const s = new Set(prev);
        ids.forEach((id) => s.delete(id));
        return s;
      });
      setEditingConnectionId((id) => (id && idSet.has(id) ? null : id));
      setSelectedConnectionLabelId((id) => (id && idSet.has(id) ? null : id));
      push("info", ids.length > 1 ? `${faNum(ids.length)} اتصال حذف شد` : "اتصال حذف شد");
    },
    [push]
  );

  const connectionPoints = useCallback(
    (connection: NoteConnection): { from: Point; to: Point; drawFrom: Point; drawTo: Point; mid: Point } | null => {
      const fromNote = notesRef.current.find((n) => n.id === connection.from.noteId);
      const toNote = notesRef.current.find((n) => n.id === connection.to.noteId);
      if (!fromNote || !toNote) return null;
      const from = sidePoint(fromNote, connection.from.side);
      const to = sidePoint(toNote, connection.to.side);
      const drawFrom = outsetPoint(from, connection.from.side);
      const drawTo = outsetPoint(to, connection.to.side);
      return { from, to, drawFrom, drawTo, mid: midpoint(drawFrom, drawTo) };
    },
    []
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
      const p = worldPointFromScreen(clientX, clientY);
      const circleSnapPx = 24;
      let circleBest: { endpoint: Endpoint; d: number } | null = null;
      let insideBest: { endpoint: Endpoint; d: number } | null = null;

      for (const note of notesRef.current) {
        if (note.id === excludeId) continue;
        const { width, height } = noteSize(note);
        const x1 = note.x;
        const y1 = note.y;
        const x2 = note.x + width;
        const y2 = note.y + height;
        const sides: ConnectionSide[] = ["top", "right", "bottom", "left"];

        for (const side of sides) {
          const sp = sidePoint(note, side);
          const v = viewRef.current;
          const sx = sp.x * v.zoom + v.x;
          const sy = sp.y * v.zoom + v.y;
          const d = Math.hypot(sx - clientX, sy - clientY);
          if (d <= circleSnapPx && (!circleBest || d < circleBest.d)) {
            circleBest = { endpoint: { noteId: note.id, side }, d };
          }
        }

        const inside = p.x >= x1 && p.x <= x2 && p.y >= y1 && p.y <= y2;
        if (!inside) continue;
        const candidates: { side: ConnectionSide; d: number }[] = [
          { side: "top", d: Math.abs(p.y - y1) },
          { side: "right", d: Math.abs(p.x - x2) },
          { side: "bottom", d: Math.abs(p.y - y2) },
          { side: "left", d: Math.abs(p.x - x1) },
        ];
        for (const c of candidates) {
          if (!insideBest || c.d < insideBest.d) {
            insideBest = { endpoint: { noteId: note.id, side: c.side }, d: c.d };
          }
        }
      }
      return circleBest?.endpoint ?? insideBest?.endpoint ?? null;
    },
    [worldPointFromScreen]
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
      setEditingConnectionId(null);
      setSelectedConnectionLabelId(null);
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
      setSelectedConnections(new Set());
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
      setEditingId(null);
      setEditingConnectionId(null);
      setSelectedConnectionLabelId(null);
      const v = viewRef.current;
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
      if (e.button === 2 || e.pointerType === "touch") {
        gesture.current = { type: "pan", sx: e.clientX, sy: e.clientY, ox: v.x, oy: v.y, moved: false };
        document.body.classList.add("grabbing");
      } else if (e.button === 0) {
        const additive = e.ctrlKey || e.metaKey;
        if (!additive) setSelectedConnections(new Set());
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
      const connectionHits: string[] = [];
      for (const c of connectionsRef.current) {
        const pts = connectionPoints(c);
        if (!pts) continue;
        const sx1 = pts.from.x * v.zoom + v.x;
        const sy1 = pts.from.y * v.zoom + v.y;
        const sx2 = pts.to.x * v.zoom + v.x;
        const sy2 = pts.to.y * v.zoom + v.y;
        const pad = 12;
        const box = {
          x1: Math.min(sx1, sx2) - pad,
          y1: Math.min(sy1, sy2) - pad,
          x2: Math.max(sx1, sx2) + pad,
          y2: Math.max(sy1, sy2) + pad,
        };
        if (rectsIntersect(rect, box)) connectionHits.push(c.id);
      }
      setSelected(new Set([...g.base, ...hits]));
      setSelectedConnections(new Set(connectionHits));
      setSelectedConnectionLabelId(null);
    } else if (g.type === "note") {
      const dx = (e.clientX - g.sx) / v.zoom;
      const dy = (e.clientY - g.sy) / v.zoom;
      if (!g.moved && Math.abs(dx) * v.zoom + Math.abs(dy) * v.zoom > 3) {
        g.moved = true;
        document.body.classList.add("dragging-note");
      }
      if (!g.moved) return;
      setNotes((prev) =>
        prev.map((n) =>
          g.origins[n.id]
            ? { ...n, x: Math.round(g.origins[n.id].x + dx), y: Math.round(g.origins[n.id].y + dy) }
            : n
        )
      );
    }
  }, [applyView, connectionPoints]);

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
        if (!g.moved && !g.additive) {
          setSelected(new Set());
          setSelectedConnections(new Set());
          setSelectedConnectionLabelId(null);
        }
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
      const target = e.target as HTMLElement | null;
      if (target?.closest('[data-note][data-editing="true"]')) return;
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
      if ((e.key === "Delete" || e.key === "Backspace") && selectedConnectionLabelId) {
        e.preventDefault();
        clearConnectionLabel(selectedConnectionLabelId);
      } else if ((e.key === "Delete" || e.key === "Backspace") && (selected.size || selectedConnections.size)) {
        e.preventDefault();
        if (selected.size) deleteIds([...selected]);
        else deleteConnectionIds([...selectedConnections]);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "z") {
        e.preventDefault();
        undoDelete();
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redoDelete();
      } else if (e.key === "Escape") {
        setMenu(null);
        setConnectionPrompt(null);
        setDeletePrompt(null);
        setEditingId(null);
        setEditingConnectionId(null);
        setSelectedConnectionLabelId(null);
        setDraftConnection(null);
        setSelected(new Set());
        setSelectedConnections(new Set());
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        e.preventDefault();
        setSelected(new Set(notesRef.current.map((n) => n.id)));
        setSelectedConnections(new Set());
        setSelectedConnectionLabelId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selected, selectedConnections, selectedConnectionLabelId, clearConnectionLabel, deleteIds, deleteConnectionIds, undoDelete, redoDelete]);

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

  const focusConnectedNote = useCallback(
    (id: string) => {
      const c = connectionsRef.current.find((x) => x.id === id);
      if (!c) return;
      const nextIndex = connectionFocusToggle.current[id] === 1 ? 0 : 1;
      connectionFocusToggle.current[id] = nextIndex;
      const endpoint = nextIndex === 1 ? c.to : c.from;
      const note = notesRef.current.find((n) => n.id === endpoint.noteId);
      if (!note) return;
      const { width, height } = noteSize(note);
      const zoom = clamp(Math.max(viewRef.current.zoom, 1.25), MIN_ZOOM, 1.65);
      viewRef.current.zoom = zoom;
      viewRef.current.x = window.innerWidth / 2 - (note.x + width / 2) * zoom;
      viewRef.current.y = window.innerHeight / 2 - (note.y + height / 2) * zoom;
      applyView();
      persistSoon();
      setSelected(new Set([note.id]));
      setSelectedConnections(new Set([id]));
      setSelectedConnectionLabelId(null);
      push("info", "یادداشت متصل نمایش داده شد");
    },
    [applyView, persistSoon, push]
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

  const onConnectionContextMenu = useCallback(
    (e: React.MouseEvent, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      const connection = connectionsRef.current.find((c) => c.id === id);
      if (!connection) return;
      setSelected(new Set());
      setSelectedConnections(new Set([id]));
      setSelectedConnectionLabelId(null);
      const pts = connectionPoints(connection);
      if (pts) {
        const clickPoint = worldPointFromScreen(e.clientX, e.clientY);
        const fromDistance = Math.hypot(clickPoint.x - pts.from.x, clickPoint.y - pts.from.y);
        const toDistance = Math.hypot(clickPoint.x - pts.to.x, clickPoint.y - pts.to.y);
        connectionFocusToggle.current[id] = fromDistance <= toDistance ? 0 : 1;
      }
      const rows: MenuRow[] = [
        {
          type: "swatches",
          current: connectionColor(connection),
          colors: CONNECTION_COLORS.map((color) => ({ id: color.hex, name: color.name, hex: color.hex })),
          onPick: (color) => updateConnection(id, { color }),
        },
        { type: "label", text: "اتصال" },
        { icon: Minus, label: "فلش بدون جهت", onClick: () => updateConnection(id, { direction: "none" }) },
        { icon: ArrowRight, label: "فلش تک‌جهته", onClick: () => updateConnection(id, { direction: "forward" }) },
        { icon: ArrowLeftRight, label: "فلش دوجهته", onClick: () => updateConnection(id, { direction: "both" }) },
        { type: "sep" },
        { icon: MousePointer2, label: "رفتن به اتصال", onClick: () => focusConnectedNote(id) },
        { icon: Trash2, label: "حذف اتصال", danger: true, onClick: () => deleteConnectionIds([id]) },
      ];
      setMenu({ ...clampMenu(e.clientX, e.clientY, 340), rows });
    },
    [clampMenu, connectionPoints, deleteConnectionIds, focusConnectedNote, updateConnection, worldPointFromScreen]
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
      if (t.closest("[data-note], [data-connection-label]")) return; // handled by NoteCard/connection label
      openCanvasMenu(e.clientX, e.clientY);
    },
    [openCanvasMenu]
  );

  const onDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      const t = e.target as HTMLElement;
      if (t.closest("[data-note], [data-connection-label]") || t.closest("input, textarea, button, a") || t.closest("[data-ui]"))
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
      <div ref={worldRef} className="absolute left-0 top-0" style={{ transformOrigin: "0 0" }}>
        <svg className="absolute left-0 top-0 overflow-visible z-0" width="1" height="1">
          <defs>
            <marker id="note-arrow" markerWidth="6" markerHeight="6" refX="5.1" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M 0 0 L 6 3 L 0 6 z" fill="context-stroke" />
            </marker>
            <marker id="note-arrow-start" markerWidth="6" markerHeight="6" refX="5.1" refY="3" orient="auto-start-reverse" markerUnits="strokeWidth">
              <path d="M 0 0 L 6 3 L 0 6 z" fill="context-stroke" />
            </marker>
          </defs>
          {connections.map((c) => {
            const pts = connectionPoints(c);
            if (!pts) return null;
            const d = connectionPath(pts.drawFrom, c.from.side, pts.drawTo, c.to.side);
            const isSelected = selectedConnections.has(c.id);
            const direction = connectionDirection(c);
            const color = connectionColor(c);
            const selectConnection = (event: React.MouseEvent<SVGPathElement>) => {
              event.preventDefault();
              event.stopPropagation();
              setSelected(new Set());
              setEditingId(null);
              setSelectedConnectionLabelId(null);
              setEditingConnectionId(null);
              setSelectedConnections((prev) => {
                if (event.ctrlKey || event.metaKey) {
                  const next = new Set(prev);
                  if (next.has(c.id)) next.delete(c.id);
                  else next.add(c.id);
                  return next;
                }
                return new Set([c.id]);
              });
            };
            return (
              <g key={c.id}>
                <path
                  d={d}
                  fill="none"
                  stroke="transparent"
                  strokeWidth={18}
                  strokeLinecap="round"
                  style={{ pointerEvents: "stroke", cursor: "pointer" }}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={selectConnection}
                  onDoubleClick={(event) => {
                    selectConnection(event);
                    setEditingConnectionId(c.id);
                    setSelectedConnectionLabelId(c.id);
                  }}
                  onContextMenu={(event) => onConnectionContextMenu(event, c.id)}
                />
                {isSelected && (
                  <path
                    d={d}
                    fill="none"
                    stroke={color}
                    strokeWidth={8}
                    strokeLinecap="round"
                    opacity={0.25}
                    style={{ pointerEvents: "none" }}
                  />
                )}
                <path
                  d={d}
                  fill="none"
                  stroke={color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                  markerStart={direction === "both" ? "url(#note-arrow-start)" : undefined}
                  markerEnd={direction === "forward" || direction === "both" ? "url(#note-arrow)" : undefined}
                  opacity={isSelected ? 1 : 0.9}
                  style={{ pointerEvents: "none", filter: isSelected ? "drop-shadow(0 0 5px rgba(139,149,167,.5))" : undefined }}
                />

              </g>
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
                stroke={CONNECTION_COLOR}
                strokeWidth={2.5}
                strokeDasharray="7 7"
                strokeLinecap="round"
                markerEnd="url(#note-arrow)"
                opacity={0.95}
              />
            );
          })()}
          {connectionPrompt && (() => {
            const from = endpointPoint(connectionPrompt.from);
            if (!from) return null;
            const toSide = oppositeSide(connectionPrompt.from.side);
            return (
              <path
                d={connectionPath(from, connectionPrompt.from.side, connectionPrompt.to, toSide)}
                fill="none"
                stroke={CONNECTION_COLOR}
                strokeWidth={2.5}
                strokeDasharray="7 7"
                strokeLinecap="round"
                markerEnd="url(#note-arrow)"
                opacity={0.95}
              />
            );
          })()}
        </svg>
        {connections.map((c) => {
          const pts = connectionPoints(c);
          if (!pts) return null;
          const isEditingLabel = editingConnectionId === c.id;
          const hasLabel = Boolean(c.label);
          if (!hasLabel && !isEditingLabel) return null;
          const color = connectionColor(c);
          const isLabelSelected = selectedConnectionLabelId === c.id;
          const labelValue = c.label ?? "";
          const labelDir = labelValue.trim() ? "auto" : "rtl";
          const labelRows = Math.min(6, Math.max(1, labelValue.split("\n").length));
          return (
            <div
              key={`label-${c.id}`}
              data-connection-label
              className={`connection-label-shell absolute z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-auto ${
                isLabelSelected ? "connection-label-shell-selected" : ""
              }`}
              style={{ left: pts.mid.x, top: pts.mid.y }}
              onPointerDown={(e) => e.stopPropagation()}
              onClick={(e) => {
                e.stopPropagation();
                setSelected(new Set());
                if (!selectedConnections.has(c.id)) {
                  setSelectedConnections(new Set([c.id]));
                  setSelectedConnectionLabelId(null);
                } else {
                  setSelectedConnectionLabelId(c.id);
                }
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                setSelected(new Set());
                setSelectedConnections(new Set([c.id]));
                setSelectedConnectionLabelId(c.id);
                setEditingConnectionId(c.id);
              }}
              onContextMenu={(e) => onConnectionContextMenu(e, c.id)}
            >
              {isEditingLabel ? (
                <textarea
                  autoFocus
                  dir={labelDir}
                  value={labelValue}
                  rows={labelRows}
                  className="connection-label-input"
                  style={{ borderColor: color, color }}
                  onChange={(e) => updateConnection(c.id, { label: e.target.value })}
                  onBlur={() => finishConnectionLabelEdit(c.id)}
                  onKeyDown={(e) => {
                    e.stopPropagation();
                    if (e.key === "Escape") {
                      e.preventDefault();
                      finishConnectionLabelEdit(c.id);
                    }
                  }}
                />
              ) : (
                <button
                  type="button"
                  className="connection-label"
                  dir={labelDir}
                  style={{ borderColor: color, color }}
                >
                  {labelValue}
                </button>
              )}
              {isLabelSelected && !isEditingLabel && (
                <button
                  type="button"
                  className="connection-label-delete"
                  title="پاک کردن نوشته اتصال"
                  onPointerDown={(e) => e.stopPropagation()}
                  onClick={(e) => {
                    e.stopPropagation();
                    clearConnectionLabel(c.id);
                  }}
                >
                  <Trash2 size={11} />
                </button>
              )}
            </div>
          );
        })}
        {notes.map((n) => (
          <NoteCard
            key={n.id}
            note={n}
            selected={selected.has(n.id)}
            zoom={zoomLabel}
            autoFocusId={autoFocusId}
            recentId={recentId}
            editing={editingId === n.id}
            onChange={updateNote}
            onDelete={(id) => deleteIds([id])}
            onRequestEdit={(id) => setEditingId(id)}
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
        onUndo={undoDelete}
        onRedo={redoDelete}
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

      <AnimatePresence>
        {deletePrompt && (
          <motion.div
            data-ui
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[95] flex items-center justify-center p-4"
            style={{ background: "rgba(4,6,10,.42)", backdropFilter: "blur(4px)" }}
            onPointerDown={cancelDelete}
          >
            <motion.div
              initial={{ opacity: 0, y: 16, scale: 0.94 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.96 }}
              className="glass rounded-3xl p-5 w-full max-w-sm shadow-2xl"
              onPointerDown={(e) => e.stopPropagation()}
            >
              <h3 className="text-[15px] font-extrabold mb-2">حذف یادداشت</h3>
              <p className="text-[12.5px] leading-6 mb-5" style={{ color: "var(--text-dim)" }}>
                {deletePrompt.length > 1
                  ? `آیا از حذف ${faNum(deletePrompt.length)} یادداشت مطمئن هستید؟`
                  : "آیا از حذف این یادداشت مطمئن هستید؟"}
              </p>
              <div className="flex items-center justify-end gap-2">
                <button
                  className="px-4 py-2 rounded-xl text-[13px] font-bold hover:bg-[var(--surface-2)] transition-colors cursor-pointer"
                  onClick={cancelDelete}
                >
                  لغو
                </button>
                <button
                  className="px-4 py-2 rounded-xl text-[13px] font-extrabold text-white bg-rose-500 hover:bg-rose-600 transition-colors cursor-pointer"
                  onClick={confirmDelete}
                >
                  حذف
                </button>
              </div>
            </motion.div>
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
