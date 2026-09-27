import React, { useEffect, useState } from 'react';
import type { StoredUser } from '../services/authService';
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
  </div>;
};

export default Settings;