import { memo, useEffect, useRef, useState } from "react";
import { Check, Copy, GripVertical, Palette, Trash2 } from "lucide-react";
import type { ConnectionSide, Note } from "../types";
import { colorHex, PALETTE } from "../lib/constants";
import {
  DEFAULT_NOTE_H,
  DEFAULT_NOTE_W,
  MAX_NOTE_H,
  MAX_NOTE_W,
  MIN_NOTE_H,
  MIN_NOTE_W,
  relativeTime,
} from "../lib/notes";

interface Props {
  note: Note;
  selected: boolean;
  zoom: number;
  autoFocusId: string | null;
  recentId: string | null;
  editing: boolean;
  onChange: (id: string, patch: Partial<Note>) => void;
  onDelete: (id: string) => void;
  onRequestEdit: (id: string) => void;
  onCopy: (id: string) => void;
  onDragStart: (e: React.PointerEvent, id: string) => void;
  onConnectorDragStart: (e: React.PointerEvent, id: string, side: ConnectionSide) => void;
  onEditorContextMenu: (
    e: React.MouseEvent<HTMLInputElement | HTMLTextAreaElement>,
    id: string,
    field: "title" | "text"
  ) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  interactive: boolean;
}

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const connectorClass =
  "absolute z-30 w-4 h-4 rounded-full border-2 border-white/80 opacity-0 scale-75 transition-all cursor-crosshair group-hover/edge:opacity-100 group-hover/edge:scale-100";

const resizeHandles: { id: ResizeHandle; className: string; cursor: string }[] = [
  { id: "n", className: "top-0 left-5 right-5 h-2 -translate-y-1/2", cursor: "ns-resize" },
  { id: "s", className: "bottom-0 left-5 right-5 h-2 translate-y-1/2", cursor: "ns-resize" },
  { id: "e", className: "right-0 top-5 bottom-5 w-2 translate-x-1/2", cursor: "ew-resize" },
  { id: "w", className: "left-0 top-5 bottom-5 w-2 -translate-x-1/2", cursor: "ew-resize" },
  { id: "ne", className: "right-0 top-0 w-5 h-5 translate-x-1/2 -translate-y-1/2", cursor: "nesw-resize" },
  { id: "nw", className: "left-0 top-0 w-5 h-5 -translate-x-1/2 -translate-y-1/2", cursor: "nwse-resize" },
  { id: "se", className: "right-0 bottom-0 w-5 h-5 translate-x-1/2 translate-y-1/2", cursor: "nwse-resize" },
  { id: "sw", className: "left-0 bottom-0 w-5 h-5 -translate-x-1/2 translate-y-1/2", cursor: "nesw-resize" },
];

function NoteCard({
  note,
  selected,
  zoom,
  autoFocusId,
  recentId,
  editing,
  onChange,
  onDelete,
  onCopy,
  onDragStart,
  onRequestEdit,
  onConnectorDragStart,
  onEditorContextMenu,
  onContextMenu,
  registerRef,
  interactive,
}: Props) {
  const [hover, setHover] = useState(false);
  const [copied, setCopied] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const hex = colorHex(note.color);
  const width = note.width ?? DEFAULT_NOTE_W;
  const height = note.height ?? DEFAULT_NOTE_H;

  useEffect(() => {
    if (autoFocusId === note.id) {
      const t = window.setTimeout(() => titleRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, [autoFocusId, note.id]);

  const startResize = (e: React.PointerEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    const startW = width;
    const startH = height;
    const startX = note.x;
    const startY = note.y;
    const sx = e.clientX;
    const sy = e.clientY;
    const el = wrapRef.current;
    let next = { x: startX, y: startY, width: startW, height: startH };

    const move = (ev: PointerEvent) => {
      const dx = (ev.clientX - sx) / zoom;
      const dy = (ev.clientY - sy) / zoom;
      let x = startX;
      let y = startY;
      let w = startW;
      let h = startH;

      if (handle.includes("e")) w = startW + dx;
      if (handle.includes("w")) {
        w = startW - dx;
        x = startX + dx;
      }
      if (handle.includes("s")) h = startH + dy;
      if (handle.includes("n")) {
        h = startH - dy;
        y = startY + dy;
      }

      if (w < MIN_NOTE_W) {
        if (handle.includes("w")) x -= MIN_NOTE_W - w;
        w = MIN_NOTE_W;
      }
      if (w > MAX_NOTE_W) {
        if (handle.includes("w")) x -= MAX_NOTE_W - w;
        w = MAX_NOTE_W;
      }
      if (h < MIN_NOTE_H) {
        if (handle.includes("n")) y -= MIN_NOTE_H - h;
        h = MIN_NOTE_H;
      }
      if (h > MAX_NOTE_H) {
        if (handle.includes("n")) y -= MAX_NOTE_H - h;
        h = MAX_NOTE_H;
      }

      next = { x, y, width: w, height: h };
      if (el) {
        el.style.width = `${w}px`;
        el.style.height = `${h}px`;
        el.style.transform = `translate3d(${x}px, ${y}px, 0)`;
      }
    };

    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onChange(note.id, {
        x: Math.round(next.x),
        y: Math.round(next.y),
        width: Math.round(next.width),
        height: Math.round(next.height),
      });
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };

  const handleCopy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    onCopy(note.id);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1400);
  };

  const openNoteMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onContextMenu(e, note.id);
  };

  const connectorDot = (side: ConnectionSide, className: string) => (
    <button
      data-connector
      data-nodrag
      title="کشیدن برای اتصال یادداشت‌ها"
      className={`${connectorClass} ${className}`}
      style={{ background: hex, boxShadow: `0 0 0 5px ${hex}26` }}
      onPointerDown={(e) => onConnectorDragStart(e, note.id, side)}
    />
  );

  const edgeZone = (
    side: ConnectionSide,
    handle: ResizeHandle,
    className: string,
    dotClassName: string,
    cursor: string
  ) => (
    <div
      data-resize
      data-nodrag
      className={`absolute z-30 group/edge ${className}`}
      style={{ cursor }}
      onPointerDown={(e) => startResize(e, handle)}
    >
      {connectorDot(side, dotClassName)}
    </div>
  );

  return (
    <div
      ref={(el) => {
        wrapRef.current = el;
        registerRef(note.id, el);
      }}
      data-note={note.id}
      data-editing={editing ? "true" : undefined}
      className={[
        "absolute top-0 left-0 group",
        editing ? "note-editing" : "cursor-grab active:cursor-grabbing",
        selected ? "note-selected z-20" : "z-10",
        hover ? "note-hovered" : "",
      ].join(" ")}
      style={{
        transform: `translate3d(${note.x}px, ${note.y}px, 0)`,
        width,
        height,
        ["--na" as any]: hex,
        pointerEvents: interactive ? "auto" : "none",
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onDoubleClick={(e) => {
        e.stopPropagation();
        onRequestEdit(note.id);
      }}
      onPointerDown={(e) => {
        if (editing) return;
        if ((e.target as HTMLElement).closest("[data-nodrag], button, a")) return;
        onDragStart(e, note.id);
      }}
      onWheel={(e) => {
        if (!editing) return;
        e.stopPropagation();
        if (!(e.target as HTMLElement).closest("textarea")) {
          e.preventDefault();
          if (bodyRef.current) bodyRef.current.scrollTop += e.deltaY;
        }
      }}
      onContextMenu={(e) => {
        if (editing && (e.target as HTMLElement).closest("input, textarea")) return;
        openNoteMenu(e);
      }}
    >
      <div
        className={[
          "note-inner relative rounded-2xl overflow-hidden h-full flex flex-col",
          recentId === note.id ? "pulse-ring" : "",
        ].join(" ")}
      >
        {/* header — drag handle */}
        <div
          className="flex items-center gap-1 ps-3 pe-2 pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none shrink-0"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
            onDragStart(e, note.id);
          }}
        >
          <GripVertical size={14} className="shrink-0 opacity-40" style={{ color: hex }} />
          <input
            ref={titleRef}
            data-editor
            data-nodrag={editing ? "true" : undefined}
            dir="auto"
            value={note.title}
            placeholder="عنوان یادداشت…"
            readOnly={!editing}
            tabIndex={editing ? 0 : -1}
            className="note-title-input text-[14.5px] font-bold leading-6 px-1"
            onChange={(e) => onChange(note.id, { title: e.target.value })}
            onContextMenu={(e) => (editing ? onEditorContextMenu(e, note.id, "title") : openNoteMenu(e))}
            onPointerDown={(e) => {
              if (editing) e.stopPropagation();
            }}
            spellCheck={false}
          />

          {/* hover actions */}
          <div className="note-actions flex items-center gap-0.5" data-nodrag>
            <button
              className="icon-btn w-7 h-7"
              title="کپی یادداشت"
              onClick={handleCopy}
              onPointerDown={(e) => e.stopPropagation()}
            >
              {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
            </button>
            <button
              className="icon-btn w-7 h-7"
              title="تغییر رنگ"
              onClick={(e) => {
                e.stopPropagation();
                setPickerOpen((v) => !v);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Palette size={14} />
            </button>
            <button
              className="icon-btn w-7 h-7 hover:!text-rose-400"
              title="حذف"
              onClick={(e) => {
                e.stopPropagation();
                onDelete(note.id);
              }}
              onPointerDown={(e) => e.stopPropagation()}
            >
              <Trash2 size={14} />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="px-4 pb-2 flex-1 min-h-0">
          <textarea
            ref={bodyRef}
            data-editor
            data-nodrag={editing ? "true" : undefined}
            dir="auto"
            value={note.text}
            placeholder="متن خود را بنویسید…"
            readOnly={!editing}
            tabIndex={editing ? 0 : -1}
            className="note-body-input text-[13px] leading-6 h-full min-h-[46px] overflow-y-auto"
            rows={2}
            onChange={(e) => onChange(note.id, { text: e.target.value })}
            onContextMenu={(e) => (editing ? onEditorContextMenu(e, note.id, "text") : openNoteMenu(e))}
            onPointerDown={(e) => {
              if (editing) e.stopPropagation();
            }}
            spellCheck={false}
          />
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 px-4 pb-2.5 -mt-0.5 shrink-0">
          <span className="text-[10.5px] tabular ms-auto" style={{ color: "var(--text-dim)" }}>
            {relativeTime(note.createdAt)}
          </span>
        </div>
      </div>

      {/* side lines: resize on drag, show connection dot only while hovering that side */}
      {edgeZone(
        "top",
        "n",
        "top-0 left-5 right-5 -translate-y-1/2 h-[18px]",
        "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2",
        "ns-resize"
      )}
      {edgeZone(
        "right",
        "e",
        "right-0 top-5 bottom-5 translate-x-1/2 w-[18px]",
        "right-1/2 top-1/2 translate-x-1/2 -translate-y-1/2",
        "ew-resize"
      )}
      {edgeZone(
        "bottom",
        "s",
        "bottom-0 left-5 right-5 translate-y-1/2 h-[18px]",
        "bottom-1/2 left-1/2 -translate-x-1/2 translate-y-1/2",
        "ns-resize"
      )}
      {edgeZone(
        "left",
        "w",
        "left-0 top-5 bottom-5 -translate-x-1/2 w-[18px]",
        "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2",
        "ew-resize"
      )}

      {/* corner resize grips */}
      <div data-nodrag className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        {resizeHandles.filter((h) => h.id.length === 2).map((h) => (
          <button
            key={h.id}
            data-resize
            title="تغییر اندازه"
            className={`absolute pointer-events-auto rounded-lg ${h.className}`}
            style={{ cursor: h.cursor }}
            onPointerDown={(e) => startResize(e, h.id)}
          />
        ))}
      </div>

      {/* color picker popover (outside the clipped card) */}
      {pickerOpen && (
        <>
          <div
            data-nodrag
            className="absolute z-30"
            style={{ inset: -1600 }}
            onPointerDown={(e) => {
              e.stopPropagation();
              setPickerOpen(false);
            }}
          />
          <div
            data-nodrag
            className="absolute top-11 end-2 z-40 glass rounded-xl p-2 flex gap-1.5 shadow-2xl fade-up"
            onPointerDown={(e) => e.stopPropagation()}
          >
            {PALETTE.map((c) => (
              <button
                key={c.id}
                title={c.name}
                className="w-6 h-6 rounded-full transition-transform hover:scale-125 cursor-pointer"
                style={{
                  background: c.hex,
                  boxShadow:
                    note.color === c.id
                      ? `0 0 0 2px var(--surface-solid), 0 0 0 4px ${c.hex}`
                      : "inset 0 -2px 4px rgba(0,0,0,.25)",
                }}
                onClick={() => {
                  onChange(note.id, { color: c.id });
                  setPickerOpen(false);
                }}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(NoteCard, (prev, next) => {
  return (
    prev.note === next.note &&
    prev.selected === next.selected &&
    prev.zoom === next.zoom &&
    prev.autoFocusId === next.autoFocusId &&
    prev.recentId === next.recentId &&
    prev.editing === next.editing &&
    prev.interactive === next.interactive
  );
});
