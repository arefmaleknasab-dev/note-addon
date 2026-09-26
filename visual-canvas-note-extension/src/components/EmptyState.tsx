import { motion } from "framer-motion";
import { MousePointerClick, Plus, StickyNote } from "lucide-react";

interface Props {
  onAdd: () => void;
  onHelp: () => void;
}

function GhostNote({
  className,
  rot,
  delay,
  color,
  w,
}: {
  className: string;
  rot: string;
  delay: number;
  color: string;
  w: number;
}) {
  return (
    <div
      className={`absolute rounded-2xl border ${className}`}
      style={
        {
          width: w,
          height: w * 0.72,
          background: `linear-gradient(160deg, ${color}1f, ${color}0a)`,
          borderColor: `${color}55`,
          boxShadow: `0 24px 60px -24px ${color}66`,
          animation: `floaty 6s ease-in-out ${delay}s infinite`,
          "--rot": rot,
        } as React.CSSProperties
      }
    >
      <div className="absolute top-4 start-4 end-8 h-2 rounded-full" style={{ background: `${color}88` }} />
      <div className="absolute top-9 start-4 end-4 space-y-2">
        <div className="h-1.5 rounded-full" style={{ background: `${color}44` }} />
        <div className="h-1.5 rounded-full w-4/5" style={{ background: `${color}44` }} />
        <div className="h-1.5 rounded-full w-3/5" style={{ background: `${color}44` }} />
      </div>
    </div>
  );
}

export default function EmptyState({ onAdd, onHelp }: Props) {
  return (
    <div className="fixed inset-0 z-30 flex items-center justify-center pointer-events-none select-none">
      <div className="relative flex flex-col items-center text-center px-6">
        {/* floating ghosts */}
        <div className="relative w-[340px] h-[220px] mb-2 hidden sm:block">
          <GhostNote className="right-2 top-6" rot="-7deg" delay={0.4} color="#38bdf8" w={150} />
          <GhostNote className="left-4 top-0" rot="6deg" delay={1.2} color="#34d399" w={130} />
          <GhostNote className="right-24 top-20" rot="-1deg" delay={0} color="#f5a623" w={170} />
        </div>

        <motion.h1
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 200, damping: 22 }}
          className="text-[30px] sm:text-[38px] font-black leading-tight"
        >
          بومِ یادداشت‌های تو{" "}
          <span
            className="text-transparent bg-clip-text"
            style={{ backgroundImage: "linear-gradient(120deg,#f5a623,#fb923c)" }}
          >
            آماده است
          </span>
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="mt-3 text-[13.5px] leading-7 max-w-md"
          style={{ color: "var(--text-dim)" }}
        >
          روی فضای خالی <b className="text-[var(--text)]">دابل‌کلیک</b> کن یا دکمه‌ی زیر را بزن. با اسکرول
          زوم کن، با <b className="text-[var(--text)]">راست‌کلیک و درگ</b> بوم را جابه‌جا کن و با{" "}
          <b className="text-[var(--text)]">چپ‌کلیک و درگ</b> کادر انتخاب بکش.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mt-6 flex items-center gap-3 pointer-events-auto"
          data-ui
        >
          <button
            onClick={onAdd}
            className="flex items-center gap-2 px-5 py-3 rounded-2xl text-[14px] font-extrabold text-[#1a1206] shadow-xl transition-transform hover:scale-[1.04] active:scale-95 cursor-pointer"
            style={{ background: "linear-gradient(135deg,#f5a623,#e2761b)" }}
          >
            <Plus size={17} strokeWidth={2.6} /> ساخت اولین یادداشت
          </button>
          <button
            onClick={onHelp}
            className="glass flex items-center gap-2 px-5 py-3 rounded-2xl text-[13.5px] font-bold transition-transform hover:scale-[1.03] active:scale-95 cursor-pointer"
            style={{ color: "var(--text)" }}
          >
            <MousePointerClick size={16} style={{ color: "var(--accent)" }} /> راهنمای نصب افزونه
          </button>
        </motion.div>

        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6 }}
          className="mt-6 flex items-center gap-1.5 text-[11px]"
          style={{ color: "var(--text-dim)" }}
        >
          <StickyNote size={12} />
          یادداشت‌ها به‌صورت خودکار و دائمی روی همین رایانه ذخیره می‌شوند
        </motion.div>
      </div>
    </div>
  );
}
