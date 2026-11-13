import React, { useEffect, useState } from 'react';
import type { StoredUser } from '../services/authService';
import { userPreferences } from '../services/settingsService';
import { passkeyService, type PasskeyState } from '../services/passkeyService';
import { browserSupportsWebAuthn } from '@simplewebauthn/browser';
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

const emptyPasskeys: PasskeyState = { enabled: false, devices: [] };

const Settings: React.FC<SettingsProps> = ({ currentUser }) => {
  const { addNotification } = useNotification();
  const [theme, setTheme] = useState<ThemeMode>('system');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [passkeys, setPasskeys] = useState<PasskeyState>(emptyPasskeys);
  const [passkeyLoading, setPasskeyLoading] = useState(true);
  const [passkeyBusy, setPasskeyBusy] = useState(false);
  const [passkeyError, setPasskeyError] = useState('');

  const loadPasskeys = async () => {
    setPasskeyLoading(true);
    setPasskeyError('');
    try { setPasskeys(await passkeyService.getState()); }
    catch (error: any) { setPasskeyError(error?.message || 'دریافت تنظیمات ورود بیومتریک ناموفق بود.'); }
    finally { setPasskeyLoading(false); }
  };

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

  useEffect(() => { void loadPasskeys(); }, [currentUser.id]);

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

  const registerDevice = async () => {
    if (!browserSupportsWebAuthn()) {
      addNotification('مرورگر یا دستگاه شما از ورود بیومتریک پشتیبانی نمی‌کند.', 'error');
      return;
    }
    const currentPassword = window.prompt('برای ثبت دستگاه جدید، رمز عبور فعلی حساب خود را وارد کنید:');
    if (!currentPassword) return;
    setPasskeyBusy(true);
    setPasskeyError('');
    try {
      setPasskeys(await passkeyService.registerCurrentDevice(currentPassword, String(currentUser.username || currentUser.email || '')));
      addNotification('این دستگاه با موفقیت ثبت شد و ورود بیومتریک فعال است.', 'success');
    } catch (error: any) {
      addNotification(error?.message || 'ثبت دستگاه ناموفق بود.', 'error');
    } finally { setPasskeyBusy(false); }
  };

  const togglePasskeys = async () => {
    setPasskeyBusy(true);
    try {
      if (passkeys.enabled) {
        setPasskeys(await passkeyService.setEnabled(false));
        addNotification('ورود بیومتریک غیرفعال شد. دستگاه‌های ثبت‌شده حذف نشدند.', 'success');
      } else if (passkeys.devices.length) {
        setPasskeys(await passkeyService.setEnabled(true));
        addNotification('ورود بیومتریک فعال شد.', 'success');
      } else {
        if (!browserSupportsWebAuthn()) throw new Error('مرورگر شما از ورود بیومتریک پشتیبانی نمی‌کند.');
        const currentPassword = window.prompt('برای ثبت دستگاه جدید، رمز عبور فعلی حساب خود را وارد کنید:');
        if (!currentPassword) return;
        setPasskeys(await passkeyService.registerCurrentDevice(currentPassword, String(currentUser.username || currentUser.email || '')));
        addNotification('این دستگاه ثبت شد و ورود بیومتریک فعال است.', 'success');
      }
    } catch (error: any) {
      addNotification(error?.message || 'تغییر وضعیت ورود بیومتریک ناموفق بود.', 'error');
    } finally { setPasskeyBusy(false); }
  };

  const removeDevice = async (id: number) => {
    if (!window.confirm('آیا از حذف این دستگاه و لغو امکان ورود آن مطمئن هستید؟')) return;
    setPasskeyBusy(true);
    try {
      setPasskeys(await passkeyService.removeDevice(id));
      addNotification('دستگاه از فهرست ورود بیومتریک حذف شد.', 'success');
    } catch (error: any) { addNotification(error?.message || 'حذف دستگاه ناموفق بود.', 'error'); }
    finally { setPasskeyBusy(false); }
  };

  const removeAllDevices = async () => {
    if (!window.confirm('همه کلیدهای ورود بیومتریک حذف شوند؟ پس از آن ورود بیومتریک غیرفعال خواهد شد.')) return;
    setPasskeyBusy(true);
    try {
      setPasskeys(await passkeyService.removeAllDevices());
      addNotification('تمام دستگاه‌های ثبت‌شده حذف شدند.', 'success');
    } catch (error: any) { addNotification(error?.message || 'حذف دستگاه‌ها ناموفق بود.', 'error'); }
    finally { setPasskeyBusy(false); }
  };

  if (loading) return <div className="max-w-4xl mx-auto p-6"><div className="rounded-xl border border-[var(--card-border-color)] p-8 text-center" style={{ backgroundColor: 'var(--card-bg)' }}><div className="mx-auto w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full animate-spin" /><p className="mt-3 text-sm text-gray-500 dark:text-gray-400">در حال بارگذاری تنظیمات...</p></div></div>;

  const optionClass = (selected: boolean) => 'flex-1 min-w-[120px] rounded-xl border px-4 py-4 transition-all ' + (selected ? 'border-cyan-500 bg-cyan-50 dark:bg-cyan-900/30 ring-2 ring-cyan-500/20' : 'border-gray-200 dark:border-gray-700 hover:border-cyan-400');

  return <div className="max-w-4xl mx-auto p-2 sm:p-4 space-y-4" dir="rtl">
    <div className="rounded-xl border border-[var(--card-border-color)] shadow-sm p-6" style={{ backgroundColor: 'var(--card-bg)', color: 'var(--card-color)' }}>
      <h2 className="text-xl font-bold mb-2">تنظیمات</h2>
      <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">تنظیمات شخصی و امنیت ورود به برنامه</p>
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

    <div className="rounded-xl border border-[var(--card-border-color)] shadow-sm p-6" style={{ backgroundColor: 'var(--card-bg)', color: 'var(--card-color)' }}>
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h3 className="text-lg font-bold">امنیت ورود بیومتریک</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">ورود به رونیا با Face ID، اثر انگشت یا قفل صفحه دستگاه از طریق Passkey</p>
        </div>
        <span className={'inline-flex items-center rounded-full px-3 py-1 text-xs font-bold ' + (passkeys.enabled ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-300')}>
          {passkeyLoading ? 'در حال بررسی...' : passkeys.enabled ? 'فعال' : 'غیرفعال'}
        </span>
      </div>

      <div className="mt-5 rounded-lg border border-[var(--card-border-color)] p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <div className="font-semibold">استفاده از ورود بیومتریک</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">برای فعال‌سازی، دست‌کم یک دستگاه باید ثبت شده باشد.</p>
        </div>
        <button type="button" onClick={() => void togglePasskeys()} disabled={passkeyLoading || passkeyBusy || !browserSupportsWebAuthn()} className={'rounded-lg px-5 py-2.5 text-sm font-bold text-white disabled:opacity-50 ' + (passkeys.enabled ? 'bg-gray-600 hover:bg-gray-700' : 'bg-emerald-600 hover:bg-emerald-700')}>
          {passkeyBusy ? 'لطفاً صبر کنید...' : passkeys.enabled ? 'غیرفعال‌سازی ورود بیومتریک' : passkeys.devices.length ? 'فعال‌سازی ورود بیومتریک' : 'فعال‌سازی و ثبت این دستگاه'}
        </button>
      </div>

      {!browserSupportsWebAuthn() && <p className="mt-3 text-sm text-amber-600 dark:text-amber-400">این مرورگر از Passkey پشتیبانی نمی‌کند. لطفاً از مرورگر به‌روز و دستگاه دارای قفل صفحه استفاده کنید.</p>}
      {passkeyError && <div className="mt-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-700 dark:text-amber-300">{passkeyError}<button type="button" onClick={() => void loadPasskeys()} className="mr-2 font-bold underline">تلاش مجدد</button></div>}

      <div className="mt-6 border-t border-[var(--card-border-color)] pt-5">
        <div className="flex items-center justify-between gap-3 mb-3">
          <h4 className="font-bold">دستگاه‌های ثبت‌شده</h4>
          <button type="button" onClick={() => void registerDevice()} disabled={passkeyBusy || passkeyLoading || !browserSupportsWebAuthn()} className="rounded-lg border border-cyan-600 px-3 py-2 text-xs font-bold text-cyan-700 dark:text-cyan-300 disabled:opacity-50">ثبت دستگاه جدید</button>
        </div>
        {passkeyLoading ? <p className="text-sm text-gray-500">در حال دریافت فهرست دستگاه‌ها...</p> : passkeys.devices.length === 0 ? <p className="text-sm text-gray-500 dark:text-gray-400">هنوز دستگاهی برای ورود بیومتریک ثبت نشده است.</p> : <div className="space-y-3">
          {passkeys.devices.map((device) => <div key={device.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-[var(--card-border-color)] p-4">
            <div className="min-w-0">
              <div className="font-semibold">{device.deviceName || 'دستگاه ثبت‌شده'}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">ثبت: {new Date(device.createdAt).toLocaleDateString('fa-IR')}{device.lastUsedAt ? ' • آخرین استفاده: ' + new Date(device.lastUsedAt).toLocaleDateString('fa-IR') : ''}</div>
              <div className="mt-1 text-xs text-gray-500 dark:text-gray-400">{device.backedUp ? 'قابل همگام‌سازی با حساب دستگاه' : 'ثبت‌شده روی همین دستگاه'}</div>
            </div>
            <button type="button" onClick={() => void removeDevice(device.id)} disabled={passkeyBusy} className="self-start sm:self-center rounded-lg border border-red-300 px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 disabled:opacity-50">حذف دستگاه</button>
          </div>)}
        </div>}
        {passkeys.devices.length > 0 && <button type="button" onClick={() => void removeAllDevices()} disabled={passkeyBusy} className="mt-4 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">حذف همه دستگاه‌های ثبت‌شده</button>}
      </div>

      <p className="mt-5 text-xs leading-6 text-gray-500 dark:text-gray-400">اثر انگشت یا تصویر چهره شما به رونیا ارسال نمی‌شود؛ تأیید هویت توسط سیستم‌عامل دستگاه انجام می‌شود. هر ردیف یک کلید امنیتی است؛ اگر Passkey بین دستگاه‌ها همگام شده باشد، حذف آن کلید دسترسی همان کلید را در همه دستگاه‌های همگام‌شده لغو می‌کند. با غیرفعال‌سازی، کلیدهای ثبت‌شده حفظ می‌شوند و هر زمان می‌توانید دوباره ورود بیومتریک را فعال کنید.</p>
    </div>
  </div>;
};

export default Settings;
