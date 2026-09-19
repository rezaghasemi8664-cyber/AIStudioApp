import React, { useCallback, useEffect, useState } from 'react';
import { getPortfolioRisk, type PortfolioRiskResult } from '../services/portfolioRiskService';

interface Props { isOnline: boolean; }
const pct = (v: number | null) => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

const PortfolioRiskAnalysis: React.FC<Props> = ({ isOnline }) => {
  const [data, setData] = useState<PortfolioRiskResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!isOnline) { setError('برای محاسبه ریسک سبد باید آنلاین باشید.'); return; }
    setLoading(true); setError(null);
    try { setData(await getPortfolioRisk()); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || 'محاسبه ریسک سبد ناموفق بود.'); }
    finally { setLoading(false); }
  }, [isOnline]);

  useEffect(() => { load(); }, [load]);

  return <div dir="rtl" className="page-shell portfolio-risk-analysis-page space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap">
      <div><h2 className="text-2xl font-black">تحلیل ریسک سبد</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">نوسان‌پذیری، ریسک نزولی، افت سرمایه و ریسک هر نماد بر اساس تاریخچه واقعی قیمت</p></div>
      <button type="button" onClick={load} disabled={loading || !isOnline} className="rounded-xl bg-cyan-600 text-white px-4 py-2 font-bold disabled:opacity-50">{loading ? 'در حال محاسبه...' : 'بروزرسانی'}</button>
    </div>
    {error && <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300">{error}</div>}
    {data && <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[['نوسان‌پذیری روزانه', pct(data.volatilityPercent)], ['انحراف نزولی', pct(data.downsideDeviationPercent)], ['حداکثر افت سبد', pct(data.maxDrawdownPercent)], ['بازده به ریسک', data.returnToRisk == null ? '—' : data.returnToRisk.toFixed(2)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-xl font-black font-mono">{value}</p></div>)}
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[['روزهای مثبت', String(data.positiveDays)], ['روزهای منفی', String(data.negativeDays)], ['تعداد مشاهدات', String(data.points.length)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/70 dark:bg-gray-900/50 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-lg font-black font-mono">{value}</p></div>)}
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 overflow-x-auto">
        <div className="p-4 border-b border-[var(--color-border)]"><h3 className="font-black text-lg">ریسک هر نماد</h3><p className="text-xs text-gray-500 mt-1">نوسان و افت هر نماد از تاریخ ورود همان موقعیت محاسبه شده است.</p></div>
        <table className="w-full text-sm"><thead><tr className="text-right text-gray-500"><th className="p-3">نماد</th><th className="p-3">نوسان روزانه</th><th className="p-3">انحراف نزولی</th><th className="p-3">حداکثر افت</th><th className="p-3">مشاهدات</th></tr></thead><tbody>{data.holdingRisks.map(row => <tr key={row.symbol} className="border-t border-[var(--color-border)]"><td className="p-3 font-black">{row.symbol}</td><td className="p-3 font-mono">{pct(row.volatilityPercent)}</td><td className="p-3 font-mono">{pct(row.downsideDeviationPercent)}</td><td className="p-3 font-mono text-red-600">{pct(row.maxDrawdownPercent)}</td><td className="p-3 font-mono">{row.observations}</td></tr>)}</tbody></table>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] p-4 text-xs text-gray-500">این بخش صرفاً محاسبات آماری توصیفی از داده تاریخی واقعی است و هیچ مدل هوش مصنوعی یا امتیازدهی مصنوعی در آن استفاده نشده است.</div>
    </>}
  </div>;
};

export default PortfolioRiskAnalysis;
