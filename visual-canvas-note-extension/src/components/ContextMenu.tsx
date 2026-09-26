import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ChevronLeft } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { PALETTE } from "../lib/constants";

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
  | { type: "swatches"; current: string; onPick: (id: string) => void }
  | { type: "label"; text: string }
  | { type: "submenu"; icon: LucideIcon; label: string; rows: MenuRow[]; disabled?: boolean };

interface Props {
  menu: { x: number; y: number; rows: MenuRow[] } | null;
  onClose: () => void;
}

function MenuRows({ rows, onClose }: { rows: MenuRow[]; onClose: () => void }) {
  const [activeSubmenu, setActiveSubmenu] = useState<number | null>(null);

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
        if (row.type === "swatches")
          return (
            <div key={i} className="flex items-center gap-1.5 px-3 py-2">
              {PALETTE.map((c) => (
                <button
                  key={c.id}
                  title={c.name}
                  className="w-[18px] h-[18px] rounded-full transition-transform hover:scale-125 cursor-pointer"
                  style={{
                    background: c.hex,
                    boxShadow:
                      row.current === c.id
                        ? `0 0 0 2px var(--surface-solid), 0 0 0 4px ${c.hex}`
                        : "inset 0 -2px 3px rgba(0,0,0,.22)",
                  }}
                  onClick={() => {
                    row.onPick(c.id);
                    onClose();
                  }}
                />
              ))}
            </div>
          );

        if (row.type === "submenu") {
          const Icon = row.icon;
          const disabled = Boolean(row.disabled);
          return (
            <div
              key={i}
              className="relative"
              onMouseEnter={() => !disabled && setActiveSubmenu(i)}
              onMouseLeave={() => setActiveSubmenu((v) => (v === i ? null : v))}
            >
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-start transition-colors"
                style={{
                  color: disabled ? "var(--text-dim)" : "var(--text)",
                  opacity: disabled ? 0.45 : 1,
                  cursor: disabled ? "not-allowed" : "default",
                  background: activeSubmenu === i ? "var(--surface-2)" : "transparent",
                }}
                disabled={disabled}
              >
                <Icon size={15} className="shrink-0 opacity-80" />
                <span className="flex-1 leading-5">{row.label}</span>
                <ChevronLeft size={14} className="shrink-0 opacity-70" />
              </button>
              <AnimatePresence>
                {activeSubmenu === i && !disabled && (
                  <motion.div
                    initial={{ opacity: 0, x: 8, scale: 0.98 }}
                    animate={{ opacity: 1, x: 0, scale: 1 }}
                    exit={{ opacity: 0, x: 5, scale: 0.98 }}
                    transition={{ duration: 0.12 }}
                    className="absolute top-0 z-[82] glass rounded-2xl p-1.5 min-w-[210px] shadow-2xl"
                    style={{ right: "calc(100% + 6px)" }}
                  >
                    <MenuRows rows={row.rows} onClose={onClose} />
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        }

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

export default function ContextMenu({ menu, onClose }: Props) {
  return (
    <AnimatePresence>
      {menu && (
        <motion.div
          key="ctx"
          data-ui
          initial={{ opacity: 0, scale: 0.92, y: -6 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: -4 }}
          transition={{ duration: 0.16, ease: [0.22, 1.2, 0.36, 1] }}
          className="fixed z-[80] glass rounded-2xl p-1.5 min-w-[228px] shadow-2xl"
          style={{ left: menu.x, top: menu.y, transformOrigin: "top right" }}
          onContextMenu={(e) => e.preventDefault()}
        >
          <MenuRows rows={menu.rows} onClose={onClose} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
