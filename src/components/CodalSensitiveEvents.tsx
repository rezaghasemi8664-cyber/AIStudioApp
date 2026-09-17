import React, { useCallback, useEffect, useState } from 'react';
import { getCodalReports, CodalReport } from '../services/codalIntelligenceService';

interface Props { isOnline: boolean; }

const labels: Record<string, string> = {
  'capital-increase': 'افزایش سرمایه',
  dividend: 'تقسیم سود',
  'financial-statement': 'صورت مالی',
  contract: 'قرارداد',
};
const fa = (value: number | string) => String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);

const CodalSensitiveEvents: React.FC<Props> = ({ isOnline }) => {
  const [items, setItems] = useState<CodalReport[]>([]);
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isOnline) { setError('اتصال آنلاین در دسترس نیست.'); return; }
    setLoading(true); setError('');
    try {
      const result = await getCodalReports({ limit: 200 });
      setItems(result.items.filter(item => Object.prototype.hasOwnProperty.call(labels, item.category)));
    } catch (e: any) {
      setError(e?.response?.data?.message || e?.message || 'دریافت رویدادهای حساس کدال ناموفق بود.');
    } finally { setLoading(false); }
  }, [isOnline]);

  useEffect(() => { void load(); }, [load]);

  const visible = selectedCategory === 'all' ? items : items.filter(item => item.category === selectedCategory);
  const count = (category: string) => items.filter(item => item.category === category).length;

  return <section dir="rtl" className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4">
      <div><h3 className="font-black text-lg">رویدادهای حساس کدال</h3><p className="text-xs text-gray-500 mt-1">فقط بر اساس دسته‌بندی قطعی اطلاعیه‌های واقعی کدال؛ بدون تحلیل هوش مصنوعی</p></div>
      <button type="button" onClick={() => void load()} disabled={loading} className="rounded-xl bg-cyan-600 text-white px-4 py-2 font-bold disabled:opacity-50">{loading ? 'در حال دریافت…' : 'به‌روزرسانی'}</button>
    </div>
    {error && <div className="rounded-2xl border border-red-300 bg-red-50 dark:bg-red-950/20 p-4 text-red-700 dark:text-red-300">{error}</div>}
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4"><div className="text-xs text-gray-500">کل رویدادهای حساس</div><div className="text-2xl font-black mt-1">{fa(items.length)}</div></div>
      {Object.entries(labels).map(([key, label]) => <button key={key} type="button" onClick={() => setSelectedCategory(key)} className={`text-right rounded-2xl border p-4 transition ${selectedCategory === key ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-950/30' : 'border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60'}`}><div className="text-xs text-gray-500">{label}</div><div className="text-2xl font-black mt-1">{fa(count(key))}</div></button>)}
    </div>
    <div className="flex gap-2 overflow-x-auto pb-1"><button type="button" onClick={() => setSelectedCategory('all')} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold border ${selectedCategory === 'all' ? 'bg-cyan-600 text-white border-cyan-600' : 'border-[var(--color-border)]'}`}>همه ({fa(items.length)})</button>{Object.entries(labels).map(([key, label]) => <button key={key} type="button" onClick={() => setSelectedCategory(key)} className={`shrink-0 rounded-full px-4 py-2 text-sm font-bold border ${selectedCategory === key ? 'bg-cyan-600 text-white border-cyan-600' : 'border-[var(--color-border)]'}`}>{label} ({fa(count(key))})</button>)}</div>
    <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden bg-white/80 dark:bg-gray-900/60">
      {visible.length === 0 ? <div className="p-8 text-center text-gray-500">رویداد حساسی برای نمایش وجود ندارد.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="text-right border-b border-[var(--color-border)]"><th className="p-3">نوع رویداد</th><th className="p-3">نماد</th><th className="p-3">عنوان</th><th className="p-3">تاریخ انتشار</th><th className="p-3">وضعیت</th></tr></thead><tbody>{visible.map((item, index) => <tr key={`${item.symbol}-${item.publishDate}-${index}`} className="border-b border-[var(--color-border)] hover:bg-gray-50 dark:hover:bg-gray-800/60"><td className="p-3 font-bold">{labels[item.category]}</td><td className="p-3">{item.symbol || '—'}</td><td className="p-3 font-bold min-w-[300px]">{item.title || '—'}</td><td className="p-3">{item.publishDate || '—'}</td><td className="p-3">{item.audited ? 'حسابرسی‌شده' : 'عادی'}{item.attachment ? ' • پیوست' : ''}</td></tr>)}</tbody></table></div>}
    </div>
  </section>;
};

export default CodalSensitiveEvents;
