import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PALETTE, type PaletteColor } from "../lib/constants";

export interface MenuEntry {
  type?: "item";
  icon: LucideIcon;
  label: string;
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  onClick: () => void;
}

export type MenuRow =
  | MenuEntry
  | { type: "sep" }
  | { type: "swatches"; current: string; onPick: (id: string) => void; colors?: PaletteColor[] }
  | { type: "label"; text: string }
  | { type: "submenu"; icon: LucideIcon; label: string; rows: MenuRow[]; disabled?: boolean };

interface Props {
  menu: { x: number; y: number; rows: MenuRow[] } | null;
  onClose: () => void;
}

const MENU_MARGIN = 8;
const ROOT_MIN_WIDTH = 228;
const SUBMENU_MIN_WIDTH = 210;
const SUBMENU_GAP = 6;

type MenuPoint = { x: number; y: number };

const clampCoord = (value: number, min: number, max: number) => {
  const safeMax = Math.max(min, max);
  return Math.min(safeMax, Math.max(min, value));
};

const estimateMenuHeight = (rows: MenuRow[]) => {
  const content = rows.reduce((sum, row) => {
    if (row.type === "sep") return sum + 9;
    if (row.type === "label") return sum + 24;
    if (row.type === "swatches") return sum + 38;
    return sum + 37;
  }, 12);
  return Math.min(content, Math.max(160, window.innerHeight - MENU_MARGIN * 2));
};

const placeMenu = (x: number, y: number, width: number, height: number): MenuPoint => ({
  x: clampCoord(x, MENU_MARGIN, window.innerWidth - width - MENU_MARGIN),
  y: clampCoord(y, MENU_MARGIN, window.innerHeight - height - MENU_MARGIN),
});

const placeSubmenu = (trigger: DOMRect, width: number, height: number): MenuPoint => {
  const leftX = trigger.left - width - SUBMENU_GAP;
  const rightX = trigger.right + SUBMENU_GAP;
  const hasLeftRoom = leftX >= MENU_MARGIN;
  const hasRightRoom = rightX + width <= window.innerWidth - MENU_MARGIN;
  const preferLeft = hasLeftRoom || (!hasRightRoom && trigger.left > window.innerWidth - trigger.right);
  const x = preferLeft ? leftX : rightX;
  return placeMenu(x, trigger.top, width, height);
};

function MenuRows({ rows, onClose }: { rows: MenuRow[]; onClose: () => void }) {
  return (
    <>
      {rows.map((row, i) => {
        if (row.type === "sep")
          return <div key={i} className="my-1 mx-2 h-px" style={{ background: "var(--border)" }} />;
        if (row.type === "label")
          return (
            <div key={i} className="px-3 pt-1.5 pb-0.5 text-[10.5px] font-semibold" style={{ color: "var(--text-dim)" }}>
              {row.text}
            </div>
          );
        if (row.type === "swatches") {
          const colors = row.colors ?? PALETTE;
          return (
            <div key={i} className="flex items-center gap-1.5 px-3 py-2">
              {colors.map((c) => {
                const isCurrent = row.current === c.id || row.current.toLowerCase() === c.hex.toLowerCase();
                return (
                  <button
                    key={c.id}
                    title={c.name}
                    className="w-[18px] h-[18px] rounded-full transition-transform hover:scale-125 cursor-pointer"
                    style={{
                      background: c.hex,
                      boxShadow: isCurrent
                        ? `0 0 0 2px var(--surface-solid), 0 0 0 4px ${c.hex}`
                        : "inset 0 -2px 3px rgba(0,0,0,.22)",
                    }}
                    onClick={() => {
                      row.onPick(c.id);
                      onClose();
                    }}
                  />
                );
              })}
            </div>
          );
        }

        if (row.type === "submenu") return <SubmenuRow key={i} row={row} onClose={onClose} />;

        const Icon = row.icon;
        const disabled = Boolean(row.disabled);
        return (
          <button
            key={i}
            disabled={disabled}
            className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-start transition-colors"
            style={{
              color: disabled ? "var(--text-dim)" : row.danger ? "#fb7185" : "var(--text)",
              opacity: disabled ? 0.45 : 1,
              cursor: disabled ? "not-allowed" : "pointer",
            }}
            onMouseEnter={(e) => {
              if (disabled) return;
              e.currentTarget.style.background = row.danger ? "rgba(251,113,133,.1)" : "var(--surface-2)";
            }}
            onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
            onClick={() => {
              if (disabled) return;
              row.onClick();
              onClose();
            }}
          >
            <Icon size={15} className="shrink-0 opacity-80" />
            <span className="flex-1 leading-5">{row.label}</span>
            {row.hint && (
              <span className="text-[10px] tabular" style={{ color: "var(--text-dim)" }}>
                {row.hint}
              </span>
            )}
          </button>
        );
      })}
    </>
  );
}

function SubmenuRow({
  row,
  onClose,
}: {
  row: Extract<MenuRow, { type: "submenu" }>;
  onClose: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<MenuPoint>({ x: MENU_MARGIN, y: MENU_MARGIN });
  const triggerRef = useRef<HTMLDivElement>(null);
  const submenuRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | undefined>(undefined);
  const Icon = row.icon;
  const disabled = Boolean(row.disabled);

  const updatePosition = (measured = false) => {
    const trigger = triggerRef.current?.getBoundingClientRect();
    if (!trigger) return;
    const rect = measured ? submenuRef.current?.getBoundingClientRect() : null;
    const width = Math.max(rect?.width || 0, SUBMENU_MIN_WIDTH);
    const height = Math.max(rect?.height || 0, estimateMenuHeight(row.rows));
    setPosition(placeSubmenu(trigger, width, height));
  };

  const cancelClose = () => {
    window.clearTimeout(closeTimer.current);
  };

  const openMenu = () => {
    if (disabled) return;
    cancelClose();
    updatePosition(false);
    setOpen(true);
  };

  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = window.setTimeout(() => setOpen(false), 120);
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition(true);
    const onResize = () => updatePosition(true);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, [open, row.rows]);

  return (
    <div
      ref={triggerRef}
      className="relative"
      onMouseEnter={openMenu}
      onMouseLeave={scheduleClose}
    >
      <button
        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-start transition-colors"
        style={{
          color: disabled ? "var(--text-dim)" : "var(--text)",
          opacity: disabled ? 0.45 : 1,
          cursor: disabled ? "not-allowed" : "default",
          background: open ? "var(--surface-2)" : "transparent",
        }}
        disabled={disabled}
      >
        <Icon size={15} className="shrink-0 opacity-80" />
        <span className="flex-1 leading-5">{row.label}</span>
        <ChevronLeft size={14} className="shrink-0 opacity-70" />
      </button>
      {createPortal(
        <AnimatePresence>
          {open && !disabled && (
            <motion.div
              ref={submenuRef}
              data-ui
              initial={{ opacity: 0, x: 8, scale: 0.98 }}
              animate={{ opacity: 1, x: 0, scale: 1 }}
              exit={{ opacity: 0, x: 5, scale: 0.98 }}
              transition={{ duration: 0.12 }}
              className="fixed z-[82] glass rounded-2xl p-1.5 min-w-[210px] shadow-2xl"
              style={{
                left: position.x,
                top: position.y,
                maxHeight: `calc(100vh - ${MENU_MARGIN * 2}px)`,
                overflowY: "auto",
              }}
              onMouseEnter={cancelClose}
              onMouseLeave={scheduleClose}
              onContextMenu={(e) => e.preventDefault()}
            >
              <MenuRows rows={row.rows} onClose={onClose} />
            </motion.div>
          )}
        </AnimatePresence>,
        document.body
      )}
    </div>
  );
}

function ContextMenuPanel({ menu, onClose }: { menu: NonNullable<Props["menu"]>; onClose: () => void }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState(() => placeMenu(menu.x, menu.y, ROOT_MIN_WIDTH, estimateMenuHeight(menu.rows)));

  useLayoutEffect(() => {
    const updatePosition = () => {
      const rect = rootRef.current?.getBoundingClientRect();
      setPosition(
        placeMenu(
          menu.x,
          menu.y,
          Math.max(rect?.width || 0, ROOT_MIN_WIDTH),
          Math.max(rect?.height || 0, estimateMenuHeight(menu.rows))
        )
      );
    };
    updatePosition();
    window.addEventListener("resize", updatePosition);
    return () => window.removeEventListener("resize", updatePosition);
  }, [menu.x, menu.y, menu.rows]);

  return (
    <motion.div
      ref={rootRef}
      key="ctx"
      data-ui
      initial={{ opacity: 0, scale: 0.92, y: -6 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.16, ease: [0.22, 1.2, 0.36, 1] }}
      className="fixed z-[80] glass rounded-2xl p-1.5 min-w-[228px] shadow-2xl"
      style={{
        left: position.x,
        top: position.y,
        maxHeight: `calc(100vh - ${MENU_MARGIN * 2}px)`,
        overflowY: "auto",
        overflowX: "visible",
        transformOrigin: "top right",
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <MenuRows rows={menu.rows} onClose={onClose} />
    </motion.div>
  );
}

export default function ContextMenu({ menu, onClose }: Props) {
  return (
    <AnimatePresence>
      {menu && <ContextMenuPanel menu={menu} onClose={onClose} />}
    </AnimatePresence>
  );
}
