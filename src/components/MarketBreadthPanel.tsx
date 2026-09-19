import React from 'react';

export interface MarketBreadthPanelProps {
  positive?: number | null;
  negative?: number | null;
  neutral?: number | null;
  title?: string;
}

const fa = (v: number) => new Intl.NumberFormat('fa-IR').format(v);

export default function MarketBreadthPanel({ positive = null, negative = null, neutral = null, title = 'عرض بازار' }: MarketBreadthPanelProps) {
  const p = typeof positive === 'number' ? positive : 0;
  const n = typeof negative === 'number' ? negative : 0;
  const z = typeof neutral === 'number' ? neutral : 0;
  const total = p + n + z;
  const ratio = n > 0 ? p / n : p > 0 ? Infinity : 0;
  const positivePct = total ? (p / total) * 100 : 0;
  const negativePct = total ? (n / total) * 100 : 0;
  const neutralPct = total ? (z / total) * 100 : 0;
  const tone = p > n ? 'مثبت' : n > p ? 'منفی' : 'خنثی';

  return (
    <section dir="rtl" className="rounded-3xl border border-white/10 bg-white/[0.025] p-5">
      <div className="flex items-center justify-between gap-3 mb-5">
        <div>
          <h3 className="font-bold text-white">{title}</h3>
          <p className="text-xs text-slate-500 mt-1">تعداد نمادهای مثبت، منفی و خنثی بازار</p>
        </div>
        <div className="rounded-full border border-white/10 px-3 py-1 text-xs text-slate-300">وضعیت: {tone}</div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="rounded-2xl border border-emerald-400/10 bg-emerald-400/[0.06] p-4">
          <div className="text-xs text-emerald-300/70">مثبت</div>
          <div className="mt-2 text-2xl font-black text-emerald-300">{fa(p)}</div>
          <div className="mt-1 text-xs text-slate-500">{positivePct.toFixed(1)}٪ بازار</div>
        </div>
        <div className="rounded-2xl border border-rose-400/10 bg-rose-400/[0.06] p-4">
          <div className="text-xs text-rose-300/70">منفی</div>
          <div className="mt-2 text-2xl font-black text-rose-300">{fa(n)}</div>
          <div className="mt-1 text-xs text-slate-500">{negativePct.toFixed(1)}٪ بازار</div>
        </div>
        <div className="rounded-2xl border border-slate-400/10 bg-slate-400/[0.05] p-4">
          <div className="text-xs text-slate-400">خنثی</div>
          <div className="mt-2 text-2xl font-black text-slate-200">{fa(z)}</div>
          <div className="mt-1 text-xs text-slate-500">{neutralPct.toFixed(1)}٪ بازار</div>
        </div>
      </div>

      <div className="mt-5">
        <div className="flex h-3 overflow-hidden rounded-full bg-white/5">
          <div className="bg-emerald-400" style={{ width: `${positivePct}%` }} />
          <div className="bg-slate-500" style={{ width: `${neutralPct}%` }} />
          <div className="bg-rose-400" style={{ width: `${negativePct}%` }} />
        </div>
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>مجموع نمادها: <b className="text-slate-300">{fa(total)}</b></span>
          <span>نسبت مثبت/منفی: <b className="text-slate-300">{Number.isFinite(ratio) ? `${ratio.toFixed(2)}x` : '∞'}</b></span>
        </div>
      </div>
    </section>
  );
}
