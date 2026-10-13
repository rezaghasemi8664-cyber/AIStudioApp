import React, { useCallback, useEffect, useState } from 'react';
import { getMarketingAttributionReport, type MarketingAttributionReport } from '../services/marketingAttributionReportService';

const CHANNELS = [
  { key: 'bursebazaar', label: 'کانال بورس‌بازار' },
  { key: 'arzonlineinfo', label: 'کانال ارزآنلاین' },
] as const;
const fmt = (value: number) => Number(value || 0).toLocaleString('fa-IR');
const dateFmt = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
};

const AdminMarketingAttributionPanel: React.FC = () => {
  const [report, setReport] = useState<MarketingAttributionReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setReport(await getMarketingAttributionReport()); }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت گزارش تبلیغات ناموفق بود.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  return <div className="space-y-5">
    <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold">آمار تبلیغات تلگرام</h2><p className="mt-1 text-sm text-gray-500">آمار بر اساس پارامترهای معتبر لینک تبلیغاتی ثبت می‌شود؛ بازدید یکتا به معنی بازدید ثبت‌شده در هر نشست تبلیغاتی است.</p></div>
        <button onClick={() => void load()} disabled={loading} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">{loading ? 'در حال بروزرسانی…' : 'بروزرسانی آمار'}</button>
      </div>
      {report && <p className="mt-3 text-xs text-gray-500">آخرین دریافت: {dateFmt(report.generatedAt)}</p>}
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading && !report ? <div className="py-10 text-center text-gray-500">در حال دریافت آمار تبلیغات…</div> : report && <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
      {CHANNELS.map(channel => {
        const data = report.channels[channel.key];
        return <section key={channel.key} className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
          <h3 className="font-bold">{channel.label}</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-sm text-gray-500">بازدید ثبت‌شده</div><div className="mt-1 text-2xl font-extrabold">{fmt(data?.visits || 0)}</div></div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-sm text-gray-500">ثبت‌نام منتسب</div><div className="mt-1 text-2xl font-extrabold">{fmt(data?.registrationCount || 0)}</div></div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4 col-span-2"><div className="text-sm text-gray-500">نرخ تبدیل بازدید به ثبت‌نام</div><div className="mt-1 text-xl font-bold">{fmt(data?.conversionRatePercent || 0)}٪</div></div>
          </div>
          <h4 className="mt-5 font-semibold">آخرین ثبت‌نام‌های منتسب</h4>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--card-border-color)] text-right"><th className="p-2">شناسه کاربر</th><th className="p-2">زمان ثبت‌نام</th></tr></thead><tbody>
            {data?.recentRegistrations?.length ? data.recentRegistrations.slice().reverse().slice(0, 10).map((item, index) => <tr key={String(item.userId) + '-' + item.registeredAt + '-' + index} className="border-b border-[var(--card-border-color)]"><td className="p-2">{String(item.userId)}</td><td className="p-2 whitespace-nowrap">{dateFmt(item.registeredAt)}</td></tr>) : <tr><td colSpan={2} className="p-4 text-center text-gray-500">هنوز ثبت‌نام منتسبی ثبت نشده است.</td></tr>}
          </tbody></table></div>
        </section>;
      })}
    </div>}
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">این گزارش فعلاً بازدید و ثبت‌نام منتسب را نمایش می‌دهد. خرید اشتراک و درآمد هر کانال در این گزارش ثبت نمی‌شوند و برای نمایش دقیق آن‌ها باید رهگیری پرداخت نیز تکمیل شود.</div>
  </div>;
};
export default AdminMarketingAttributionPanel;
