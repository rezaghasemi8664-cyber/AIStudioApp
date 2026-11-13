import React, { useEffect, useState } from 'react';
import {
  getPasskeySettings, registerPasskey, setPasskeyEnabled,
  removePasskeyDevice, removeAllPasskeyDevices,
  type StoredUser, type PasskeySettings,
} from '../services/authService';
import { userPreferences } from '../services/settingsService';
import { useNotification } from './NotificationSystem';
import { SunIcon, MoonIcon, ArrowDownOnSquareIcon } from './Icons';

interface SettingsProps { currentUser: StoredUser; }
type ThemeMode = 'light' | 'dark' | 'system';

const getSystemTheme = (): 'light' | 'dark' => window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
const applyTheme = (theme: ThemeMode) => {
  const root = document.documentElement;
  if (theme === 'dark') root.classList.add('dark');
  else if (theme === 'light') root.classList.remove('dark');
  else if (getSystemTheme() === 'dark') root.classList.add('dark');
  else root.classList.remove('dark');
  if (theme === 'system') localStorage.removeItem('theme'); else localStorage.setItem('theme', theme);
};

const Settings: React.FC<SettingsProps> = ({ currentUser }) => {
  const { addNotification } = useNotification();
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passkeySettings, setPasskeySettings] = useState<PasskeySettings>({ enabled: false, devices: [] });
  const [passkeyLoading, setPasskeyLoading] = useState(true);
  const [passkeyBusy, setPasskeyBusy] = useState(false);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        const result = await userPreferences.getAll();
        const saved = result.success && result.data && typeof result.data.theme === 'string' ? result.data.theme : localStorage.getItem('theme');
        const next: ThemeMode = saved === 'dark' || saved === 'light' || saved === 'system' ? saved : 'system';
        if (mounted) { setTheme(next); applyTheme(next); }
      } catch (error) {
        console.warn('[Settings] Failed to load theme preference:', error);
        const saved = localStorage.getItem('theme');
        const next: ThemeMode = saved === 'dark' || saved === 'light' ? saved : 'system';
        if (mounted) { setTheme(next); applyTheme(next); }
      } finally { if (mounted) setLoading(false); }
    };
    void load();
    return () => { mounted = false; };
  }, [currentUser.id]);

  const refreshPasskeySettings = async (): Promise<PasskeySettings> => {
    const result = await getPasskeySettings();
    setPasskeySettings(result);
    return result;
  };

  useEffect(() => {
    let mounted = true;
    const loadPasskeys = async () => {
      try {
        const result = await getPasskeySettings();
        if (mounted) setPasskeySettings(result);
      } catch (error: any) {
        if (mounted) addNotification(error?.message || 'دریافت وضعیت ورود بیومتریک ناموفق بود.', 'error');
      } finally {
        if (mounted) setPasskeyLoading(false);
      }
    };
    void loadPasskeys();
    return () => { mounted = false; };
  }, [currentUser.id]);

  const handleRegisterPasskey = async () => {
    setPasskeyBusy(true);
    try {
      await registerPasskey();
      const updated = await refreshPasskeySettings();
      addNotification(updated.enabled ? 'دستگاه با موفقیت ثبت شد و ورود بیومتریک فعال است.' : 'دستگاه ثبت شد؛ ورود بیومتریک همچنان غیرفعال است.', 'success');
    } catch (error: any) {
      addNotification(error?.message || 'ثبت دستگاه ناموفق بود.', 'error');
    } finally { setPasskeyBusy(false); }
  };

  const handlePasskeyToggle = async () => {
    setPasskeyBusy(true);
    try {
      await setPasskeyEnabled(!passkeySettings.enabled);
      await refreshPasskeySettings();
      addNotification(passkeySettings.enabled ? 'ورود بیومتریک غیرفعال شد.' : 'ورود بیومتریک فعال شد.', 'success');
    } catch (error: any) {
      addNotification(error?.message || 'تغییر وضعیت ورود بیومتریک ناموفق بود.', 'error');
    } finally { setPasskeyBusy(false); }
  };

  const handleRemovePasskey = async (id: number) => {
    if (!window.confirm('آیا از حذف این دستگاه برای ورود بیومتریک اطمینان دارید؟')) return;
    setPasskeyBusy(true);
    try {
      await removePasskeyDevice(id);
      await refreshPasskeySettings();
      addNotification('دستگاه از فهرست ورود بیومتریک حذف شد.', 'success');
    } catch (error: any) {
      addNotification(error?.message || 'حذف دستگاه ناموفق بود.', 'error');
    } finally { setPasskeyBusy(false); }
  };

  const handleRemoveAllPasskeys = async () => {
    if (!window.confirm('تمام دستگاه‌های ثبت‌شده حذف و ورود بیومتریک غیرفعال شود؟')) return;
    setPasskeyBusy(true);
    try {
      await removeAllPasskeyDevices();
      await refreshPasskeySettings();
      addNotification('تمام دستگاه‌های بیومتریک حذف شدند.', 'success');
    } catch (error: any) {
      addNotification(error?.message || 'حذف دستگاه‌ها ناموفق بود.', 'error');
    } finally { setPasskeyBusy(false); }
  };

  const selectTheme = (next: ThemeMode) => { setTheme(next); applyTheme(next); };
  const saveTheme = async () => {
    setSaving(true);
    try {
      const result = await userPreferences.bulkSave({ theme });
      if (!result.success) throw new Error(result.message || 'ذخیره تنظیمات ناموفق بود.');
      applyTheme(theme);
      addNotification('تنظیمات تم با موفقیت ذخیره شد.', 'success');
    } catch (error: any) { addNotification(error?.message || 'خطا در ذخیره تنظیمات تم.', 'error'); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="max-w-4xl mx-auto p-6"><div className="rounded-xl border border-[var(--card-border-color)] p-8 text-center" style={{ backgroundColor: 'var(--card-bg)' }}><div className="mx-auto w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">در حال بارگذاری تنظیمات...</p></div></div>;

  const optionClass = (selected: boolean) => 'flex-1 min-w-[120px] rounded-xl border px-4 py-4 transition-all ' + (selected ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 ring-2 ring-cyan-500/20' : 'border-gray-200 dark:border-gray-700 hover:border-cyan-400');

  return <div className="max-w-4xl mx-auto p-2 sm:p-4" dir="rtl">
    <div className="rounded-xl border border-[var(--card-border-color)] shadow-sm p-6" style={{ backgroundColor: 'var(--card-bg)', color: 'var(--card-color)' }}>
      <h2 className="text-xl font-bold mb-2">تنظیمات</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">تنظیمات شخصی نمایش برنامه</p>
      <div className="border-t border-[var(--card-border-color)] pt-6">
        <h3 className="text-lg font-semibold mb-4">ظاهر برنامه</h3>
        <div className="flex flex-col sm:flex-row gap-3">
          <button type="button" onClick={() => selectTheme('light')} className={optionClass(theme === 'light')}><SunIcon className="mx-auto h-7 w-7 text-yellow-500" /><span className="block mt-2 font-semibold">روشن</span></button>
          <button type="button" onClick={() => selectTheme('dark')} className={optionClass(theme === 'dark')}><MoonIcon className="mx-auto h-7 w-7 text-gray-700 dark:text-gray-200" /><span className="block mt-2 font-semibold">تیره</span></button>
          <button type="button" onClick={() => selectTheme('system')} className={optionClass(theme === 'system')}><span className="mx-auto flex h-7 w-7 items-center justify-center rounded-full border-2 border-cyan-500 text-xs font-bold">OS</span><span className="block mt-2 font-semibold">سیستم</span></button>
        </div>
        <div className="mt-6 flex justify-start"><button type="button" onClick={() => void saveTheme()} disabled={saving} className="flex items-center gap-2 rounded-lg bg-green-600 px-6 py-2.5 font-semibold text-white hover:bg-green-700 disabled:opacity-50">{saving ? <div className="h-4 w-4 border-2 border-t-transparent border-white rounded-full animate-spin" /> : <ArrowDownOnSquareIcon className="h-5 w-5" />}{saving ? 'در حال ذخیره...' : 'ذخیره تنظیمات'}</button></div>
      </div>
    </div>

    <div className="mt-4 rounded-xl border border-[var(--card-border-color)] shadow-sm p-6" style={{ backgroundColor: 'var(--card-bg)', color: 'var(--card-color)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold">ورود بیومتریک و دستگاه‌های مورد اعتماد</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">ورود با Face ID، اثر انگشت یا قفل صفحه دستگاه از طریق Passkey</p>
        </div>
        <span className={'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ' + (passkeySettings.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300')}>
          {passkeyLoading ? 'در حال بررسی...' : passkeySettings.enabled ? 'ورود بیومتریک فعال است' : 'ورود بیومتریک غیرفعال است'}
        </span>
      </div>
      <p className="mt-3 text-sm leading-7 text-gray-500 dark:text-gray-400">
        اثر انگشت یا تصویر چهره شما به رونیا ارسال یا در سرور ذخیره نمی‌شود؛ تأیید هویت در خود دستگاه انجام می‌شود و فقط کلید عمومی امنیتی در حساب شما نگهداری خواهد شد.
      </p>

      <div className="mt-5 flex flex-wrap gap-2">
        {passkeySettings.devices.length === 0 ? (
          <button type="button" onClick={() => void handleRegisterPasskey()} disabled={passkeyBusy || passkeyLoading} className="rounded-lg bg-emerald-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-emerald-800 disabled:opacity-50">
            {passkeyBusy ? 'در حال ثبت...' : 'ثبت این دستگاه و فعال‌سازی ورود بیومتریک'}
          </button>
        ) : (
          <button type="button" onClick={() => void handlePasskeyToggle()} disabled={passkeyBusy || passkeyLoading} className={'rounded-lg px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50 ' + (passkeySettings.enabled ? 'bg-amber-600 hover:bg-amber-700' : 'bg-emerald-700 hover:bg-emerald-800')}>
            {passkeyBusy ? 'در حال ذخیره...' : passkeySettings.enabled ? 'غیرفعال‌سازی ورود بیومتریک' : 'فعال‌سازی ورود بیومتریک'}
          </button>
        )}
        {passkeySettings.devices.length > 0 && (
          <button type="button" onClick={() => void handleRegisterPasskey()} disabled={passkeyBusy || passkeyLoading} className="rounded-lg border border-cyan-600 px-4 py-2.5 text-sm font-semibold text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-900/20 disabled:opacity-50">
            افزودن دستگاه جدید
          </button>
        )}
      </div>

      <div className="mt-6 border-t border-[var(--card-border-color)] pt-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h4 className="font-semibold">دستگاه‌های ثبت‌شده ({passkeySettings.devices.length.toLocaleString('fa-IR')})</h4>
          {passkeySettings.devices.length > 0 && <button type="button" onClick={() => void handleRemoveAllPasskeys()} disabled={passkeyBusy} className="text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">حذف همه دستگاه‌ها</button>}
        </div>
        {passkeyLoading ? (
          <p className="text-sm text-gray-500">در حال دریافت فهرست دستگاه‌ها...</p>
        ) : passkeySettings.devices.length === 0 ? (
          <p className="rounded-lg bg-gray-50 dark:bg-gray-800/60 p-4 text-sm text-gray-500 dark:text-gray-400">هنوز دستگاهی برای ورود بیومتریک ثبت نشده است.</p>
        ) : (
          <div className="space-y-3">
            {passkeySettings.devices.map(device => (
              <div key={device.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-[var(--card-border-color)] p-4">
                <div className="min-w-0">
                  <p className="font-semibold break-words">{device.deviceName}</p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    ثبت‌شده: {new Date(device.createdAt).toLocaleString('fa-IR')}
                    {device.lastUsedAt ? ' · آخرین استفاده: ' + new Date(device.lastUsedAt).toLocaleString('fa-IR') : ''}
                  </p>
                  <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                    {device.deviceType === 'multiDevice' ? 'Passkey قابل همگام‌سازی' : 'Passkey مختص این دستگاه'}
                    {device.backedUp ? ' · نسخه پشتیبان موجود است' : ''}
                  </p>
                </div>
                <button type="button" onClick={() => void handleRemovePasskey(device.id)} disabled={passkeyBusy} className="shrink-0 rounded-lg border border-red-300 px-3 py-2 text-xs font-semibold text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/20 disabled:opacity-50">حذف دستگاه</button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  </div>;
};

export default Settings;