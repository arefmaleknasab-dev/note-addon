import { memo, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Bold,
  Code2,
  FileCode2,
  Image,
  Italic,
  Link,
  List,
  ListOrdered,
  Palette,
  Quote,
  Redo2,
  RemoveFormatting,
  Table,
  Trash2,
  Underline,
  Undo2,
  Video,
} from "lucide-react";
import type { ConnectionSide, Note, NoteOverflow } from "../types";
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
import { htmlToPlainText, plainTextToHtml, sanitizeCss, sanitizeHtml, scopeCss } from "../lib/richText";

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
  onContextMenu: (e: React.MouseEvent, id: string) => void;
  onInternalLink?: (noteId: string) => void;
  registerRef: (id: string, el: HTMLDivElement | null) => void;
  interactive: boolean;
}

type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

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

const connectorClass =
  "absolute z-30 w-4 h-4 rounded-full border-2 border-white/80 opacity-0 scale-75 transition-all cursor-crosshair group-hover/edge:opacity-100 group-hover/edge:scale-100";

const htmlTemplate = `<article dir="rtl">
  <h2>عنوان سند HTML</h2>
  <p>این یک <strong>یادداشت HTML</strong> مستقل است. متن، لیست، جدول، تصویر و کد را اینجا ویرایش کنید.</p>
  <ul>
    <li>آیتم اول</li>
    <li>آیتم دوم</li>
  </ul>
</article>`;

const defaultCss = `article { line-height: 1.8; }
h2 { margin: 0 0 8px; }
table { border-collapse: collapse; width: 100%; }
td, th { border: 1px solid currentColor; padding: 4px 8px; }`;

const fileToDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });

function toolbarButton(title: string, icon: ReactNode, onClick: () => void) {
  return (
    <button type="button" className="html-note-tool" title={title} onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {icon}
    </button>
  );
}

function HtmlNoteCard({
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
  onContextMenu,
  onInternalLink,
  registerRef,
  interactive,
}: Props) {
  const [hover, setHover] = useState(false);
  const [sourceMode, setSourceMode] = useState(false);
  const [sourceHtml, setSourceHtml] = useState(note.html || htmlTemplate);
  const [sourceCss, setSourceCss] = useState(note.css || defaultCss);
  const [pickerOpen, setPickerOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLInputElement>(null);
  const inputTimer = useRef<number | undefined>(undefined);
  const width = note.width ?? DEFAULT_NOTE_W;
  const height = note.height ?? DEFAULT_NOTE_H;
  const hex = colorHex(note.color);
  const safeHtml = useMemo(() => sanitizeHtml(note.html) || plainTextToHtml(note.text) || htmlTemplate, [note.html, note.text]);
  const scopedCss = useMemo(() => scopeCss(note.css || defaultCss, note.id), [note.css, note.id]);
  const overflow: NoteOverflow = note.overflow ?? "auto";

  useEffect(() => {
    if (autoFocusId === note.id) {
      const t = window.setTimeout(() => editorRef.current?.focus(), 80);
      return () => window.clearTimeout(t);
    }
  }, [autoFocusId, note.id]);

  useEffect(() => {
    if (!editing) {
      setSourceMode(false);
      if (editorRef.current) delete editorRef.current.dataset.loadedFor;
    }
  }, [editing]);

  useEffect(() => {
    if (!editing || sourceMode || !editorRef.current) return;
    if (editorRef.current.dataset.loadedFor === note.id) return;
    editorRef.current.innerHTML = safeHtml;
    editorRef.current.dataset.loadedFor = note.id;
  }, [editing, note.id, safeHtml, sourceMode]);

  useEffect(() => {
    if (sourceMode) {
      setSourceHtml(safeHtml);
      setSourceCss(note.css || defaultCss);
    }
  }, [note.css, safeHtml, sourceMode]);

  const commit = (html?: string, css?: string) => {
    const safe = sanitizeHtml(html ?? editorRef.current?.innerHTML ?? "") || "";
    const text = htmlToPlainText(safe);
    onChange(note.id, { html: safe, text, css: sanitizeCss(css ?? note.css) });
  };

  const scheduleCommit = () => {
    window.clearTimeout(inputTimer.current);
    commit();
  };

  const exec = (command: string, value?: string) => {
    editorRef.current?.focus();
    document.execCommand(command, false, value);
    scheduleCommit();
  };

  const insertHtml = (html: string) => {
    editorRef.current?.focus();
    document.execCommand("insertHTML", false, sanitizeHtml(html) || "");
    scheduleCommit();
  };

  const applySource = () => {
    const safe = sanitizeHtml(sourceHtml) || "";
    const css = sanitizeCss(sourceCss) || "";
    onChange(note.id, { html: safe, text: htmlToPlainText(safe), css });
    setSourceMode(false);
    window.setTimeout(() => {
      if (editorRef.current) {
        editorRef.current.innerHTML = safe;
        editorRef.current.dataset.loadedFor = note.id;
      }
    }, 0);
  };

  const insertLink = () => {
    const url = window.prompt("آدرس لینک یا #note-id:", "https://");
    if (!url) return;
    exec("createLink", url);
    const sel = window.getSelection();
    const anchor = sel?.anchorNode?.parentElement?.closest("a");
    if (anchor) {
      anchor.setAttribute("target", "_blank");
      anchor.setAttribute("rel", "noopener noreferrer");
    }
    scheduleCommit();
  };

  const insertImageUrl = () => {
    const url = window.prompt("آدرس تصویر:", "https://");
    if (!url) return;
    const alt = window.prompt("متن جایگزین:", "") || "";
    insertHtml(`<img src="${url}" alt="${alt}" style="max-width:100%;height:auto;" />`);
  };

  const insertMedia = (type: "video" | "audio") => {
    const url = window.prompt(type === "video" ? "آدرس ویدئو:" : "آدرس صوت:", "https://");
    if (!url) return;
    if (type === "video") insertHtml(`<video controls src="${url}" style="max-width:100%;height:auto;"></video>`);
    else insertHtml(`<audio controls src="${url}" style="width:100%;"></audio>`);
  };

  const insertTable = () => {
    insertHtml(`<table><thead><tr><th>عنوان</th><th>مقدار</th></tr></thead><tbody><tr><td>آیتم</td><td>۱۰۰</td></tr></tbody></table><p><br></p>`);
  };

  const insertCode = () => insertHtml(`<pre><code>code...</code></pre>`);
  const insertQuote = () => insertHtml(`<blockquote>نقل‌قول…</blockquote>`);

  const addTableRow = () => {
    const cell = window.getSelection()?.anchorNode?.parentElement?.closest("td,th");
    const row = cell?.closest("tr");
    if (!row) return insertTable();
    const clone = row.cloneNode(true) as HTMLTableRowElement;
    clone.querySelectorAll("td,th").forEach((c) => (c.textContent = ""));
    row.after(clone);
    scheduleCommit();
  };

  const addTableColumn = () => {
    const cell = window.getSelection()?.anchorNode?.parentElement?.closest("td,th") as HTMLTableCellElement | null;
    const table = cell?.closest("table");
    if (!table) return insertTable();
    const index = cell?.cellIndex ?? 0;
    table.querySelectorAll("tr").forEach((row) => {
      const ref = row.children[index];
      const tag = ref?.tagName.toLowerCase() === "th" ? "th" : "td";
      const next = document.createElement(tag);
      next.innerHTML = "&nbsp;";
      ref?.after(next);
    });
    scheduleCommit();
  };

  const mergeCells = () => {
    const cell = window.getSelection()?.anchorNode?.parentElement?.closest("td,th") as HTMLTableCellElement | null;
    const next = cell?.nextElementSibling as HTMLTableCellElement | null;
    if (!cell || !next) return;
    cell.colSpan = (cell.colSpan || 1) + (next.colSpan || 1);
    cell.innerHTML += " " + next.innerHTML;
    next.remove();
    scheduleCommit();
  };

  const splitCell = () => {
    const cell = window.getSelection()?.anchorNode?.parentElement?.closest("td,th") as HTMLTableCellElement | null;
    if (!cell || cell.colSpan <= 1) return;
    cell.colSpan -= 1;
    const next = document.createElement(cell.tagName.toLowerCase());
    next.innerHTML = "&nbsp;";
    cell.after(next);
    scheduleCommit();
  };

  const insertFile = async (file: File) => {
    const dataUrl = await fileToDataUrl(file);
    if (file.type.startsWith("image/")) insertHtml(`<img src="${dataUrl}" alt="${file.name}" title="${file.name}" style="max-width:100%;height:auto;" />`);
    else if (file.type.startsWith("video/")) insertHtml(`<video controls src="${dataUrl}" title="${file.name}" style="max-width:100%;height:auto;"></video>`);
    else if (file.type.startsWith("audio/")) insertHtml(`<audio controls src="${dataUrl}" title="${file.name}" style="width:100%;"></audio>`);
    else insertHtml(`<a href="${dataUrl}" download="${file.name}">${file.name}</a>`);
  };

  const uploadFile = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.multiple = true;
    input.accept = "image/*,video/*,audio/*";
    input.onchange = () => {
      Array.from(input.files ?? []).forEach((file) => void insertFile(file));
    };
    input.click();
  };

  const startResize = (e: React.PointerEvent, handle: ResizeHandle) => {
    e.stopPropagation();
    e.preventDefault();
    const startW = width;
    const startH = height;
    const startX = note.x;
    const startY = note.y;
    const sx = e.clientX;
    const sy = e.clientY;
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
      onChange(note.id, { x: Math.round(x), y: Math.round(y), width: Math.round(w), height: Math.round(h) });
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

  const edgeZone = (side: ConnectionSide, handle: ResizeHandle, className: string, dotClassName: string, cursor: string) => (
    <div data-resize data-nodrag className={`absolute z-30 group/edge ${className}`} style={{ cursor }} onPointerDown={(e) => startResize(e, handle)}>
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
        "absolute top-0 left-0 group html-note-card",
        editing ? "note-editing" : "cursor-grab active:cursor-grabbing",
        selected ? "note-selected z-20" : "z-10",
        hover ? "note-hovered" : "",
      ].join(" ")}
      style={{ transform: `translate3d(${note.x}px, ${note.y}px, 0)`, width, height, ["--na" as any]: hex, pointerEvents: interactive ? "auto" : "none" }}
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
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onContextMenu(e, note.id);
      }}
    >
      <style>{scopedCss}</style>
      <div className={[
        "note-inner html-note-inner relative rounded-2xl overflow-hidden h-full flex flex-col",
        recentId === note.id ? "pulse-ring" : "",
      ].join(" ")}>
        <div className="html-note-header flex items-center gap-1 ps-3 pe-2 pt-2.5 pb-1 cursor-grab active:cursor-grabbing touch-none shrink-0" onPointerDown={(e) => {
          if ((e.target as HTMLElement).closest("[data-nodrag]")) return;
          onDragStart(e, note.id);
        }}>
          <FileCode2 size={15} className="shrink-0 opacity-60" style={{ color: hex }} />
          <input
            ref={titleRef}
            data-nodrag={editing ? "true" : undefined}
            dir={note.title.trim() ? "auto" : "rtl"}
            value={note.title}
            placeholder="عنوان سند HTML…"
            style={{ textAlign: note.title.trim() ? undefined : "right" }}
            readOnly={!editing}
            tabIndex={editing ? 0 : -1}
            className={`note-title-input text-[14.5px] font-bold leading-6 px-1 ${editing ? "cursor-text" : "cursor-grab select-none"}`}
            onChange={(e) => onChange(note.id, { title: e.target.value })}
            onPointerDown={(e) => editing && e.stopPropagation()}
            spellCheck={false}
          />
          <div className="note-actions flex items-center gap-0.5" data-nodrag>
            <button className="icon-btn w-7 h-7" title="کپی" onClick={(e) => { e.stopPropagation(); onCopy(note.id); }} onPointerDown={(e) => e.stopPropagation()}><Code2 size={14} /></button>
            <button className="icon-btn w-7 h-7" title="رنگ" onClick={(e) => { e.stopPropagation(); setPickerOpen((v) => !v); }} onPointerDown={(e) => e.stopPropagation()}><Palette size={14} /></button>
            <button className="icon-btn w-7 h-7 hover:!text-rose-400" title="حذف" onClick={(e) => { e.stopPropagation(); onDelete(note.id); }} onPointerDown={(e) => e.stopPropagation()}><Trash2 size={14} /></button>
          </div>
        </div>

        {editing && !sourceMode && (
          <div data-nodrag className="html-note-toolbar flex flex-wrap items-center gap-1 px-3 py-1.5 border-y" style={{ borderColor: "var(--border)", background: "var(--surface-1)" }} onPointerDown={(e) => e.stopPropagation()}>
            {toolbarButton("Bold", <Bold size={13} />, () => exec("bold"))}
            {toolbarButton("Italic", <Italic size={13} />, () => exec("italic"))}
            {toolbarButton("Underline", <Underline size={13} />, () => exec("underline"))}
            {toolbarButton("Strike", <s className="text-[11px]">S</s>, () => exec("strikeThrough"))}
            {toolbarButton("UL", <List size={13} />, () => exec("insertUnorderedList"))}
            {toolbarButton("OL", <ListOrdered size={13} />, () => exec("insertOrderedList"))}
            {toolbarButton("RTL", <AlignRight size={13} />, () => exec("justifyRight"))}
            {toolbarButton("Center", <AlignCenter size={13} />, () => exec("justifyCenter"))}
            {toolbarButton("LTR", <AlignLeft size={13} />, () => exec("justifyLeft"))}
            {toolbarButton("Link", <Link size={13} />, insertLink)}
            {toolbarButton("Image", <Image size={13} />, insertImageUrl)}
            {toolbarButton("Upload", <Image size={13} />, uploadFile)}
            {toolbarButton("Video", <Video size={13} />, () => insertMedia("video"))}
            {toolbarButton("Audio", <Video size={13} />, () => insertMedia("audio"))}
            {toolbarButton("Table", <Table size={13} />, insertTable)}
            {toolbarButton("Row", <span className="text-[10px]">+R</span>, addTableRow)}
            {toolbarButton("Col", <span className="text-[10px]">+C</span>, addTableColumn)}
            {toolbarButton("Merge", <span className="text-[10px]">⇄</span>, mergeCells)}
            {toolbarButton("Split", <span className="text-[10px]">⇆</span>, splitCell)}
            {toolbarButton("Code", <Code2 size={13} />, insertCode)}
            {toolbarButton("Quote", <Quote size={13} />, insertQuote)}
            {toolbarButton("Undo", <Undo2 size={13} />, () => exec("undo"))}
            {toolbarButton("Redo", <Redo2 size={13} />, () => exec("redo"))}
            {toolbarButton("Clear", <RemoveFormatting size={13} />, () => exec("removeFormat"))}
            <select className="html-note-select" title="Heading" onChange={(e) => e.target.value && exec("formatBlock", e.target.value)} defaultValue="">
              <option value="">Block</option>
              <option value="p">P</option>
              <option value="h1">H1</option>
              <option value="h2">H2</option>
              <option value="h3">H3</option>
              <option value="pre">Pre</option>
            </select>
            <select className="html-note-select" title="Overflow" value={overflow} onChange={(e) => onChange(note.id, { overflow: e.target.value as NoteOverflow })}>
              <option value="auto">overflow auto</option>
              <option value="hidden">hidden</option>
              <option value="visible">visible</option>
              <option value="scroll">scroll</option>
            </select>
            <input type="color" title="Text color" className="html-note-color" onChange={(e) => exec("foreColor", e.target.value)} />
            <input type="color" title="Background" className="html-note-color" onChange={(e) => exec("hiliteColor", e.target.value)} />
            <button type="button" className="html-note-tool html-note-source-toggle" onMouseDown={(e) => e.preventDefault()} onClick={() => setSourceMode(true)}><FileCode2 size={13} /> HTML</button>
          </div>
        )}

        <div className="html-note-body flex-1 min-h-0 px-4 pb-3 pt-2" data-nodrag={editing ? "true" : undefined} onPointerDown={(e) => editing && e.stopPropagation()}>
          {sourceMode ? (
            <div className="h-full flex flex-col gap-2" data-nodrag>
              <textarea className="html-source-area flex-[2]" dir="ltr" value={sourceHtml} onChange={(e) => setSourceHtml(e.target.value)} />
              <textarea className="html-source-area flex-1" dir="ltr" value={sourceCss} placeholder="Scoped CSS for this note" onChange={(e) => setSourceCss(e.target.value)} />
              <div className="flex justify-end gap-2">
                <button className="html-note-action" onClick={() => setSourceMode(false)}>لغو</button>
                <button className="html-note-action html-note-action-primary" onClick={applySource}>اعمال HTML/CSS</button>
              </div>
            </div>
          ) : (
            <div
              ref={editorRef}
              data-html-note-content={note.id}
              className="html-document-editor rich-note-content"
              contentEditable={editing}
              suppressContentEditableWarning
              dir="auto"
              tabIndex={editing ? 0 : -1}
              style={{ overflow }}
              dangerouslySetInnerHTML={!editing ? { __html: safeHtml } : undefined}
              onInput={scheduleCommit}
              onBlur={() => commit()}
              onKeyDown={(e) => {
                if (!(e.ctrlKey || e.metaKey)) return;
                const key = e.key.toLowerCase();
                if (key === "b") { e.preventDefault(); exec("bold"); }
                else if (key === "i") { e.preventDefault(); exec("italic"); }
                else if (key === "u") { e.preventDefault(); exec("underline"); }
                else if (key === "k") { e.preventDefault(); insertLink(); }
              }}
              onPaste={(e) => {
                const html = e.clipboardData.getData("text/html");
                const files = Array.from(e.clipboardData.files || []);
                if (files.length) {
                  e.preventDefault();
                  files.forEach((file) => void insertFile(file));
                  return;
                }
                if (!html) return;
                e.preventDefault();
                insertHtml(html);
              }}
              onDrop={(e) => {
                const files = Array.from(e.dataTransfer.files || []);
                if (!files.length) return;
                e.preventDefault();
                files.forEach((file) => void insertFile(file));
              }}
              onClick={(e) => {
                const anchor = (e.target as HTMLElement).closest("a");
                if (!anchor) return;
                const href = anchor.getAttribute("href") || "";
                if (href.startsWith("#note-")) {
                  e.preventDefault();
                  onInternalLink?.(href.replace(/^#note-/, ""));
                } else if (!editing && href) {
                  e.preventDefault();
                  window.open(href, "_blank", "noopener,noreferrer");
                }
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-2 px-4 pb-2.5 shrink-0">
          <span className="text-[10px] rounded-full px-2 py-0.5" style={{ background: "var(--surface-2)", color: hex }}>HTML</span>
          <span className="text-[10.5px] tabular ms-auto" style={{ color: "var(--text-dim)" }}>{relativeTime(note.createdAt)}</span>
        </div>
      </div>

      {edgeZone("top", "n", "top-0 left-5 right-5 -translate-y-1/2 h-[18px]", "top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2", "ns-resize")}
      {edgeZone("right", "e", "right-0 top-5 bottom-5 translate-x-1/2 w-[18px]", "right-1/2 top-1/2 translate-x-1/2 -translate-y-1/2", "ew-resize")}
      {edgeZone("bottom", "s", "bottom-0 left-5 right-5 translate-y-1/2 h-[18px]", "bottom-1/2 left-1/2 -translate-x-1/2 translate-y-1/2", "ns-resize")}
      {edgeZone("left", "w", "left-0 top-5 bottom-5 -translate-x-1/2 w-[18px]", "left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2", "ew-resize")}
      <div data-nodrag className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity">
        {resizeHandles.filter((h) => h.id.length === 2).map((h) => (
          <button key={h.id} data-resize title="تغییر اندازه" className={`absolute pointer-events-auto rounded-lg ${h.className}`} style={{ cursor: h.cursor }} onPointerDown={(e) => startResize(e, h.id)} />
        ))}
      </div>

      {pickerOpen && (
        <>
          <div data-nodrag className="absolute z-30" style={{ inset: -1600 }} onPointerDown={(e) => { e.stopPropagation(); setPickerOpen(false); }} />
          <div data-nodrag className="absolute top-11 end-2 z-40 glass rounded-xl p-2 flex gap-1.5 shadow-2xl fade-up" onPointerDown={(e) => e.stopPropagation()}>
            {PALETTE.map((c) => (
              <button key={c.id} title={c.name} className="w-6 h-6 rounded-full transition-transform hover:scale-125 cursor-pointer" style={{ background: c.hex, boxShadow: note.color === c.id ? `0 0 0 2px var(--surface-solid), 0 0 0 4px ${c.hex}` : "inset 0 -2px 4px rgba(0,0,0,.25)" }} onClick={() => { onChange(note.id, { color: c.id }); setPickerOpen(false); }} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

export default memo(HtmlNoteCard, (prev, next) => {
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
