import React, { useCallback, useEffect, useState } from 'react';
import { getMarketingAttributionReport, getMarketingAdCampaigns, saveMarketingAdCampaign, type MarketingAttributionReport, type MarketingAdCampaign } from '../services/marketingAttributionReportService';

const CHANNELS = [
  { key: 'bursebazaar', label: 'کانال بورس‌بازار' },
  { key: 'arzonlineinfo', label: 'کانال ارزآنلاین' },
  { key: 'roniya', label: 'کانال رونیا' },
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
  const [campaigns, setCampaigns] = useState<MarketingAdCampaign[]>([]);
  const [campaignName, setCampaignName] = useState('');
  const [campaignMessage, setCampaignMessage] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settingsLoading, setSettingsLoading] = useState(true);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [settingsError, setSettingsError] = useState<string | null>(null);
  const [settingsNotice, setSettingsNotice] = useState<string | null>(null);
  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try { setReport(await getMarketingAttributionReport()); }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت گزارش تبلیغات ناموفق بود.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  const loadCampaigns = useCallback(async () => {
    setSettingsLoading(true);
    try { setCampaigns(await getMarketingAdCampaigns()); setSettingsError(null); }
    catch (e) { setSettingsError(e instanceof Error ? e.message : 'دریافت تنظیمات پیام تبلیغات ناموفق بود.'); }
    finally { setSettingsLoading(false); }
  }, []);
  useEffect(() => { void loadCampaigns(); }, [loadCampaigns]);
  const makeCampaignLink = (id: string) => `${window.location.origin}/?utm_source=telegram&utm_medium=paid&utm_campaign=roniya_ads&utm_content=${encodeURIComponent(id)}`;
  const applyCampaignLink = (message: string, link: string) => {
    const cleaned = message.trim();
    return /https?:\/\/[^\s]+/.test(cleaned)
      ? cleaned.replace(/https?:\/\/[^\s]+/g, link)
      : `${cleaned}${cleaned ? '\n\n' : ''}${link}`;
  };\n  const resetCampaignForm = () => { setEditingId(null); setCampaignName(''); setCampaignMessage(''); setSettingsError(null); setSettingsNotice(null); };
  const editCampaign = (campaign: MarketingAdCampaign) => { setEditingId(campaign.id); setCampaignName(campaign.name); setCampaignMessage(campaign.message); setSettingsError(null); setSettingsNotice(null); };
  const saveCampaign = async () => {
    if (!campaignName.trim() || !campaignMessage.trim()) { setSettingsError('نام کانال یا سایت و متن پیام تبلیغاتی را وارد کنید.'); return; }
    setSettingsSaving(true); setSettingsError(null); setSettingsNotice(null);
    try {
      const firstSave = await saveMarketingAdCampaign({ ...(editingId ? { id: editingId } : {}), name: campaignName.trim(), message: campaignMessage.trim() });
      setEditingId(firstSave.id);
      const link = makeCampaignLink(firstSave.id);
      const finalMessage = applyCampaignLink(campaignMessage, link);
      const savedCampaign = await saveMarketingAdCampaign({ id: firstSave.id, name: campaignName.trim(), message: finalMessage });
      setCampaigns(previous => {
        const next = previous.filter(item => item.id !== savedCampaign.id);
        return [...next, savedCampaign];
      });
      setEditingId(savedCampaign.id);
      setCampaignMessage(savedCampaign.message);
      await load();
      setSettingsNotice('تنظیمات ذخیره شد و لینک اختصاصی جدید در متن تبلیغ قرار گرفت.');
    } catch (e) { setSettingsError(e instanceof Error ? e.message : 'ذخیره تنظیمات ناموفق بود.'); void loadCampaigns(); }
    finally { setSettingsSaving(false); }
  };
  const copyText = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setSettingsNotice('متن با موفقیت کپی شد.'); }
    catch { setSettingsError('کپی خودکار انجام نشد؛ متن را به‌صورت دستی انتخاب و کپی کنید.'); }
  };

  return <div className="space-y-5">
    <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="text-lg font-bold">آمار تبلیغات تلگرام</h2><p className="mt-1 text-sm text-gray-500">برای هر کانال، بازدید صفحه معرفی، کلیک روی دکمه ورود، مشاهده صفحه ورود، ثبت‌نام و خرید به‌صورت جداگانه ثبت می‌شود. آمار جدید از زمان انتشار این نسخه جمع‌آوری خواهد شد.</p></div>
        <button onClick={() => void load()} disabled={loading} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">{loading ? 'در حال بروزرسانی…' : 'بروزرسانی آمار'}</button>
      </div>
      {report && <p className="mt-3 text-xs text-gray-500">آخرین دریافت: {dateFmt(report.generatedAt)}</p>}
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    {loading && !report ? <div className="py-10 text-center text-gray-500">در حال دریافت آمار تبلیغات…</div> : report && <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
      {[...CHANNELS, ...campaigns.map(campaign => ({ key: campaign.id, label: campaign.name }))].map(channel => {
        const data = report.channels[channel.key];
        return <section key={channel.key} className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
          <h3 className="font-bold">{channel.label}</h3>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-sm text-gray-500">بازدید صفحه معرفی</div><div className="mt-1 text-2xl font-extrabold">{fmt(data?.landingPageViewCount || 0)}</div></div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-sm text-gray-500">کلیک روی ورود / ثبت‌نام</div><div className="mt-1 text-2xl font-extrabold">{fmt(data?.ctaClickCount || 0)}</div></div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-sm text-gray-500">ورود به صفحه ورود</div><div className="mt-1 text-2xl font-extrabold">{fmt(data?.loginPageViewCount || 0)}</div></div>
            <div className="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-4"><div className="text-sm text-emerald-700 dark:text-emerald-300">کلیک روی ثبت‌نام در صفحه ورود</div><div className="mt-1 text-2xl font-extrabold">{fmt(data?.signupClickCount || 0)}</div></div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-sm text-gray-500">ثبت‌نام موفق منتسب</div><div className="mt-1 text-2xl font-extrabold">{fmt(data?.registrationCount || 0)}</div></div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-sm text-gray-500">خرید اشتراک موفق</div><div className="mt-1 text-2xl font-extrabold">{fmt(data?.paidPurchaseCount || 0)}</div></div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-sm text-gray-500">درآمد منتسب (ریال)</div><div className="mt-1 text-xl font-extrabold">{fmt(data?.revenueAmount || 0)}</div></div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-sm text-gray-500">نرخ کلیک ورود از صفحه معرفی</div><div className="mt-1 text-xl font-bold">{fmt(data?.landingPageViewCount ? ((data?.ctaClickCount || 0) / data.landingPageViewCount) * 100 : 0)}٪</div></div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4"><div className="text-sm text-gray-500">نرخ رسیدن به صفحه ورود پس از کلیک</div><div className="mt-1 text-xl font-bold">{fmt(data?.ctaClickCount ? ((data?.loginPageViewCount || 0) / data.ctaClickCount) * 100 : 0)}٪</div></div>
            <div className="rounded-xl bg-gray-50 dark:bg-gray-800/60 p-4 col-span-2"><div className="text-sm text-gray-500">نرخ تبدیل صفحه ورود به ثبت‌نام</div><div className="mt-1 text-xl font-bold">{fmt(data?.loginPageViewCount ? ((data?.registrationCount || 0) / data.loginPageViewCount) * 100 : 0)}٪</div></div>
          </div>
          <h4 className="mt-5 font-semibold">آخرین ثبت‌نام‌های منتسب</h4>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--card-border-color)] text-right"><th className="p-2">شناسه کاربر</th><th className="p-2">زمان ثبت‌نام</th></tr></thead><tbody>
            {data?.recentRegistrations?.length ? data.recentRegistrations.slice().reverse().slice(0, 10).map((item, index) => <tr key={String(item.userId) + '-' + item.registeredAt + '-' + index} className="border-b border-[var(--card-border-color)]"><td className="p-2">{String(item.userId)}</td><td className="p-2 whitespace-nowrap">{dateFmt(item.registeredAt)}</td></tr>) : <tr><td colSpan={2} className="p-4 text-center text-gray-500">هنوز ثبت‌نام منتسبی ثبت نشده است.</td></tr>}
          </tbody></table></div>
          <h4 className="mt-5 font-semibold">آخرین خریدهای منتسب</h4>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--card-border-color)] text-right"><th className="p-2">شناسه کاربر</th><th className="p-2">مبلغ (ریال)</th><th className="p-2">تاریخ پرداخت</th><th className="p-2">کد پیگیری</th></tr></thead><tbody>{data?.recentPurchases?.length ? data.recentPurchases.slice().reverse().slice(0, 10).map((item, index) => <tr key={item.paymentId + "-" + index} className="border-b border-[var(--card-border-color)]"><td className="p-2">{String(item.userId)}</td><td className="p-2 whitespace-nowrap">{fmt(item.amount)}</td><td className="p-2 whitespace-nowrap">{dateFmt(item.paidAt)}</td><td className="p-2">{item.refId || "—"}</td></tr>) : <tr><td colSpan={4} className="p-4 text-center text-gray-500">هنوز خرید منتسبی ثبت نشده است.</td></tr>}</tbody></table></div>
          <h4 className="mt-5 font-semibold">آخرین کلیک‌های ثبت‌نام در صفحه ورود</h4>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--card-border-color)] text-right"><th className="p-2">زمان کلیک</th><th className="p-2">منبع</th><th className="p-2">شناسه کانال</th></tr></thead><tbody>{data?.recentSignupClicks?.length ? data.recentSignupClicks.slice().reverse().slice(0, 10).map((item, index) => <tr key={item.id + '-signup-' + index} className="border-b border-[var(--card-border-color)]"><td className="p-2 whitespace-nowrap">{dateFmt(item.occurredAt)}</td><td className="p-2">{item.source}</td><td className="p-2">{item.content}</td></tr>) : <tr><td colSpan={3} className="p-4 text-center text-gray-500">هنوز کلیک ثبت‌نامی ثبت نشده است.</td></tr>}</tbody></table></div>
          <h4 className="mt-5 font-semibold">آخرین کلیک‌های دکمه ورود / ثبت‌نام</h4>
          <div className="mt-2 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--card-border-color)] text-right"><th className="p-2">زمان کلیک</th><th className="p-2">منبع</th><th className="p-2">شناسه کانال</th></tr></thead><tbody>{data?.recentCtaClicks?.length ? data.recentCtaClicks.slice().reverse().slice(0, 10).map((item, index) => <tr key={item.id + '-' + index} className="border-b border-[var(--card-border-color)]"><td className="p-2 whitespace-nowrap">{dateFmt(item.occurredAt)}</td><td className="p-2">{item.source}</td><td className="p-2">{item.content}</td></tr>) : <tr><td colSpan={3} className="p-4 text-center text-gray-500">هنوز کلیکی روی دکمه ورود ثبت نشده است.</td></tr>}</tbody></table></div>
        </section>;
      })}
    </div>}

    <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 space-y-4">
      <div>
        <h3 className="text-lg font-bold">تنظیم پیام تبلیغات</h3>
        <p className="mt-1 text-sm text-gray-500">برای هر کانال تلگرام یا سایت یک لینک اختصاصی بسازید. بازدیدها و ثبت‌نام‌های حاصل از هر لینک جداگانه در آمار ثبت می‌شوند.</p>
      </div>
      {settingsLoading ? <div className="py-4 text-sm text-gray-500">در حال دریافت تنظیمات…</div> : campaigns.length > 0 && <div className="space-y-2">
        <div className="text-sm font-semibold">کانال‌ها و سایت‌های ثبت‌شده</div>
        {campaigns.map(campaign => <div key={campaign.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--card-border-color)] p-3">
          <div className="min-w-0"><div className="font-semibold">{campaign.name}</div><div className="mt-1 break-all text-xs text-gray-500">{makeCampaignLink(campaign.id)}</div></div>
          <button type="button" onClick={() => editCampaign(campaign)} className="rounded-lg border px-3 py-2 text-sm">ویرایش</button>
        </div>)}
      </div>}
      <div className="grid grid-cols-1 gap-3">
        <label className="block text-sm font-medium">نام کانال یا سایت
          <input value={campaignName} onChange={e => setCampaignName(e.target.value)} maxLength={120} placeholder="مثلاً کانال تحلیل بورس" className="mt-2 w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-3" />
        </label>
        <label className="block text-sm font-medium">متن پیام تبلیغاتی
          <textarea value={campaignMessage} onChange={e => setCampaignMessage(e.target.value)} rows={8} maxLength={5000} placeholder="متن تبلیغ را وارد کنید. لینک اختصاصی پس از ذخیره به متن اضافه یا جایگزین لینک قبلی می‌شود." className="mt-2 w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-3 leading-7" />
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => void saveCampaign()} disabled={settingsSaving} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{settingsSaving ? 'در حال ذخیره…' : editingId ? 'ذخیره تغییرات و جایگزینی لینک' : 'ذخیره و ایجاد لینک اختصاصی'}</button>
        <button type="button" onClick={resetCampaignForm} disabled={settingsSaving} className="rounded-xl border px-4 py-2.5 text-sm">پیام جدید</button>
      </div>
      {editingId && <div className="space-y-3 rounded-xl border border-[var(--card-border-color)] p-4">
        <div className="text-sm font-semibold">لینک اختصاصی کانال / سایت</div>
        <div className="break-all rounded-lg bg-gray-50 p-3 text-sm text-blue-700 dark:bg-gray-800/60 dark:text-blue-300" dir="ltr">{makeCampaignLink(editingId)}</div>
        <button type="button" onClick={() => void copyText(makeCampaignLink(editingId))} className="rounded-lg border px-4 py-2 text-sm">کپی لینک</button>
        <div className="text-sm font-semibold">متن نهایی پیام تبلیغاتی</div>
        <div className="whitespace-pre-wrap break-words rounded-lg bg-gray-50 p-4 text-sm leading-7 dark:bg-gray-800/60">{campaignMessage}</div>
        <button type="button" onClick={() => void copyText(campaignMessage)} className="rounded-lg border px-4 py-2 text-sm">کپی متن تبلیغ</button>
      </div>}
      {settingsError && <div className="text-sm text-red-600">{settingsError}</div>}
      {settingsNotice && <div className="text-sm text-green-700 dark:text-green-400">{settingsNotice}</div>}
    </section>
    <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900">رویدادهای صفحه معرفی، کلیک روی دکمه و مشاهده صفحه ورود از زمان انتشار این نسخه ثبت می‌شوند؛ بنابراین آمار تاریخی این سه مرحله در دسترس نیست. ثبت‌نام و خریدهای قبلی که انتساب معتبر داشته‌اند حفظ می‌شوند. خرید فقط پس از تأیید موفق پرداخت و وجود انتساب ثبت‌نام شمارش می‌شود.</div>
  </div>;
};
export default AdminMarketingAttributionPanel;
