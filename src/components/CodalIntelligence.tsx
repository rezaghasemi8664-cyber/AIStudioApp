import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getCodalReports, CodalReport, CodalReportsResult } from '../services/codalIntelligenceService';

interface Props { isOnline: boolean; }
const faNumber = (value: number | string) => String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
const formatMetric = (value?: number) => value == null ? '—' : faNumber(new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 }).format(value));
const categoryLabels: Record<string, string> = { 'financial-statement': 'صورت مالی', 'monthly-performance': 'گزارش ماهانه', 'board-meeting': 'هیئت مدیره', dividend: 'تقسیم سود', 'capital-increase': 'افزایش سرمایه', 'general-meeting': 'مجمع', 'earnings-forecast': 'پیش‌بینی سود', audit: 'حسابرسی', contract: 'قرارداد', 'production-sales': 'تولید و فروش', other: 'سایر' };
const metricLabels: Record<string, string> = { revenue: 'درآمد', netProfit: 'سود خالص', eps: 'EPS', assets: 'دارایی', liabilities: 'بدهی', cash: 'وجه نقد', salesVolume: 'حجم فروش' };
const timelineOrder = ['capital-increase', 'financial-statement', 'monthly-performance', 'dividend', 'general-meeting', 'earnings-forecast', 'audit', 'contract', 'production-sales', 'board-meeting', 'other'];

const CodalIntelligence: React.FC<Props> = ({ isOnline }) => {
  const [symbol, setSymbol] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [limit, setLimit] = useState(50);
  const [category, setCategory] = useState('all');
  const [sort, setSort] = useState<'newest' | 'oldest' | 'important'>('newest');
  const [result, setResult] = useState<CodalReportsResult | null>(null);
  const [selected, setSelected] = useState<CodalReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isOnline) { setError('اتصال آنلاین در دسترس نیست.'); return; }
    setLoading(true); setError('');
    try { setResult(await getCodalReports({ symbol: symbol.trim(), from, to, limit })); }
    catch (e: any) { setError(e?.response?.data?.message || e?.message || 'دریافت اطلاعیه‌های کدال ناموفق بود.'); }
    finally { setLoading(false); }
  }, [isOnline, symbol, from, to, limit]);
  useEffect(() => { void load(); }, [load]);

  const filteredItems = useMemo(() => {
    const items = category === 'all' ? [...(result?.items || [])] : (result?.items || []).filter(item => item.category === category);
    const timeValue = (item: CodalReport) => { const parsed = Date.parse(item.publishDate || ''); return Number.isNaN(parsed) ? 0 : parsed; };
    if (sort === 'oldest') return items.sort((a, b) => timeValue(a) - timeValue(b));
    if (sort === 'important') return items.sort((a, b) => (timelineOrder.indexOf(a.category) - timelineOrder.indexOf(b.category)) || (timeValue(b) - timeValue(a)));
    return items.sort((a, b) => timeValue(b) - timeValue(a));
  }, [result, category, sort]);
  const categories = useMemo(() => Object.entries(result?.summary.byCategory || {}).filter(([, count]) => count > 0), [result]);
  const previousMetricReport = useMemo(() => {
    if (!selected || !result) return null;
    const selectedTime = Date.parse(selected.publishDate || '');
    const candidates = result.items.filter(item => item !== selected && Object.keys(item.financialMetrics || {}).length > 0 && item.category === selected.category && Date.parse(item.publishDate || '') < selectedTime);
    return candidates.sort((a, b) => Date.parse(b.publishDate || '') - Date.parse(a.publishDate || ''))[0] || null;
  }, [result, selected]);
  const selectedMetrics = selected?.financialMetrics || {};
  const timelineItems = filteredItems.slice(0, 12);

  return (
    <section dir="rtl" className="space-y-4">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[180px] flex-1"><label className="block text-sm font-bold mb-2">نماد</label><input value={symbol} onChange={e => setSymbol(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') void load(); }} placeholder="مثلاً فملی" className="w-full rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2" /></div>
          <div><label className="block text-sm font-bold mb-2">از تاریخ</label><input value={from} onChange={e => setFrom(e.target.value)} placeholder="YYYY-MM-DD" className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2" /></div>
          <div><label className="block text-sm font-bold mb-2">تا تاریخ</label><input value={to} onChange={e => setTo(e.target.value)} placeholder="YYYY-MM-DD" className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2" /></div>
          <div><label className="block text-sm font-bold mb-2">تعداد</label><select value={limit} onChange={e => setLimit(Number(e.target.value))} className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2"><option value={25}>۲۵</option><option value={50}>۵۰</option><option value={100}>۱۰۰</option><option value={200}>۲۰۰</option></select></div>
          <div><label className="block text-sm font-bold mb-2">مرتب‌سازی</label><select value={sort} onChange={e => setSort(e.target.value as typeof sort)} className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2"><option value="newest">جدیدترین</option><option value="oldest">قدیمی‌ترین</option><option value="important">رویدادهای مهم</option></select></div>
          <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl bg-cyan-600 text-white px-5 py-2.5 font-bold disabled:opacity-50">{loading ? 'در حال دریافت…' : 'جستجو'}</button>
        </div>
      </div>
      {result && categories.length > 0 && <div className="flex gap-2 overflow-x-auto pb-1">{[['all', 'همه', result.items.length], ...categories.map(([key, count]) => [key, categoryLabels[key] || key, count] as const)].map(([key, label, count]) => <button key={key} type="button" onClick={() => setCategory(String(key))} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold border transition ${category === key ? 'bg-cyan-600 text-white border-cyan-600' : 'border-[var(--color-border)] bg-white/70 dark:bg-gray-900/60'}`}>{label} ({faNumber(Number(count))})</button>)}</div>}
      {error && <div className="rounded-2xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300">{error}</div>}
      {result && <>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">{[['کل اطلاعیه‌ها', result.summary.reports], ['حسابرسی‌شده', result.summary.audited], ['دارای پیوست', result.summary.attachments], ['دسته‌بندی‌ها', Object.keys(result.summary.byCategory || {}).length], ['دارای شاخص مالی', result.summary.metricReports]].map(([label, value]) => <div key={String(label)} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><div className="text-xs text-gray-500">{label}</div><div className="text-2xl font-black mt-1">{faNumber(Number(value))}</div></div>)}</div>
        <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><div className="font-black mb-4">Timeline رویدادهای کدال</div><div className="grid md:grid-cols-2 gap-3">{timelineItems.length === 0 ? <div className="text-gray-500">رویدادی موجود نیست.</div> : timelineItems.map((item, index) => <button key={`${item.symbol}-${item.publishDate}-${index}`} type="button" onClick={() => setSelected(item)} className="text-right rounded-xl border border-[var(--color-border)] p-3 hover:bg-gray-50 dark:hover:bg-gray-800/60"><div className="flex items-center justify-between gap-3"><span className="font-bold truncate">{item.title || 'بدون عنوان'}</span><span className="text-xs text-gray-500 shrink-0">{item.publishDate || '—'}</span></div><div className="text-xs text-cyan-600 mt-2">{categoryLabels[item.category] || item.category || 'سایر'}{item.financialMetrics && Object.keys(item.financialMetrics).length > 0 ? ' • شاخص مالی' : ''}</div></button>)}</div></div>
        <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden bg-white/80 dark:bg-gray-900/60">
          <div className="px-4 py-3 border-b border-[var(--color-border)] font-black">{category === 'all' ? 'اطلاعیه‌های کدال' : `اطلاعیه‌های ${categoryLabels[category] || category}`} <span className="text-xs font-normal text-gray-500">({faNumber(filteredItems.length)})</span></div>
          {filteredItems.length === 0 ? <div className="p-6 text-center text-gray-500">اطلاعیه‌ای برای فیلتر انتخاب‌شده پیدا نشد.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-right border-b border-[var(--color-border)]"><th className="p-3">عنوان</th><th className="p-3">نماد</th><th className="p-3">دسته</th><th className="p-3">تاریخ</th><th className="p-3">شاخص مالی</th><th className="p-3">وضعیت</th></tr></thead><tbody>{filteredItems.map((item, index) => <tr key={`${item.symbol}-${item.publishDate}-${index}`} onClick={() => setSelected(item)} className="border-b border-[var(--color-border)] hover:bg-gray-50 dark:hover:bg-gray-800/60 cursor-pointer"><td className="p-3 font-bold min-w-[280px]">{item.title || '—'}</td><td className="p-3">{item.symbol || '—'}</td><td className="p-3">{categoryLabels[item.category] || item.category || '—'}</td><td className="p-3">{item.publishDate || '—'}</td><td className="p-3">{Object.keys(item.financialMetrics || {}).filter(key => !key.includes('Growth')).length ? 'دارد' : '—'}</td><td className="p-3">{item.audited ? 'حسابرسی‌شده' : 'عادی'}{item.attachment ? ' • پیوست' : ''}</td></tr>)}</tbody></table></div>}
        </div>
      </>}
      {selected && <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4" onClick={() => setSelected(null)}><div onClick={e => e.stopPropagation()} className="w-full max-w-3xl max-h-[90vh] overflow-auto rounded-2xl bg-white dark:bg-gray-900 border border-[var(--color-border)] p-5"><div className="flex justify-between gap-4"><h3 className="font-black text-lg">جزئیات اطلاعیه و شاخص‌های مالی</h3><button type="button" onClick={() => setSelected(null)} className="text-gray-500">بستن</button></div><div className="space-y-3 mt-5"><div><span className="text-gray-500">عنوان:</span> {selected.title || '—'}</div><div><span className="text-gray-500">شرکت:</span> {selected.companyName || '—'}</div><div><span className="text-gray-500">نماد:</span> {selected.symbol || '—'}</div><div><span className="text-gray-500">دسته:</span> {categoryLabels[selected.category] || selected.category || '—'}</div><div><span className="text-gray-500">نوع:</span> {selected.reportType || '—'}</div><div><span className="text-gray-500">دوره:</span> {selected.period || '—'}</div><div><span className="text-gray-500">پایان دوره:</span> {selected.periodEnd || '—'}</div><div><span className="text-gray-500">تاریخ انتشار:</span> {selected.publishDate || '—'}</div></div>
        {Object.keys(selectedMetrics).length > 0 && <div className="mt-6"><div className="font-black mb-3">شاخص‌های مالی استخراج‌شده</div><div className="grid grid-cols-2 md:grid-cols-4 gap-3">{Object.entries(metricLabels).map(([key, label]) => { const value = selectedMetrics[key as keyof typeof selectedMetrics]; if (value == null) return null; return <div key={key} className="rounded-xl border border-[var(--color-border)] p-3"><div className="text-xs text-gray-500">{label}</div><div className="font-black mt-1">{formatMetric(value)}</div></div>; })}</div></div>}
        {(selectedMetrics.revenueGrowthPercent != null || selectedMetrics.netProfitGrowthPercent != null) && <div className="mt-4 rounded-xl border border-[var(--color-border)] p-4"><div className="font-black mb-2">رشد دوره‌ای ثبت‌شده در منبع</div><div className="flex flex-wrap gap-4 text-sm">{selectedMetrics.revenueGrowthPercent != null && <span>رشد درآمد: <b>{formatMetric(selectedMetrics.revenueGrowthPercent)}٪</b></span>}{selectedMetrics.netProfitGrowthPercent != null && <span>رشد سود خالص: <b>{formatMetric(selectedMetrics.netProfitGrowthPercent)}٪</b></span>}</div></div>}
        {previousMetricReport && <div className="mt-4 rounded-xl border border-[var(--color-border)] p-4"><div className="font-black mb-2">مقایسه با اطلاعیه مالی قبلی موجود</div><div className="text-xs text-gray-500 mb-3">{previousMetricReport.publishDate || 'تاریخ نامشخص'}</div><div className="grid grid-cols-2 md:grid-cols-3 gap-3">{(['revenue', 'netProfit', 'eps'] as const).map(key => { const current = selectedMetrics[key]; const previous = previousMetricReport.financialMetrics?.[key]; if (current == null || previous == null) return null; const change = previous === 0 ? null : ((current - previous) / Math.abs(previous)) * 100; return <div key={key} className="rounded-xl border border-[var(--color-border)] p-3"><div className="text-xs text-gray-500">{metricLabels[key]}</div><div className="font-bold">{formatMetric(current)} ← {formatMetric(previous)}</div><div className="text-xs mt-1">تغییر: {change == null ? '—' : `${formatMetric(change)}٪`}</div></div>; })}</div></div>}
        {selected.url && <a href={selected.url} target="_blank" rel="noreferrer" className="inline-block mt-5 text-cyan-600 font-bold">مشاهده اطلاعیه در منبع</a>}
      </div></div>}
    </section>
  );
};
export default CodalIntelligence;
