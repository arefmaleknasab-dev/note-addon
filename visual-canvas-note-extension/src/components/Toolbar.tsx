import { AnimatePresence, motion } from "framer-motion";
import {
  ClipboardCopy,
  Copy,
  Download,
  HelpCircle,
  Maximize,
  Moon,
  Plus,
  Sparkles,
  Sun,
  Trash2,
  X,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { faNum } from "../lib/constants";
import type { Theme } from "../types";

interface Props {
  zoom: number;
  theme: Theme;
  selectedCount: number;
  isExtension: boolean;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFit: () => void;
  onResetView: () => void;
  onAdd: () => void;
  onToggleTheme: () => void;
  onHelp: () => void;
  onCopySeparate: () => void;
  onCopyCombined: () => void;
  onDeleteSelected: () => void;
  onClearSelection: () => void;
}

const EXTENSION_PACKAGE_NAME = "persian-notes-extension.zip";

const withDownloadCacheBust = (event: React.MouseEvent<HTMLAnchorElement>) => {
  event.currentTarget.href = `${EXTENSION_PACKAGE_NAME}?v=${Date.now()}`;
};

const Divider = () => (
  <div className="w-px h-6 mx-1 shrink-0" style={{ background: "var(--border)" }} />
);

function TButton({
  title,
  onClick,
  children,
  accent,
}: {
  title: string;
  onClick: () => void;
  children: React.ReactNode;
  accent?: boolean;
}) {
  return (
    <button
      title={title}
      onClick={onClick}
      className={`icon-btn w-9 h-9 ${accent ? "!text-[var(--accent)]" : ""}`}
    >
      {children}
    </button>
  );
}

export default function Toolbar(p: Props) {
  return (
    <motion.header
      data-ui
      initial={{ opacity: 0, y: -26 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: "spring", stiffness: 260, damping: 26, delay: 0.1 }}
      className="fixed top-4 inset-x-0 z-[70] flex justify-center pointer-events-none px-3"
    >
      <div className="glass pointer-events-auto flex items-center gap-0.5 rounded-2xl px-2.5 py-1.5 shadow-2xl max-w-full overflow-x-auto">
        {/* brand */}
        <div className="flex items-center gap-2 pe-1 select-none">
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center shadow-lg"
            style={{ background: "linear-gradient(135deg,#f5a623,#e2761b)" }}
          >
            <Sparkles size={15} color="#1a1206" strokeWidth={2.4} />
          </div>
          <div className="leading-none">
            <div className="text-[13px] font-extrabold whitespace-nowrap">بوم یادداشت</div>
            <div className="text-[9.5px] mt-1 whitespace-nowrap" style={{ color: "var(--text-dim)" }}>
              {p.isExtension ? "نسخه‌ی افزونه‌ی کروم" : "پیش‌نمایش وب"}
            </div>
          </div>
        </div>

        <Divider />

        {/* zoom cluster */}
        <TButton title="کوچک‌نمایی" onClick={p.onZoomOut}>
          <ZoomOut size={16} />
        </TButton>
        <button
          title="بازنشانی نما (۱۰۰٪)"
          onClick={p.onResetView}
          className="text-[11.5px] font-bold tabular w-11 text-center cursor-pointer hover:opacity-100 transition-opacity"
          style={{ color: "var(--text)" }}
        >
          {faNum(Math.round(p.zoom * 100))}٪
        </button>
        <TButton title="بزرگ‌نمایی" onClick={p.onZoomIn}>
          <ZoomIn size={16} />
        </TButton>
        <TButton title="نمایش همه‌ی یادداشت‌ها" onClick={p.onFit}>
          <Maximize size={15} />
        </TButton>

        <Divider />

        <TButton title="یادداشت جدید (دابل‌کلیک روی بوم)" onClick={p.onAdd} accent>
          <Plus size={18} />
        </TButton>
        <TButton title={p.theme === "dark" ? "حالت روشن" : "حالت تاریک"} onClick={p.onToggleTheme}>
          {p.theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        </TButton>
        <TButton title="راهنما و نصب افزونه" onClick={p.onHelp}>
          <HelpCircle size={16} />
        </TButton>
        <a
          href={EXTENSION_PACKAGE_NAME}
          download={EXTENSION_PACKAGE_NAME}
          onClick={withDownloadCacheBust}
          title="دانلود آخرین فایل نصبی افزونه‌ی کروم"
          className="icon-btn w-9 h-9"
        >
          <Download size={16} />
        </a>

        {/* selection actions */}
        <AnimatePresence>
          {p.selectedCount > 0 && (
            <motion.div
              initial={{ width: 0, opacity: 0 }}
              animate={{ width: "auto", opacity: 1 }}
              exit={{ width: 0, opacity: 0 }}
              transition={{ type: "spring", stiffness: 380, damping: 34 }}
              className="flex items-center overflow-hidden"
            >
              <Divider />
              <span
                className="text-[11px] font-bold px-2 py-1 rounded-lg whitespace-nowrap"
                style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
              >
                {faNum(p.selectedCount)} انتخاب
              </span>
              <TButton title="کپی جداگانه‌ی هر یادداشت" onClick={p.onCopySeparate}>
                <Copy size={15} />
              </TButton>
              <TButton title="کپی یکجا در کلیپ‌بورد" onClick={p.onCopyCombined}>
                <ClipboardCopy size={15} />
              </TButton>
              <TButton title="حذف انتخاب‌شده‌ها" onClick={p.onDeleteSelected}>
                <Trash2 size={15} />
              </TButton>
              <TButton title="لغو انتخاب" onClick={p.onClearSelection}>
                <X size={16} />
              </TButton>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.header>
  );
}
