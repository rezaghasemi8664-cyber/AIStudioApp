import React, { useCallback, useEffect, useState } from 'react';
import * as telegramAdmin from '../services/telegramPublisherAdminService';
import type { TelegramPublisherHistory, TelegramPublisherSettings, TelegramSchedule, TehranWeekday } from '../services/telegramPublisherAdminService';

const DAYS: { value: TehranWeekday; label: string }[] = [
  { value: 'Sat', label: 'شنبه' }, { value: 'Sun', label: 'یکشنبه' },
  { value: 'Mon', label: 'دوشنبه' }, { value: 'Tue', label: 'سه‌شنبه' },
  { value: 'Wed', label: 'چهارشنبه' }, { value: 'Thu', label: 'پنجشنبه' },
  { value: 'Fri', label: 'جمعه' }
];
const TYPE_LABELS: Record<string, string> = { valuable: 'نمادهای ارزنده', scalping: 'فرصت‌های نوسان‌گیری', index: 'شاخص‌های بورس', summary: 'خلاصه بازار' };
const DEFAULT_SETTINGS: TelegramPublisherSettings = {
  timezone: 'Asia/Tehran',
  valuable: { enabled: true, intervalMinutes: 15, days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'], maxSymbolsPerMessage: 10 },
  scalping: { enabled: true, intervalMinutes: 5, days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'], maxSymbolsPerMessage: 10 },
  index: { enabled: true, intervalMinutes: 60, startTime: '09:15', days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'] },
  summary: { enabled: true, publishTime: '13:30', days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'] }
};
const formatTehranDate = (value: string) => {
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'long', timeZone: 'Asia/Tehran' }).format(new Date(value + 'T12:00:00Z')); }
  catch { return value; }
};
const formatDate = (value: string) => {
  try { return new Intl.DateTimeFormat('fa-IR', { dateStyle: 'short', timeStyle: 'short', hour12: false, timeZone: 'Asia/Tehran' }).format(new Date(value)); }
  catch { return value; }
};
const inputClass = 'mt-1 w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-2.5 text-sm';
const cardClass = 'rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5';

const TelegramScheduleCard: React.FC<{
  title: string;
  description: string;
  value: TelegramSchedule;
  onChange: (value: TelegramSchedule) => void;
  interval?: boolean;
  maxSymbols?: boolean;
  startTime?: boolean;
  publishTime?: boolean;
}> = ({ title, description, value, onChange, interval, maxSymbols, startTime, publishTime }) => {
  const toggleDay = (day: TehranWeekday, checked: boolean) => {
    const days = checked ? [...new Set([...value.days, day])] : value.days.filter(item => item !== day);
    onChange({ ...value, days });
  };
  return <section className={cardClass}>
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div><h3 className="font-extrabold">{title}</h3><p className="mt-1 text-xs leading-6 text-gray-500">{description}</p></div>
      <label className="flex items-center gap-2 rounded-xl border border-[var(--card-border-color)] px-3 py-2 text-sm font-semibold">
        <input type="checkbox" checked={value.enabled} onChange={e => onChange({ ...value, enabled: e.target.checked })} />
        {value.enabled ? 'انتشار فعال' : 'انتشار غیرفعال'}
      </label>
    </div>
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {interval && <label className="text-sm">فاصله انتشار (دقیقه)
        <input className={inputClass} type="number" min={1} max={720} value={value.intervalMinutes ?? 15} onChange={e => onChange({ ...value, intervalMinutes: Number(e.target.value) })} />
        <span className="mt-1 block text-xs text-gray-500">مقدار مجاز: ۱ تا ۷۲۰ دقیقه</span>
      </label>}
      {maxSymbols && <label className="text-sm">حداکثر نماد در هر پیام
        <input className={inputClass} type="number" min={1} max={20} value={value.maxSymbolsPerMessage ?? 10} onChange={e => onChange({ ...value, maxSymbolsPerMessage: Number(e.target.value) })} />
        <span className="mt-1 block text-xs text-gray-500">مقدار مجاز: ۱ تا ۲۰ نماد</span>
      </label>}
      {startTime && <label className="text-sm">زمان شروع چرخه انتشار شاخص‌ها (تهران)
        <input className={inputClass} type="time" value={value.startTime ?? '09:15'} onChange={e => onChange({ ...value, startTime: e.target.value })} />
      </label>}
      {publishTime && <label className="text-sm">زمان انتشار خلاصه بازار (تهران)
        <input className={inputClass} type="time" value={value.publishTime ?? '13:30'} onChange={e => onChange({ ...value, publishTime: e.target.value })} />
      </label>}
    </div>
    <div className="mt-4">
      <div className="mb-2 text-sm font-semibold">روزهای مجاز انتشار</div>
      <div className="flex flex-wrap gap-2">
        {DAYS.map(day => <label key={day.value} className={`flex items-center gap-2 rounded-lg border border-[var(--card-border-color)] px-3 py-2 text-sm ${value.days.includes(day.value) ? 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-200' : ''}`}>
          <input type="checkbox" checked={value.days.includes(day.value)} onChange={e => toggleDay(day.value, e.target.checked)} />
          {day.label}
        </label>)}
      </div>
      {value.days.length === 0 && <p className="mt-2 text-xs text-amber-600">هیچ روزی انتخاب نشده؛ این نوع انتشار اجرا نمی‌شود.</p>}
    </div>
  </section>;
};

const AdminTelegramPublisherPanel: React.FC = () => {
  const [settings, setSettings] = useState<TelegramPublisherSettings>(DEFAULT_SETTINGS);
  const [history, setHistory] = useState<TelegramPublisherHistory | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [nextSettings, nextHistory] = await Promise.all([
        telegramAdmin.getTelegramPublisherSettings(), telegramAdmin.getTelegramPublisherHistory()
      ]);
      setSettings(nextSettings); setHistory(nextHistory);
    } catch (e) { setError(e instanceof Error ? e.message : 'دریافت اطلاعات انتشار تلگرام ناموفق بود.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { void load(); }, [load]);

  const updateGroup = (key: keyof Pick<TelegramPublisherSettings, 'valuable' | 'scalping' | 'index' | 'summary'>, value: TelegramSchedule) => {
    setSettings(previous => ({ ...previous, [key]: { ...previous[key], ...value } }));
  };

  const save = async () => {
    setSaving(true); setError(null); setMessage(null);
    try {
      const next = await telegramAdmin.saveTelegramPublisherSettings(settings);
      setSettings(next); setMessage('تنظیمات انتشار تلگرام ذخیره شد و در چرخه‌های بعدی اعمال می‌شود.');
      await refreshHistory();
    } catch (e) { setError(e instanceof Error ? e.message : 'ذخیره تنظیمات ناموفق بود.'); }
    finally { setSaving(false); }
  };

  const refreshHistory = async () => {
    try { setHistory(await telegramAdmin.getTelegramPublisherHistory()); }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت تاریخچه ناموفق بود.'); }
  };

  if (loading) return <div className="p-8 text-center text-gray-500">در حال دریافت تنظیمات انتشار تلگرام…</div>;

  return <div className="space-y-5">
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h2 className="text-xl font-extrabold">تنظیمات انتشار خودکار تلگرام</h2><p className="mt-2 text-sm text-gray-500">همه زمان‌ها، روزها و تاریخچه بر اساس منطقه زمانی تهران (Asia/Tehran) محاسبه می‌شوند. تنظیمات در پایگاه داده ذخیره می‌شوند؛ توکن ربات در این پنل نمایش داده نمی‌شود.</p></div>
        <span className="rounded-full border border-[var(--card-border-color)] px-3 py-1 text-xs">منطقه زمانی: تهران</span>
      </div>
      {error && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</div>}
      {message && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{message}</div>}
    </div>
    <TelegramScheduleCard title="نمادهای ارزنده" description="در بازه تعیین‌شده تغییرات مهم و نمادهای تازه شناسایی‌شده را منتشر می‌کند. در صورت بیشتر بودن موارد، موارد باقی‌مانده در چرخه‌های بعدی پیگیری می‌شوند." value={settings.valuable} interval maxSymbols onChange={value => updateGroup('valuable', value)} />
    <TelegramScheduleCard title="فرصت‌های نوسان‌گیری" description="فرصت‌های تازه یا تغییرات مهم را فقط با داده‌های معتبر بازار منتشر می‌کند؛ فاصله زمانی حداقل بین دو پیام رعایت می‌شود." value={settings.scalping} interval maxSymbols onChange={value => updateGroup('scalping', value)} />
    <TelegramScheduleCard title="شاخص‌های بورس" description="در ساعات بازار و فقط با تصویر تازه و معتبر بازار منتشر می‌شود. چرخه‌ها از زمان شروع انتخاب‌شده محاسبه می‌شوند." value={settings.index} interval startTime onChange={value => updateGroup('index', value)} />
    <TelegramScheduleCard title="خلاصه بازار" description="در زمان انتخاب‌شده و فقط وقتی خلاصه کامل همان روز در سامانه موجود باشد منتشر می‌شود." value={settings.summary} publishTime onChange={value => updateGroup('summary', value)} />
    <div className="flex justify-end gap-2">
      <button type="button" onClick={() => void load()} disabled={saving} className="rounded-xl border border-[var(--card-border-color)] px-4 py-2.5 text-sm">بارگذاری مجدد</button>
      <button type="button" onClick={() => void save()} disabled={saving} className="rounded-xl bg-cyan-600 px-6 py-2.5 font-semibold text-white disabled:opacity-50">{saving ? 'در حال ذخیره…' : 'ذخیره تنظیمات انتشار'}</button>
    </div>
    <section className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3"><div><h3 className="text-lg font-extrabold">تاریخچه پیام‌های امروز</h3><p className="mt-1 text-xs text-gray-500">تاریخچه فقط مربوط به امروز به وقت تهران است؛ با شروع روز جدید، تاریخچه روز قبل از این فهرست پاک می‌شود.</p></div><button type="button" onClick={() => void refreshHistory()} className="rounded-xl border border-[var(--card-border-color)] px-3 py-2 text-sm">بروزرسانی تاریخچه</button></div>
      <div className="mt-3 text-sm text-gray-500">تاریخ تهران: <b>{history?.date ? formatTehranDate(history.date) : '—'}</b> · تعداد پیام‌ها: <b>{(history?.entries || []).length.toLocaleString('fa-IR')}</b></div>
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[650px] text-right text-sm">
          <thead><tr className="border-b border-[var(--card-border-color)] text-gray-500"><th className="p-3">زمان تهران</th><th className="p-3">نوع پیام</th><th className="p-3">نتیجه</th><th className="p-3">عنوان پیام</th><th className="p-3">خطا</th></tr></thead>
          <tbody>{history?.entries?.length ? [...history.entries].reverse().map(entry => <tr key={entry.id} className="border-b border-[var(--card-border-color)] align-top">
            <td className="whitespace-nowrap p-3">{formatDate(entry.timestamp)}</td><td className="p-3">{TYPE_LABELS[entry.type] || entry.type}</td>
            <td className="p-3"><span className={`rounded-full px-2 py-1 text-xs font-semibold ${entry.status === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{entry.status === 'success' ? 'موفق' : 'ناموفق'}</span></td>
            <td className="max-w-xs whitespace-pre-wrap p-3">{entry.messageTitle || '—'}</td><td className="max-w-sm whitespace-pre-wrap p-3 text-xs text-red-600">{entry.error || '—'}</td>
          </tr>) : <tr><td colSpan={5} className="p-8 text-center text-gray-500">امروز هنوز پیامی برای انتشار ثبت نشده است.</td></tr>}</tbody>
        </table>
      </div>
    </section>
  </div>;
};

export default AdminTelegramPublisherPanel;
