import { AnimatePresence, motion } from "framer-motion";
import {
  AppWindow,
  Download,
  FolderOpen,
  Globe,
  Hand,
  Keyboard,
  MousePointer2,
  PackageOpen,
  ToggleRight,
  X,
  ZoomIn,
} from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
}

const EXTENSION_PACKAGE_NAME = "persian-notes-extension.zip";

const withDownloadCacheBust = (event: React.MouseEvent<HTMLAnchorElement>) => {
  event.currentTarget.href = `${EXTENSION_PACKAGE_NAME}?v=${Date.now()}`;
};

const steps = [
  { icon: Download, text: "فایل به‌روز «persian-notes-extension.zip» را از دکمه‌ی دانلود در نوار ابزار دریافت کن." },
  { icon: FolderOpen, text: "فایل زیپ را در یک پوشه از حالت فشرده خارج کن (Extract)." },
  { icon: Globe, text: "در کروم به آدرس chrome://extensions برو." },
  { icon: ToggleRight, text: "گزینه‌ی «حالت توسعه‌دهنده / Developer mode» را از بالای صفحه فعال کن." },
  { icon: PackageOpen, text: "روی «Load unpacked» کلیک کن و پوشه‌ی استخراج‌شده را انتخاب کن." },
  { icon: MousePointer2, text: "تمام! از این پس تب جدید، بوم یادداشت توست و راست‌کلیک روی متن انتخاب‌شده گزینه‌ی «افزودن به یادداشت‌ها» دارد." },
];

const shortcuts: { keys: string[]; label: string }[] = [
  { keys: ["اسکرول"], label: "بزرگ‌نمایی / کوچک‌نمایی به سمت نشانگر" },
  { keys: ["راست‌کلیک", "درگ"], label: "جابه‌جایی بوم (Pan)" },
  { keys: ["چپ‌کلیک", "درگ"], label: "کشیدن کادر انتخاب روی فضای خالی" },
  { keys: ["دابل‌کلیک"], label: "ساخت یادداشت جدید در محل نشانگر" },
  { keys: ["Ctrl", "کلیک"], label: "افزودن/حذف یک یادداشت به انتخاب" },
  { keys: ["Ctrl", "A"], label: "انتخاب همه‌ی یادداشت‌ها" },
  { keys: ["Delete"], label: "حذف یادداشت‌های انتخاب‌شده" },
  { keys: ["Esc"], label: "لغو انتخاب / بستن منوها" },
];

export default function HelpModal({ open, onClose }: Props) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          data-ui
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[85] flex items-center justify-center p-4"
          style={{ background: "rgba(4,6,10,.55)", backdropFilter: "blur(6px)" }}
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.94, y: 18 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 10 }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className="glass rounded-3xl max-w-2xl w-full max-h-[85vh] overflow-y-auto shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            style={{ background: "var(--surface)" }}
          >
            <div className="flex items-center gap-3 px-6 pt-5 pb-3 sticky top-0 z-10" style={{ background: "var(--surface)", backdropFilter: "blur(18px)" }}>
              <div
                className="w-10 h-10 rounded-2xl flex items-center justify-center"
                style={{ background: "linear-gradient(135deg,#f5a623,#e2761b)" }}
              >
                <AppWindow size={18} color="#1a1206" />
              </div>
              <div className="flex-1">
                <h2 className="text-[16px] font-extrabold">نصب افزونه و راهنمای استفاده</h2>
                <p className="text-[11.5px]" style={{ color: "var(--text-dim)" }}>
                  در چند قدم ساده، بوم یادداشت را به کروم اضافه کن
                </p>
              </div>
              <button className="icon-btn w-9 h-9" onClick={onClose} title="بستن">
                <X size={17} />
              </button>
            </div>

            <div className="px-6 pb-6 grid gap-6 md:grid-cols-2">
              {/* install */}
              <section>
                <h3 className="text-[12.5px] font-bold mb-3 flex items-center gap-2" style={{ color: "var(--accent)" }}>
                  <Download size={14} /> مراحل نصب
                </h3>
                <ol className="space-y-2.5">
                  {steps.map((s, i) => (
                    <li key={i} className="flex items-start gap-3 text-[12.5px] leading-6" style={{ color: "var(--text)" }}>
                      <span
                        className="shrink-0 w-6 h-6 rounded-lg flex items-center justify-center mt-0.5"
                        style={{ background: "var(--accent-soft)", color: "var(--accent)" }}
                      >
                        <s.icon size={13} />
                      </span>
                      <span>
                        <b className="tabular" style={{ color: "var(--accent)" }}>
                          {(i + 1).toLocaleString("fa-IR")}.{" "}
                        </b>
                        {s.text}
                      </span>
                    </li>
                  ))}
                </ol>
                <a
                  href={EXTENSION_PACKAGE_NAME}
                  download={EXTENSION_PACKAGE_NAME}
                  onClick={withDownloadCacheBust}
                  className="mt-4 inline-flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] font-bold text-[#1a1206] transition-transform hover:scale-[1.03] active:scale-95"
                  style={{ background: "linear-gradient(135deg,#f5a623,#e2761b)" }}
                >
                  <Download size={15} /> دانلود آخرین فایل نصبی افزونه
                </a>
                <p className="mt-3 text-[11.5px] leading-6" style={{ color: "var(--text-dim)" }}>
                  در حالت پیش‌نمایش، بعد از هر تغییر پروژه فایل نصبی به‌صورت خودکار دوباره ساخته می‌شود؛
                  دکمه‌ی دانلود همیشه آخرین نسخه را می‌دهد. برای اطمینان، یک نسخه‌ی به‌روز از همین فایل در
                  ریشه‌ی پوشه‌ی پروژه هم ساخته می‌شود تا از GitHub هم قابل دریافت باشد.
                </p>
              </section>

              {/* shortcuts */}
              <section>
                <h3 className="text-[12.5px] font-bold mb-3 flex items-center gap-2" style={{ color: "var(--accent)" }}>
                  <Keyboard size={14} /> میانبرها
                </h3>
                <ul className="space-y-2">
                  {shortcuts.map((s, i) => (
                    <li key={i} className="flex items-center justify-between gap-3 text-[12px] py-1.5 border-b last:border-0" style={{ borderColor: "var(--border)", color: "var(--text)" }}>
                      <span style={{ color: "var(--text-dim)" }}>{s.label}</span>
                      <span className="flex items-center gap-1 shrink-0" dir="ltr">
                        {s.keys.map((k) => (
                          <kbd key={k} className="kbd">
                            {k}
                          </kbd>
                        ))}
                      </span>
                    </li>
                  ))}
                </ul>
                <div className="mt-4 rounded-2xl p-3.5 text-[11.5px] leading-6 flex gap-2.5" style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
                  <ZoomIn size={15} className="shrink-0 mt-1" style={{ color: "var(--accent)" }} />
                  <span>
                    بعد از نصب، کافی است در هر صفحه‌ی وب متنی را انتخاب کنی و از منوی راست‌کلیک گزینه‌ی
                    «افزودن به یادداشت‌ها» را بزنی؛ متن به‌صورت خودکار روی بوم ظاهر می‌شود — حتی اگر کروم
                    بسته شود، یادداشت‌ها در حافظه می‌مانند.
                  </span>
                </div>
                <div className="mt-3 rounded-2xl p-3.5 text-[11.5px] leading-6 flex gap-2.5" style={{ background: "var(--surface-2)", color: "var(--text-dim)" }}>
                  <Hand size={15} className="shrink-0 mt-1" style={{ color: "var(--accent)" }} />
                  <span>
                    نکته: با انتخاب چند یادداشت و باز کردن منوی راست‌کلیک، «کپی جداگانه» هر یادداشت را به‌عنوان
                    یک ورودی مجزا در حافظه‌ی کلیپ‌بورد (مثلاً Win+V در ویندوز) قرار می‌دهد.
                  </span>
                </div>
              </section>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
