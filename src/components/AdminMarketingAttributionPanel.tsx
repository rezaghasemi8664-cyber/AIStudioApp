import React, { useCallback, useEffect, useState } from 'react';
import {
  getMarketingAttributionReport, getMarketingAdSlots, saveMarketingAdSlot, deleteMarketingAdArchive,
  type MarketingAttributionReport, type MarketingAdSlot, type MarketingAdArchive, type MarketingAttributionChannelReport,
} from '../services/marketingAttributionReportService';

const fmt = (value: number) => Number(value || 0).toLocaleString('fa-IR');
const dateFmt = (value: string) => {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('fa-IR', { timeZone: 'Asia/Tehran' });
};
const EMPTY_SLOT_NAMES = ['کانال بورس‌بازار', 'کانال ارزآنلاین', 'کانال رونیا', 'جایگاه تبلیغاتی ۴', 'جایگاه تبلیغاتی ۵'];

const MetricGrid: React.FC<{ data?: MarketingAttributionChannelReport | null }> = ({ data }) => <div className="mt-4 grid grid-cols-2 gap-3">
  {[
    ['بازدید صفحه معرفی', data?.landingPageViewCount],
    ['کلیک روی ورود / ثبت‌نام', data?.ctaClickCount],
    ['ورود به صفحه ورود', data?.loginPageViewCount],
    ['کلیک ثبت‌نام در صفحه ورود', data?.signupClickCount],
    ['ثبت‌نام موفق منتسب', data?.registrationCount],
    ['خرید اشتراک موفق', data?.paidPurchaseCount],
    ['درآمد منتسب (ریال)', data?.revenueAmount],
    ['کاربران واردشده', data?.visitCount],
    ['نرخ کلیک ورود از صفحه معرفی', data?.landingPageViewCount ? ((data.ctaClickCount || 0) / data.landingPageViewCount) * 100 : 0],
    ['نرخ تبدیل صفحه ورود به ثبت‌نام', data?.loginPageViewCount ? ((data.registrationCount || 0) / data.loginPageViewCount) * 100 : 0],
  ].map(([label, value], index) => <div key={String(label)} className={index === 9 ? 'col-span-2 rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4' : 'rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4'}>
    <div className="text-sm text-gray-500">{label}</div><div className="mt-1 text-xl font-extrabold">{fmt(Number(value || 0))}{index >= 8 ? '٪' : ''}</div>
  </div>)}
</div>;

const ActivityTables: React.FC<{ data?: MarketingAttributionChannelReport | null }> = ({ data }) => <div className="space-y-4">
  <div><h4 className="font-semibold">آخرین ثبت‌نام‌های منتسب</h4><div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-right"><th className="p-2">شناسه کاربر</th><th className="p-2">زمان ثبت‌نام</th></tr></thead><tbody>{data?.recentRegistrations?.length ? data.recentRegistrations.slice().reverse().slice(0, 10).map((item, i) => <tr key={String(item.userId) + item.registeredAt + i} className="border-b"><td className="p-2">{String(item.userId)}</td><td className="p-2 whitespace-nowrap">{dateFmt(item.registeredAt)}</td></tr>) : <tr><td colSpan={2} className="p-3 text-center text-gray-500">هنوز ثبت‌نامی ثبت نشده است.</td></tr>}</tbody></table></div></div>
  <div><h4 className="font-semibold">آخرین خریدهای منتسب</h4><div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-right"><th className="p-2">شناسه کاربر</th><th className="p-2">مبلغ (ریال)</th><th className="p-2">تاریخ پرداخت</th><th className="p-2">کد پیگیری</th></tr></thead><tbody>{data?.recentPurchases?.length ? data.recentPurchases.slice().reverse().slice(0, 10).map((item, i) => <tr key={item.paymentId + i} className="border-b"><td className="p-2">{String(item.userId)}</td><td className="p-2 whitespace-nowrap">{fmt(item.amount)}</td><td className="p-2 whitespace-nowrap">{dateFmt(item.paidAt)}</td><td className="p-2">{item.refId || '—'}</td></tr>) : <tr><td colSpan={4} className="p-3 text-center text-gray-500">هنوز خریدی ثبت نشده است.</td></tr>}</tbody></table></div></div>
  <div><h4 className="font-semibold">آخرین کلیک‌های ثبت‌نام در صفحه ورود</h4><div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b text-right"><th className="p-2">زمان کلیک</th><th className="p-2">شناسه کانال</th></tr></thead><tbody>{data?.recentSignupClicks?.length ? data.recentSignupClicks.slice().reverse().slice(0, 10).map((item, i) => <tr key={item.id + i} className="border-b"><td className="p-2 whitespace-nowrap">{dateFmt(item.occurredAt)}</td><td className="p-2">{item.content}</td></tr>) : <tr><td colSpan={2} className="p-3 text-center text-gray-500">هنوز کلیکی ثبت نشده است.</td></tr>}</tbody></table></div></div>
</div>;

const AdminMarketingAttributionPanel: React.FC = () => {
  const [report, setReport] = useState<MarketingAttributionReport | null>(null);
  const [slots, setSlots] = useState<MarketingAdSlot[]>([]);
  const [archives, setArchives] = useState<MarketingAdArchive[]>([]);
  const [loading, setLoading] = useState(true);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [savingSlot, setSavingSlot] = useState<string | null>(null);
  const [deletingArchive, setDeletingArchive] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, { name: string; link: string }>>({});
  const loadReport = useCallback(async () => {
    setLoading(true); setError(null);
    try { setReport(await getMarketingAttributionReport()); }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت گزارش تبلیغات ناموفق بود.'); }
    finally { setLoading(false); }
  }, []);
  const loadSettings = useCallback(async () => {
    setSettingsLoading(true);
    try {
      const result = await getMarketingAdSlots();
      setSlots(result.slots); setArchives(result.archives);
      setDrafts(Object.fromEntries(result.slots.map(slot => [slot.slotId, { name: slot.name, link: slot.link }])));
    } catch (e) { setError(e instanceof Error ? e.message : 'دریافت تنظیمات تبلیغات ناموفق بود.'); }
    finally { setSettingsLoading(false); }
  }, []);
  useEffect(() => { void loadReport(); void loadSettings(); }, [loadReport, loadSettings]);

  const updateDraft = (slotId: string, field: 'name' | 'link', value: string) =>
    setDrafts(previous => ({ ...previous, [slotId]: { ...(previous[slotId] || { name: '', link: '' }), [field]: value } }));
  const saveSlot = async (slot: MarketingAdSlot) => {
    const draft = drafts[slot.slotId];
    if (!draft?.name.trim() || !draft?.link.trim()) { setError('نام کانال یا سایت و لینک اختصاصی آن را وارد کنید.'); return; }
    setSavingSlot(slot.slotId); setError(null); setNotice(null);
    try {
      await saveMarketingAdSlot({ slotId: slot.slotId, name: draft.name, link: draft.link, message: slot.message || '' });
      await Promise.all([loadReport(), loadSettings()]);
      setNotice('تنظیمات ذخیره شد. آمار لینک قبلی در بخش «آمار تبلیغات قبلی» نگهداری شده است.');
    } catch (e) { setError(e instanceof Error ? e.message : 'ذخیره جایگاه تبلیغاتی ناموفق بود.'); }
    finally { setSavingSlot(null); }
  };
  const removeArchive = async (archive: MarketingAdArchive) => {
    if (!window.confirm('فقط آمار آرشیوشده این جایگاه حذف شود؟ اطلاعات کاربران و پرداخت‌های اصلی حذف نمی‌شوند.')) return;
    setDeletingArchive(archive.id); setError(null);
    try { await deleteMarketingAdArchive(archive.id); setArchives(previous => previous.filter(item => item.id !== archive.id)); setNotice('آمار آرشیوشده حذف شد.'); }
    catch (e) { setError(e instanceof Error ? e.message : 'حذف آرشیو ناموفق بود.'); }
    finally { setDeletingArchive(null); }
  };

  return <div className="space-y-5">
    <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="text-lg font-bold">آمار تبلیغات تلگرام</h2><p className="mt-1 text-sm text-gray-500">آمار پنج جایگاه تبلیغاتی به‌صورت مستقل ثبت می‌شود. لینک هر جایگاه باید لینک رهگیری رونیا و دارای پارامترهای UTM معتبر باشد.</p></div><button onClick={() => { void loadReport(); void loadSettings(); }} disabled={loading || settingsLoading} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">بروزرسانی آمار</button></div>
      {report && <p className="mt-3 text-xs text-gray-500">آخرین دریافت: {dateFmt(report.generatedAt)}</p>}
    </section>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {notice && <div className="rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">{notice}</div>}
    <section className="space-y-4">
      <h3 className="text-lg font-bold">آمار جایگاه‌های فعال</h3>
      {loading || settingsLoading ? <div className="py-8 text-center text-gray-500">در حال دریافت آمار و تنظیمات…</div> : <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {slots.map((slot, index) => {
          const data = report?.channels[slot.content];
          const draft = drafts[slot.slotId] || { name: slot.name || EMPTY_SLOT_NAMES[index], link: slot.link || '' };
          return <article key={slot.slotId} className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
            <div className="flex items-center justify-between gap-2"><h4 className="font-bold">{slot.name || EMPTY_SLOT_NAMES[index]}</h4><span className="rounded-full bg-gray-100 px-3 py-1 text-xs text-gray-600 dark:bg-gray-800">جایگاه {fmt(index + 1)}</span></div>
            <MetricGrid data={data} /><div className="mt-5"><ActivityTables data={data} /></div>
          </article>;
        })}
      </div>}
    </section>
    <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 space-y-4">
      <div><h3 className="text-lg font-bold">تنظیم پنج جایگاه تبلیغاتی</h3><p className="mt-1 text-sm text-gray-500">نام کانال یا سایت و همان لینک اختصاصی دارای UTM که در متن تبلیغ منتشر می‌شود را وارد کنید. با تغییر لینک، آمار دوره قبلی بایگانی و آمار لینک جدید از صفر محاسبه می‌شود.</p></div>
      {settingsLoading ? <div className="py-4 text-sm text-gray-500">در حال دریافت تنظیمات…</div> : <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {slots.map((slot, index) => {
          const draft = drafts[slot.slotId] || { name: slot.name || EMPTY_SLOT_NAMES[index], link: slot.link || '' };
          return <div key={slot.slotId} className="rounded-xl border border-[var(--card-border-color)] p-4 space-y-3">
            <h4 className="font-semibold">جایگاه تبلیغاتی {fmt(index + 1)}</h4>
            <label className="block text-sm font-medium">نام کانال یا سایت<input value={draft.name} onChange={e => updateDraft(slot.slotId, 'name', e.target.value)} maxLength={120} placeholder="نام کانال یا سایت" className="mt-2 w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-3" /></label>
            <label className="block text-sm font-medium">لینک اختصاصی موجود در پیام تبلیغ<textarea value={draft.link} onChange={e => updateDraft(slot.slotId, 'link', e.target.value)} rows={3} maxLength={2048} placeholder="https://www.roniya-analyzer.ir/?utm_source=telegram&..." dir="ltr" className="mt-2 w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-3 text-left text-sm" /></label>
            <button type="button" onClick={() => void saveSlot(slot)} disabled={savingSlot === slot.slotId} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{savingSlot === slot.slotId ? 'در حال ذخیره…' : 'ذخیره جایگاه'}</button>
          </div>;
        })}
      </div>}
    </section>
    <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 space-y-4">
      <div><h3 className="text-lg font-bold">آمار تبلیغات قبلی</h3><p className="mt-1 text-sm text-gray-500">با تغییر لینک هر جایگاه، گزارش دوره قبلی با نام و لینک قبلی در این بخش نگهداری می‌شود.</p></div>
      {archives.length ? <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">{archives.map(archive => <article key={archive.id} className="rounded-xl border border-[var(--card-border-color)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-2"><div><h4 className="font-bold">{archive.slotName}</h4><p className="mt-1 text-xs text-gray-500">جایگاه {archive.slotId.replace('slot', '')} · بایگانی: {dateFmt(archive.archivedAt)}</p><p className="mt-2 break-all text-xs text-gray-500" dir="ltr">{archive.link || archive.content}</p></div><button type="button" onClick={() => void removeArchive(archive)} disabled={deletingArchive === archive.id} className="rounded-lg border border-red-300 px-3 py-2 text-sm text-red-600 disabled:opacity-50">{deletingArchive === archive.id ? 'در حال حذف…' : 'حذف آمار'}</button></div>
        <MetricGrid data={archive.report} /><div className="mt-4"><ActivityTables data={archive.report} /></div>
      </article>)}</div> : <p className="rounded-xl bg-gray-50 p-5 text-center text-sm text-gray-500 dark:bg-gray-800/50">هنوز آمار تبلیغاتی بایگانی نشده است.</p>}
    </section>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">حذف یک آرشیو فقط همان نسخه آماری بایگانی‌شده را حذف می‌کند و به اطلاعات اصلی کاربران، ثبت‌نام‌ها و پرداخت‌ها دست نمی‌زند. لینک‌های قدیمی منتشرشده همچنان از نظر رهگیری معتبر باقی می‌مانند.</div>
  </div>;
};
export default AdminMarketingAttributionPanel;
