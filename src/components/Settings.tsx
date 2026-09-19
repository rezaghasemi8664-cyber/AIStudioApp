// src/components/Settings.tsx - final cleaned version

import React, { useState, useEffect, useCallback } from 'react';
import type { SettingsProps, TseLink } from '../types';
import { useNotification } from './NotificationSystem';
import * as uiConfigService from '../services/uiConfigService';
import {
  PresentationChartLineIcon,
  SunIcon,
  MoonIcon,
  TrashIcon,
  PencilIcon,
  PlusIcon,
  ArrowDownOnSquareIcon,
} from './Icons';
import { API_BASE } from '../api/config';

function getAuthHeaders(): Record<string, string> {
  const token =
    localStorage.getItem('token') || sessionStorage.getItem('token') || '';

  return {
    'Content-Type': 'application/json',
    Authorization: token ? `Bearer ${token}` : '',
  };
}

async function apiGet<T = any>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'GET',
    headers: getAuthHeaders(),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API GET ${path} failed (${res.status})`);
  }

  const json = await res.json();
  return json.data ?? json;
}

async function apiPut<T = any>(path: string, body: any): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method: 'PUT',
    headers: getAuthHeaders(),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.message || `API PUT ${path} failed (${res.status})`);
  }

  const json = await res.json();
  return json.data ?? json;
}

const Settings: React.FC<SettingsProps> = ({
  currentUser,
  initialTab = 'general',
}) => {
  const { addNotification } = useNotification();

  // فقط تب‌های مجاز
  const normalizeTab = (tab: string) => (tab === 'ui' ? 'ui' : 'general');

  const [activeTab, setActiveTab] = useState(normalizeTab(initialTab));
  const [isLoadingPrefs, setIsLoadingPrefs] = useState(true);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState(true);

  const [chartDays, setChartDays] = useState('30');
  const [chartWeeks, setChartWeeks] = useState('24');
  const [isSavingGeneral, setIsSavingGeneral] = useState(false);

  const [theme, setTheme] = useState<string>('system');

  const [tseLinks, setTseLinks] = useState<TseLink[]>([]);
  const [newTseLink, setNewTseLink] = useState({ label: '', href: '' });
  const [isSavingUi, setIsSavingUi] = useState(false);

  const loadUserPreferences = useCallback(async () => {
    setIsLoadingPrefs(true);

    try {
      const prefs = await apiGet('/user-preference');

      if (prefs) {
        setChartDays(String(prefs.chartDays ?? 30));
        setChartWeeks(String(prefs.chartWeeks ?? 24));

        if (prefs.theme) {
          setTheme(prefs.theme);
          localStorage.setItem('theme', prefs.theme);
        }
      }
    } catch (err: any) {
      console.warn(
        '[Settings] Failed to load user preferences from DB, using defaults:',
        err.message
      );

      const fallback = localStorage.getItem(`user_settings_${currentUser.id}`);
      if (fallback) {
        try {
          const parsed = JSON.parse(fallback);
          setChartDays(String(parsed.chartDays ?? 30));
          setChartWeeks(String(parsed.chartWeeks ?? 24));
        } catch {
          //
        }
      }
    } finally {
      setIsLoadingPrefs(false);
    }
  }, [currentUser.id]);

  const loadGlobalSettings = useCallback(async () => {
    if (!currentUser.isAdmin) {
      setIsLoadingGlobal(false);
      return;
    }

    setIsLoadingGlobal(true);

    try {
      const globals = await apiGet('/global-settings');

      if (globals.tseLinks) {
        const parsed =
          typeof globals.tseLinks === 'string'
            ? JSON.parse(globals.tseLinks)
            : globals.tseLinks;

        setTseLinks(Array.isArray(parsed) ? parsed : []);
      }
    } catch (err: any) {
      console.warn('[Settings] Failed to load global settings from DB:', err.message);

      try {
        uiConfigService.initializeTseLinks();
        setTseLinks(uiConfigService.getAdminLinks());
      } catch {
        //
      }
    } finally {
      setIsLoadingGlobal(false);
    }
  }, [currentUser.isAdmin]);

  useEffect(() => {
    void Promise.allSettled([loadUserPreferences(), loadGlobalSettings()]);
  }, [loadUserPreferences, loadGlobalSettings]);

  useEffect(() => {
    setActiveTab(normalizeTab(initialTab));
  }, [initialTab]);

  useEffect(() => {
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
      localStorage.setItem('theme', 'dark');
    } else if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', 'light');
    } else {
      localStorage.removeItem('theme');

      if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
        document.documentElement.classList.add('dark');
      } else {
        document.documentElement.classList.remove('dark');
      }
    }
  }, [theme]);

  const handleChartDaysChange = (value: string) => {
    const parsed = parseInt(value, 10);
    const numDays = Math.max(10, Math.min(90, Number.isFinite(parsed) ? parsed : 30));
    setChartDays(String(numDays));
  };

  const handleChartWeeksChange = (value: string) => {
    const parsed = parseInt(value, 10);
    const numWeeks = Math.max(8, Math.min(52, Number.isFinite(parsed) ? parsed : 24));
    setChartWeeks(String(numWeeks));
  };

  const handleSaveGeneralSettings = async () => {
    setIsSavingGeneral(true);

    try {
      await apiPut('/user-preference', {
        chartDays: parseInt(chartDays, 10),
        chartWeeks: parseInt(chartWeeks, 10),
        theme,
      });

      localStorage.setItem(
        `user_settings_${currentUser.id}`,
        JSON.stringify({
          chartDays: parseInt(chartDays, 10),
          chartWeeks: parseInt(chartWeeks, 10),
        })
      );

      addNotification('تنظیمات عمومی با موفقیت در سرور ذخیره شد.', 'success');
    } catch (err: any) {
      console.error('[Settings] Save user preferences failed:', err.message);
      addNotification('خطا در ذخیره تنظیمات: ' + err.message, 'error');
    } finally {
      setIsSavingGeneral(false);
    }
  };

  const handleTseLinkChange = (
    index: number,
    field: 'label' | 'href',
    value: string
  ) => {
    const newLinks = [...tseLinks];
    newLinks[index][field] = value;
    setTseLinks(newLinks);
  };

  const handleAddTseLink = (e: React.FormEvent) => {
    e.preventDefault();

    if (!newTseLink.label || !newTseLink.href) return;

    setTseLinks((prev) => [...prev, { ...newTseLink, id: `tse_${Date.now()}` }]);
    setNewTseLink({ label: '', href: '' });
  };

  const handleRemoveTseLink = (id: string) => {
    setTseLinks((prev) => prev.filter((link) => link.id !== id));
  };

  const handleSaveUiLinks = async () => {
    setIsSavingUi(true);

    try {
      const normalized = tseLinks.map((link) => ({
        label: String(link.label || '').trim(),
        href: String(link.href || '').trim(),
      }));

      uiConfigService.setAdminLinks(normalized);
      await uiConfigService.publishLinks();

      setTseLinks(normalized as TseLink[]);
      addNotification('لینک‌های TSE با موفقیت ذخیره شدند.', 'success');
    } catch (error: any) {
      addNotification(error.message || 'خطا در ذخیره لینک‌های TSE.', 'error');
    } finally {
      setIsSavingUi(false);
    }
  };

  const LoadingCard = ({ text }: { text?: string }) => (
    <div
      className="p-8 rounded-lg shadow-md border border-[var(--card-border-color)] flex flex-col items-center justify-center gap-3"
      style={{ backgroundColor: 'var(--card-bg)' }}
    >
      <div className="w-8 h-8 border-3 border-cyan-500 border-t-transparent rounded-full animate-spin" />
      <span className="text-sm text-gray-500 dark:text-gray-400">
        {text || 'در حال بارگذاری تنظیمات...'}
      </span>
    </div>
  );

  const renderGeneralSettings = () => {
    if (isLoadingPrefs) {
      return <LoadingCard text="در حال بارگذاری تنظیمات عمومی..." />;
    }

    return (
      <div
        data-style-id="settings-card"
        data-style-name="کارت تنظیمات"
        className="p-6 rounded-lg shadow-md border border-[var(--card-border-color)]"
        style={{
          backgroundColor: 'var(--settings-card-bg)',
          color: 'var(--settings-card-color)',
          fontFamily: 'var(--settings-card-font-family)',
          fontSize: 'var(--settings-card-font-size)',
        }}
      >
        <h3 className="text-lg font-semibold mb-4">تنظیمات عمومی</h3>

        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label htmlFor="chart-days" className="font-medium">تعداد روزهای نمودار روزانه</label>
            <input
              id="chart-days"
              type="number"
              min="10"
              max="90"
              value={chartDays}
              onChange={(e) => setChartDays(e.target.value)}
              onBlur={(e) => handleChartDaysChange(e.target.value)}
              className="w-24 border rounded-md px-3 py-1 focus:outline-none focus:ring-2"
            />
          </div>

          <div className="flex items-center justify-between">
            <label htmlFor="chart-weeks" className="font-medium">تعداد هفته‌های نمودار هفتگی</label>
            <input
              id="chart-weeks"
              type="number"
              min="8"
              max="52"
              value={chartWeeks}
              onChange={(e) => setChartWeeks(e.target.value)}
              onBlur={(e) => handleChartWeeksChange(e.target.value)}
              className="w-24 border rounded-md px-3 py-1 focus:outline-none focus:ring-2"
            />
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-[var(--card-border-color)]">
            <label className="font-medium">ظاهر برنامه (Theme)</label>

            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setTheme('light')} className={`p-2 rounded-full ${theme === 'light' ? 'bg-cyan-200 dark:bg-cyan-800' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <SunIcon className="h-5 w-5 text-yellow-500" />
              </button>
              <button type="button" onClick={() => setTheme('dark')} className={`p-2 rounded-full ${theme === 'dark' ? 'bg-cyan-200 dark:bg-cyan-800' : 'bg-gray-200 dark:bg-gray-700'}`}>
                <MoonIcon className="h-5 w-5 text-gray-800 dark:text-gray-200" />
              </button>
              <button type="button" onClick={() => setTheme('system')} className={`px-3 py-1.5 text-sm rounded-md ${theme === 'system' ? 'bg-cyan-200 dark:bg-cyan-800' : 'bg-gray-200 dark:bg-gray-700'}`}>
                سیستم
              </button>
            </div>
          </div>

          <div className="pt-6 flex justify-end">
            <button
              type="button"
              onClick={handleSaveGeneralSettings}
              disabled={isSavingGeneral}
              className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
            >
              {isSavingGeneral ? (
                <>
                  <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
                  <span>در حال ذخیره...</span>
                </>
              ) : (
                <>
                  <ArrowDownOnSquareIcon className="h-5 w-5" />
                  <span>ذخیره تغییرات</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  };

  const renderUiSettings = () => {
    if (isLoadingGlobal) {
      return <LoadingCard text="در حال بارگذاری تنظیمات رابط کاربری..." />;
    }

    return (
      <div className="p-6 rounded-lg shadow-md border border-[var(--card-border-color)]" style={{ backgroundColor: 'var(--card-bg)' }}>
        <h3 className="text-lg font-semibold mb-4">مدیریت لینک‌های تالار بورس</h3>

        <div className="space-y-3">
          {tseLinks.map((link, index) => (
            <div key={link.id} className="flex items-center gap-2 p-2 bg-gray-100 dark:bg-gray-700/50 rounded-md">
              <input
                type="text"
                value={link.label}
                onChange={(e) => handleTseLinkChange(index, 'label', e.target.value)}
                placeholder="عنوان"
                className="w-1/3 border rounded px-2 py-1 text-sm"
              />
              <input
                type="url"
                value={link.href}
                onChange={(e) => handleTseLinkChange(index, 'href', e.target.value)}
                placeholder="آدرس URL"
                className="flex-grow border rounded px-2 py-1 text-sm"
              />
              <button type="button" onClick={() => handleRemoveTseLink(link.id)} className="p-2 text-red-500 hover:bg-red-100 dark:hover:bg-red-900/50 rounded-full">
                <TrashIcon />
              </button>
            </div>
          ))}
        </div>

        <form onSubmit={handleAddTseLink} className="mt-4 pt-4 border-t border-[var(--card-border-color)] space-y-2">
          <h4 className="text-sm font-semibold">افزودن لینک جدید</h4>

          <div className="flex items-center gap-2">
            <input
              type="text"
              value={newTseLink.label}
              onChange={(e) => setNewTseLink((l) => ({ ...l, label: e.target.value }))}
              placeholder="عنوان"
              required
              className="w-1/3 border rounded px-3 py-2"
            />
            <input
              type="url"
              value={newTseLink.href}
              onChange={(e) => setNewTseLink((l) => ({ ...l, href: e.target.value }))}
              placeholder="آدرس کامل URL"
              required
              className="flex-grow border rounded px-3 py-2"
            />
            <button
              type="submit"
              className="font-bold rounded flex items-center justify-center gap-2 px-4 py-2 transition-colors"
              style={{ backgroundColor: 'var(--btn-primary-bg)', color: 'var(--btn-primary-color)' }}
            >
              <PlusIcon />
            </button>
          </div>
        </form>

        <div className="mt-6 flex justify-end border-t border-[var(--card-border-color)] pt-4">
          <button
            type="button"
            onClick={handleSaveUiLinks}
            disabled={isSavingUi}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 disabled:bg-gray-400 transition-colors"
          >
            {isSavingUi ? (
              <>
                <div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin" />
                <span>در حال انتشار...</span>
              </>
            ) : (
              <>
                <ArrowDownOnSquareIcon className="h-5 w-5" />
                <span>ذخیره و انتشار تغییرات</span>
              </>
            )}
          </button>
        </div>
      </div>
    );
  };

  const TabButton = ({
    tabId,
    label,
    icon,
  }: {
    tabId: 'general' | 'ui';
    label: string;
    icon: React.ReactElement;
  }) => {
    const isActive = activeTab === tabId;

    return (
      <button
        type="button"
        onClick={() => setActiveTab(tabId)}
        className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
          isActive
            ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
            : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
        }`}
      >
        {icon}
        <span>{label}</span>
      </button>
    );
  };

  return (
    <div className="max-w-7xl mx-auto">
      <div className="border-b border-gray-200 dark:border-gray-700 mb-6">
        <nav className="-mb-px flex space-x-4 rtl:space-x-reverse" aria-label="Tabs">
          <TabButton
            tabId="general"
            label="عمومی و ظاهر"
            icon={<PresentationChartLineIcon />}
          />
          {currentUser.isAdmin && (
            <TabButton
              tabId="ui"
              label="رابط کاربری"
              icon={<PencilIcon />}
            />
          )}
        </nav>
      </div>

      <div>
        {activeTab === 'general' && renderGeneralSettings()}
        {currentUser.isAdmin && activeTab === 'ui' && renderUiSettings()}
      </div>
    </div>
  );
};

export default Settings;
