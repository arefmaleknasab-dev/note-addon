import { AnimatePresence, motion } from "framer-motion";
import type { LucideIcon } from "lucide-react";
import { PALETTE } from "../lib/constants";

export interface MenuEntry {
  type?: "item";
  icon: LucideIcon;
  label: string;
  hint?: string;
  danger?: boolean;
  onClick: () => void;
}
export type MenuRow =
  | MenuEntry
  | { type: "sep" }
  | { type: "swatches"; current: string; onPick: (id: string) => void }
  | { type: "label"; text: string };

interface Props {
  menu: { x: number; y: number; rows: MenuRow[] } | null;
  onClose: () => void;
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
          {menu.rows.map((row, i) => {
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
            const Icon = row.icon;
            return (
              <button
                key={i}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-[13px] font-medium text-start transition-colors cursor-pointer"
                style={{ color: row.danger ? "#fb7185" : "var(--text)" }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = row.danger
                    ? "rgba(251,113,133,.1)"
                    : "var(--surface-2)")
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                onClick={() => {
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
        </motion.div>
      )}
    </AnimatePresence>
  );
}
