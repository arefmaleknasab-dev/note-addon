import { memo, useEffect, useRef, useState } from "react";
import { Check, Copy, GripVertical, Palette, Trash2 } from "lucide-react";
import type { Note } from "../types";
import { colorHex, PALETTE } from "../lib/constants";
import { relativeTime } from "../lib/notes";

interface Props {
  note: Note;
  selected: boolean;
  zoom: number;
  autoFocusId: string | null;
  recentId: string | null;
  onChange: (id: string, patch: Partial<Note>) => void;
  onDelete: (id: string) => void;
  onCopy: (id: string) => void;
  onDragStart: (e: React.PointerEvent, id: string) => void;
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  interactive: boolean;
}

function NoteCard({
  note,
  selected,
  zoom,
  autoFocusId,
  recentId,
  onChange,
  onDelete,
  onCopy,
  onDragStart,
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

  const autoGrow = (el: HTMLTextAreaElement | null) => {
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  };

  useEffect(() => {
    autoGrow(bodyRef.current);
  }, [note.text, note.width]);

  useEffect(() => {
    if (autoFocusId === note.id) {
      const t = window.setTimeout(() => titleRef.current?.focus(), 60);
      return () => window.clearTimeout(t);
    }
  }, [autoFocusId, note.id]);

  /* ---- width resize from the LEFT edge (right edge stays anchored) ---- */
  const startResize = (e: React.PointerEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const startW = note.width;
    const startNoteX = note.x;
    const startX = e.clientX;
    const el = wrapRef.current;
    let w = startW;
    let nx = startNoteX;
    const move = (ev: PointerEvent) => {
      // RTL: کشیدن دستگیره به چپ → بزرگ‌تر، به راست → کوچک‌تر
      const deltaW = (startX - ev.clientX) / zoom;
      w = Math.min(520, Math.max(230, startW + deltaW));
      nx = startNoteX - (w - startW); // لبه‌ی راست ثابت می‌ماند
      if (el) {
        el.style.width = w + "px";
        el.style.transform = `translate3d(${nx}px, ${note.y}px, 0)`;
      }
      autoGrow(bodyRef.current);
    };
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      onChange(note.id, { width: Math.round(w), x: Math.round(nx) });
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

  return (
    <div
      ref={(el) => {
        wrapRef.current = el;
        registerRef(note.id, el);
      }}
      data-note={note.id}
      className={[
        "absolute top-0 left-0 group",
        selected ? "note-selected z-20" : "z-10",
        hover ? "note-hovered" : "",
      ].join(" ")}
      style={{
        transform: `translate3d(${note.x}px, ${note.y}px, 0)`,
        width: note.width,
        ["--na" as any]: hex,
        pointerEvents: interactive ? "auto" : "none",
      }}
      onPointerEnter={() => setHover(true)}
      onPointerLeave={() => setHover(false)}
      onContextMenu={(e) => {
        if ((e.target as HTMLElement).closest("input, textarea")) return; // native edit menu
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, note.id);
      }}
    >
      <div
        className={[
          "note-inner relative rounded-2xl overflow-hidden",
          recentId === note.id ? "pulse-ring" : "",
        ].join(" ")}
      >
        {/* header — drag handle */}
        <div
          className="flex items-center gap-1 ps-3 pe-2 pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none"
          onPointerDown={(e) => {
            if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
            onDragStart(e, note.id);
          }}
        >
          <GripVertical size={14} className="shrink-0 opacity-40" style={{ color: hex }} />
          <input
            ref={titleRef}
            data-nodrag
            dir="auto"
            value={note.title}
            placeholder="عنوان یادداشت…"
            className="note-title-input text-[14.5px] font-bold leading-6 px-1"
            onChange={(e) => onChange(note.id, { title: e.target.value })}
            onPointerDown={(e) => e.stopPropagation()}
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
        <div className="px-4 pb-2">
          <textarea
            ref={bodyRef}
            dir="auto"
            value={note.text}
            placeholder="متن خود را بنویسید…"
            className="note-body-input text-[13px] leading-6 min-h-[46px]"
            rows={2}
            onChange={(e) => {
              onChange(note.id, { text: e.target.value });
              autoGrow(e.target);
            }}
            onPointerDown={(e) => e.stopPropagation()}
            spellCheck={false}
          />
        </div>

        {/* footer */}
        <div className="flex items-center gap-2 px-4 pb-2.5 -mt-0.5">
          <span className="text-[10.5px] tabular ms-auto" style={{ color: "var(--text-dim)" }}>
            {relativeTime(note.createdAt)}
          </span>
        </div>

        {/* resize grip (bottom-left in RTL grows width) */}
        <div
          className="absolute bottom-0 left-0 w-5 h-5 cursor-nesw-resize opacity-0 group-hover:opacity-100 transition-opacity"
          onPointerDown={startResize}
          title="تغییر اندازه"
        >
          <svg viewBox="0 0 10 10" className="absolute bottom-1.5 left-1.5 w-2.5 h-2.5 opacity-60">
            <path d="M9 1 L1 9 M9 5 L5 9" stroke={hex} strokeWidth="1.4" strokeLinecap="round" fill="none" />
          </svg>
        </div>
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
    prev.interactive === next.interactive
  );
});
