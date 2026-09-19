import React, { useCallback, useEffect, useState } from 'react';
import { getPortfolioRiskContribution, type PortfolioRiskContributionResult } from '../services/portfolioRiskContributionService';

interface Props { isOnline: boolean; }
const pct = (v: number | null) => v == null ? '—' : `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

const PortfolioRiskContributionAnalysis: React.FC<Props> = ({ isOnline }) => {
  const [data, setData] = useState<PortfolioRiskContributionResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    if (!isOnline) { setError('برای محاسبه سهم ریسک باید آنلاین باشید.'); return; }
    setLoading(true); setError(null);
    try { setData(await getPortfolioRiskContribution()); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || 'محاسبه سهم ریسک ناموفق بود.'); }
    finally { setLoading(false); }
  }, [isOnline]);
  useEffect(() => { load(); }, [load]);

  return <div dir="rtl" className="page-shell portfolio-risk-contribution-page space-y-5">
    <div className="flex items-center justify-between gap-3 flex-wrap"><div><h2 className="text-2xl font-black">سهم هر نماد در ریسک کل سبد</h2><p className="text-sm text-gray-500 dark:text-gray-400 mt-1">مقایسه وزن سرمایه، نوسان مستقل و سهم تقریبی هر موقعیت در ریسک تاریخی سبد</p></div><button type="button" onClick={load} disabled={loading || !isOnline} className="rounded-xl bg-cyan-600 text-white px-4 py-2 font-bold disabled:opacity-50">{loading ? 'در حال محاسبه...' : 'بروزرسانی'}</button></div>
    {error && <div className="rounded-xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300">{error}</div>}
    {data && <>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {[['نوسان روزانه سبد', pct(data.portfolioVolatilityPercent)], ['جمع سهم‌های محاسبه‌شده', pct(data.totalContributionPercent)], ['تعداد نمادها', String(data.rows.length)]].map(([label, value]) => <div key={label} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><p className="text-xs text-gray-500">{label}</p><p className="mt-2 text-xl font-black font-mono">{value}</p></div>)}
      </div>
      <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 overflow-x-auto"><div className="p-4 border-b border-[var(--color-border)]"><h3 className="font-black text-lg">ماتریس ریسک/بازده هر موقعیت</h3><p className="text-xs text-gray-500 mt-1">سهم ریسک با وزن فعلی سرمایه و نوسان تاریخی هر نماد محاسبه شده و یک معیار توصیفی است.</p></div><table className="w-full text-sm"><thead><tr className="text-right text-gray-500"><th className="p-3">نماد</th><th className="p-3">وزن سرمایه</th><th className="p-3">نوسان مستقل</th><th className="p-3">سهم ریسک</th><th className="p-3">مشاهدات</th></tr></thead><tbody>{data.rows.map(row => <tr key={row.symbol} className="border-t border-[var(--color-border)]"><td className="p-3 font-black">{row.symbol}</td><td className="p-3 font-mono">{pct(row.weightPercent)}</td><td className="p-3 font-mono">{pct(row.volatilityPercent)}</td><td className="p-3 font-mono font-black">{pct(row.contributionPercent)}</td><td className="p-3 font-mono">{row.observations}</td></tr>)}</tbody></table></div>
      <div className="rounded-xl border border-[var(--color-border)] p-4 text-xs text-gray-500">این محاسبه بر اساس داده تاریخی واقعی انجام می‌شود و مدل هوش مصنوعی، پیش‌بینی یا داده ساختگی در آن وجود ندارد.</div>
    </>}
  </div>;
};
export default PortfolioRiskContributionAnalysis;
