import React, { useCallback, useEffect, useState } from 'react';
import {
  DEFAULT_TELEGRAM_CUSTOM_MESSAGES,
  getTelegramCustomMessageSettings,
  saveTelegramCustomMessageSettings,
  publishTelegramCustomMessageNow
} from '../services/telegramPublisherAdminService';
import type { TelegramAdMessageSettings, TelegramCustomMessageKey, TehranWeekday } from '../services/telegramPublisherAdminService';

const DAYS: { value: TehranWeekday; label: string }[] = [
  { value: 'Sat', label: 'شنبه' }, { value: 'Sun', label: 'یکشنبه' },
  { value: 'Mon', label: 'دوشنبه' }, { value: 'Tue', label: 'سه‌شنبه' },
  { value: 'Wed', label: 'چهارشنبه' }, { value: 'Thu', label: 'پنجشنبه' },
  { value: 'Fri', label: 'جمعه' }
];
const SECTIONS: { key: TelegramCustomMessageKey; fallback: string; description: string }[] = [
  { key: 'ad-message', fallback: 'پیام تبلیغات در کانال تلگرام رونیا', description: 'پیام تبلیغاتی کانال؛ انتشار زمان‌بندی‌شده یا آنی.' },
  { key: 'membership-message', fallback: 'پیام عضویت در کانال تلگرام رونیا', description: 'پیام مستقل برای اطلاع‌رسانی عضویت در کانال؛ تنظیمات آن از دو بخش دیگر جداست.' },
  { key: 'channel-message', fallback: 'ارسال پیام در کانال تلگرام رونیا', description: 'برای ارسال پیام‌های عمومی کانال با زمان‌بندی و تنظیمات مستقل.' }
];
const cardClass = 'rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5';
const inputClass = 'mt-1 w-full rounded-xl border border-[var(--card-border-color)] bg-transparent p-2.5 text-sm';

const AdminTelegramCustomMessages: React.FC = () => {
  const [values, setValues] = useState<Record<TelegramCustomMessageKey, TelegramAdMessageSettings>>(DEFAULT_TELEGRAM_CUSTOM_MESSAGES);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<Record<string, 'save' | 'publish' | null>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [notices, setNotices] = useState<Record<string, string>>({});
  const [newTimes, setNewTimes] = useState<Record<string, string>>({ 'ad-message': '12:00', 'membership-message': '12:00', 'channel-message': '12:00' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entries = await Promise.all(SECTIONS.map(async section => [section.key, await getTelegramCustomMessageSettings(section.key)] as const));
      setValues(previous => ({ ...previous, ...Object.fromEntries(entries) }));
    } catch (error) {
      setErrors(previous => ({ ...previous, load: error instanceof Error ? error.message : 'دریافت تنظیمات پیام‌های تلگرام ناموفق بود.' }));
    } finally { setLoading(false); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const update = (key: TelegramCustomMessageKey, patch: Partial<TelegramAdMessageSettings>) => {
    setValues(previous => ({ ...previous, [key]: { ...previous[key], ...patch } }));
    setErrors(previous => ({ ...previous, [key]: '' }));
    setNotices(previous => ({ ...previous, [key]: '' }));
  };

  const save = async (key: TelegramCustomMessageKey) => {
    setBusy(previous => ({ ...previous, [key]: 'save' }));
    setErrors(previous => ({ ...previous, [key]: '' }));
    setNotices(previous => ({ ...previous, [key]: '' }));
    try {
      const next = await saveTelegramCustomMessageSettings(key, values[key]);
      setValues(previous => ({ ...previous, [key]: next }));
      setNotices(previous => ({ ...previous, [key]: 'تنظیمات، عنوان و زمان‌بندی این بخش ذخیره شد.' }));
    } catch (error) {
      setErrors(previous => ({ ...previous, [key]: error instanceof Error ? error.message : 'ذخیره تنظیمات ناموفق بود.' }));
    } finally { setBusy(previous => ({ ...previous, [key]: null })); }
  };

  const publish = async (key: TelegramCustomMessageKey) => {
    setBusy(previous => ({ ...previous, [key]: 'publish' }));
    setErrors(previous => ({ ...previous, [key]: '' }));
    setNotices(previous => ({ ...previous, [key]: '' }));
    try {
      const result = await publishTelegramCustomMessageNow(key, values[key]);
      setNotices(previous => ({ ...previous, [key]: result.message || 'پیام با موفقیت در کانال منتشر شد.' }));
    } catch (error) {
      setErrors(previous => ({ ...previous, [key]: error instanceof Error ? error.message : 'انتشار پیام ناموفق بود.' }));
    } finally { setBusy(previous => ({ ...previous, [key]: null })); }
  };

  if (loading) return <div className="p-5 text-center text-sm text-gray-500">در حال دریافت تنظیمات پیام‌های تلگرام…</div>;

  return <div className="space-y-5">
    {errors.load && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errors.load}</div>}
    {SECTIONS.map(section => {
      const value = values[section.key];
      const maxLength = value.imageDataUrl ? 1024 : 4096;
      const isBusy = Boolean(busy[section.key]);
      return <section key={section.key} className={cardClass}>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-extrabold">{value.title || section.fallback}</h2>
            <p className="mt-1 text-xs leading-6 text-gray-500">{section.description} تصویر پیوست اختیاری است؛ بدون تصویر پیام متنی و با تصویر پیام تصویری ارسال می‌شود.</p>
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-[var(--card-border-color)] px-3 py-2 text-sm font-semibold">
            <input type="checkbox" checked={value.enabled} onChange={event => update(section.key, { enabled: event.target.checked })} />
            {value.enabled ? 'انتشار زمان‌بندی‌شده فعال' : 'انتشار زمان‌بندی‌شده غیرفعال'}
          </label>
        </div>
        {errors[section.key] && <div className="mt-4 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">{errors[section.key]}</div>}
        {notices[section.key] && <div className="mt-4 rounded-xl border border-green-200 bg-green-50 p-3 text-sm text-green-700">{notices[section.key]}</div>}

        <label className="mt-4 block text-sm font-semibold">نام قابل نمایش این بخش
          <input className={inputClass} maxLength={100} value={value.title} onChange={event => update(section.key, { title: event.target.value })} placeholder={section.fallback} />
        </label>
        <label className="mt-4 block text-sm font-semibold">متن پیام
          <textarea className={inputClass + ' min-h-36 resize-y'} rows={6} maxLength={maxLength} value={value.text} onChange={event => update(section.key, { text: event.target.value })} placeholder="متن پیام را وارد کنید…" />
          <span className="mt-1 block text-left text-xs text-gray-500">{value.text.length.toLocaleString('fa-IR')} از {maxLength.toLocaleString('fa-IR')} نویسه</span>
        </label>

        <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-[minmax(0,1fr)_180px]">
          <div>
            <label className="block text-sm font-semibold">تصویر پیوست (اختیاری؛ JPG، PNG یا WEBP تا ۵ مگابایت)
              <input type="file" accept="image/jpeg,image/png,image/webp" onChange={event => {
                const file = event.target.files?.[0];
                if (!file) return;
                if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setErrors(p => ({ ...p, [section.key]: 'فرمت تصویر معتبر نیست؛ فقط JPG، PNG یا WEBP مجاز است.' })); event.currentTarget.value = ''; return; }
                if (file.size > 5 * 1024 * 1024) { setErrors(p => ({ ...p, [section.key]: 'حجم تصویر باید حداکثر ۵ مگابایت باشد.' })); event.currentTarget.value = ''; return; }
                const reader = new FileReader();
                reader.onload = () => { if (typeof reader.result === 'string') update(section.key, { imageDataUrl: reader.result }); };
                reader.onerror = () => setErrors(p => ({ ...p, [section.key]: 'خواندن فایل تصویر ناموفق بود؛ دوباره انتخاب کنید.' }));
                reader.readAsDataURL(file);
              }} className={inputClass + ' file:ml-3 file:rounded-lg file:border-0 file:bg-cyan-50 file:px-3 file:py-2 file:text-cyan-700'} />
            </label>
            <p className="mt-2 text-xs text-gray-500">بدون تصویر: ارسال پیام متنی. با تصویر: ارسال عکس همراه کپشن.</p>
            {value.imageDataUrl && <button type="button" onClick={() => update(section.key, { imageDataUrl: '' })} className="mt-3 rounded-lg border border-red-200 px-3 py-2 text-xs text-red-600">حذف تصویر پیوست</button>}
          </div>
          <div className="overflow-hidden rounded-xl border border-[var(--card-border-color)] bg-gray-50 dark:bg-gray-800/50">
            {value.imageDataUrl ? <img src={value.imageDataUrl} alt="پیش‌نمایش تصویر پیام" className="aspect-square w-full object-contain" /> : <div className="flex aspect-square items-center justify-center p-4 text-center text-sm text-gray-500">بدون تصویر</div>}
          </div>
        </div>

        <div className="mt-5">
          <div className="mb-2 text-sm font-semibold">روزهای مجاز انتشار خودکار</div>
          <div className="flex flex-wrap gap-2">{DAYS.map(day => <label key={day.value} className={`flex items-center gap-2 rounded-lg border border-[var(--card-border-color)] px-3 py-2 text-sm ${value.days.includes(day.value) ? 'bg-cyan-50 text-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-200' : ''}`}>
            <input type="checkbox" checked={value.days.includes(day.value)} onChange={event => update(section.key, { days: event.target.checked ? [...new Set([...value.days, day.value])] : value.days.filter(item => item !== day.value) })} />{day.label}
          </label>)}</div>
        </div>
        <div className="mt-5">
          <div className="mb-2 text-sm font-semibold">ساعت‌های انتشار (تهران)</div>
          <div className="flex flex-wrap items-center gap-2">
            {value.times.map((time, index) => <div key={time} className="flex items-center gap-2 rounded-lg border border-[var(--card-border-color)] p-2">
              <input aria-label={`ساعت انتشار ${index + 1}`} type="time" value={time} onChange={event => update(section.key, { times: [...value.times.filter((_, i) => i !== index), event.target.value].filter(Boolean).filter((item, i, all) => all.indexOf(item) === i).sort() })} className="rounded-lg border border-[var(--card-border-color)] bg-transparent p-1.5 text-sm" />
              <button type="button" onClick={() => update(section.key, { times: value.times.filter((_, i) => i !== index) })} className="rounded-md px-2 py-1 text-red-600">حذف</button>
            </div>)}
            <div className="flex items-center gap-2">
              <input aria-label="ساعت جدید" type="time" value={newTimes[section.key]} onChange={event => setNewTimes(p => ({ ...p, [section.key]: event.target.value }))} className="rounded-lg border border-[var(--card-border-color)] bg-transparent p-2 text-sm" />
              <button type="button" onClick={() => { const time = newTimes[section.key]; if (!value.times.includes(time)) update(section.key, { times: [...value.times, time].sort() }); }} className="rounded-lg border border-[var(--card-border-color)] px-3 py-2 text-sm">افزودن ساعت</button>
            </div>
          </div>
          {value.enabled && (!value.days.length || !value.times.length) && <p className="mt-2 text-xs text-amber-600">برای انتشار زمان‌بندی‌شده حداقل یک روز و یک ساعت انتخاب کنید.</p>}
        </div>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <button type="button" disabled={isBusy} onClick={() => void save(section.key)} className="rounded-xl border border-[var(--card-border-color)] px-4 py-2.5 text-sm disabled:opacity-50">{busy[section.key] === 'save' ? 'در حال ذخیره…' : 'ذخیره تنظیمات'}</button>
          <button type="button" disabled={isBusy} onClick={() => void publish(section.key)} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">{busy[section.key] === 'publish' ? 'در حال انتشار…' : 'انتشار آنی'}</button>
        </div>
      </section>;
    })}
  </div>;
};

export default AdminTelegramCustomMessages;
