import React, { useState, useEffect, useMemo } from 'react';
import * as themeService from '../services/themeService';
import type { ElementStyles, AppFont, ThemeableElement, WelcomeBannerConfig } from '../types';
import { TrashIcon, ArrowDownOnSquareIcon } from './Icons';
import { useNotification } from './NotificationSystem';

interface ThemeStudioProps {
  allFonts?: AppFont[];
}

const ThemeStudio: React.FC<ThemeStudioProps> = ({ allFonts }) => {
  const { addNotification } = useNotification();
  const [elements, setElements] = useState<ThemeableElement[]>([]);
  const [selectedElementId, setSelectedElementId] = useState<string | null>(null);
  const [styles, setStyles] = useState<Partial<ElementStyles>>({});
  const [isSaving, setIsSaving] = useState(false);

  const [bannerConfig, setBannerConfig] = useState<WelcomeBannerConfig>({
    text: '',
    durationSeconds: 10,
  });

  const safeFonts = useMemo<AppFont[]>(() => {
    return Array.isArray(allFonts) ? allFonts : [];
  }, [allFonts]);

  useEffect(() => {
    let cancelled = false;

    const loadBannerConfig = async () => {
      try {
        const loaded = await themeService.getWelcomeBannerConfig();
        if (!cancelled) setBannerConfig(loaded);
      } catch (error) {
        console.error('Error loading welcome banner config:', error);
      }
    };

    setElements(themeService.getAllThemeableElements());
    void loadBannerConfig();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (selectedElementId) {
      setStyles(themeService.getStylesFor(selectedElementId));
    } else {
      setStyles({});
    }
  }, [selectedElementId]);

  const handleStyleChange = (property: keyof ElementStyles, value: any) => {
    if (!selectedElementId) return;

    setStyles((prev) => ({ ...prev, [property]: value }));
    themeService.updateStyle(selectedElementId, property, value);
  };

  const handleReset = () => {
    if (!selectedElementId) return;

    themeService.resetStyle(selectedElementId);
    setStyles(themeService.getStylesFor(selectedElementId));
  };

  const handleSaveAndPublish = async () => {
    setIsSaving(true);

    try {
      await themeService.publishGlobalTheme();
      await themeService.setWelcomeBannerConfig(bannerConfig);
      addNotification('تغییرات ظاهری و تنظیمات با موفقیت در سرور ذخیره و اعمال شد.', 'success');
    } catch (e) {
      console.error('Error saving theme:', e);
      addNotification('خطا در ذخیره‌سازی تم.', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const groupedElements = useMemo(() => {
    return elements.reduce((acc, el) => {
      const group = acc[el.group] || [];
      group.push(el);
      acc[el.group] = group;
      return acc;
    }, {} as Record<string, ThemeableElement[]>);
  }, [elements]);

  const isIconSelected = selectedElementId?.startsWith('icon-');
  const isBannerSelected = selectedElementId === 'welcome-banner-text';

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 p-6 rounded-lg shadow-md border border-[var(--card-border-color)] bg-[var(--card-bg)]">
      <div className="lg:col-span-1 h-[60vh] overflow-y-auto pr-2">
        <h3 className="text-lg font-semibold mb-4 text-cyan-600 dark:text-cyan-400">المان‌های قابل ویرایش</h3>
        {Object.entries(groupedElements).map(([groupName, groupElements]) => (
          <div key={groupName} className="mb-4">
            <h4 className="font-bold text-gray-700 dark:text-gray-300 mb-2">{groupName}</h4>
            <div className="space-y-1">
              {(groupElements as ThemeableElement[]).map((el) => (
                <button key={el.id} onClick={() => setSelectedElementId(el.id)} className={`w-full text-right p-2 rounded-md text-sm transition-colors ${selectedElementId === el.id ? 'bg-cyan-100 dark:bg-cyan-800/50 text-cyan-700 dark:text-cyan-300 font-semibold' : 'hover:bg-gray-100 dark:hover:bg-gray-700/50'}`}>
                  {el.name}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="lg:col-span-2 h-[60vh] flex flex-col">
        <div className="flex-grow overflow-y-auto pb-4">
          {selectedElementId ? (
            <div className="space-y-6">
              <div>
                <h3 className="text-lg font-semibold text-gray-800 dark:text-white">
                  ویرایش:{' '}
                  <span className="text-cyan-600 dark:text-cyan-400">{elements.find((e) => e.id === selectedElementId)?.name}</span>
                </h3>
              </div>

              {isBannerSelected && (
                <div className="space-y-4 p-4 border border-yellow-400/50 bg-yellow-50 dark:bg-yellow-900/10 rounded-md">
                  <h4 className="font-semibold text-yellow-700 dark:text-yellow-500">تنظیمات محتوا</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">متن پیام خوش‌آمدگویی</label>
                    <textarea rows={4} value={bannerConfig.text} onChange={(e) => setBannerConfig((prev) => ({ ...prev, text: e.target.value }))} className="w-full border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-yellow-500" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">مدت زمان نمایش (ثانیه)</label>
                    <input type="number" min="3" max="60" value={bannerConfig.durationSeconds} onChange={(e) => setBannerConfig((prev) => ({ ...prev, durationSeconds: parseInt(e.target.value, 10) || 10 }))} className="w-24 border rounded-md px-3 py-2 text-sm bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 focus:ring-2 focus:ring-yellow-500" />
                  </div>
                </div>
              )}

              {isIconSelected ? (
                <div className="space-y-4 p-4 border border-[var(--card-border-color)] rounded-md">
                  <h4 className="font-semibold">رنگ و اندازه</h4>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">رنگ آیکون</label>
                    <input type="color" value={styles.color || '#000000'} onChange={(e) => handleStyleChange('color', e.target.value)} className="w-full h-10 p-1 bg-white border border-gray-300 rounded cursor-pointer dark:bg-gray-700 dark:border-gray-600" />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اندازه آیکون ({styles.size || '20'}px)</label>
                    <input type="range" min="8" max="72" value={styles.size || '20'} onChange={(e) => handleStyleChange('size', e.target.value)} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-4 p-4 border border-[var(--card-border-color)] rounded-md">
                    <h4 className="font-semibold">تایپوگرافی</h4>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">فونت</label>
                      <select value={styles.fontFamily || 'inherit'} onChange={(e) => handleStyleChange('fontFamily', e.target.value)} className="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg p-2">
                        <option value="inherit">پیش‌فرض برنامه</option>
                        {safeFonts.map((f) => <option key={f.id} value={f.name}>{f.name}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">اندازه فونت ({styles.fontSize || '16'}px)</label>
                      <input type="range" min="8" max="32" value={styles.fontSize || '16'} onChange={(e) => handleStyleChange('fontSize', e.target.value)} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">رنگ متن</label>
                      <input type="color" value={styles.color || '#000000'} onChange={(e) => handleStyleChange('color', e.target.value)} className="w-full h-10 p-1 bg-white border border-gray-300 rounded cursor-pointer dark:bg-gray-700 dark:border-gray-600" />
                    </div>
                  </div>

                  {!isBannerSelected && (
                    <>
                      <div className="space-y-4 p-4 border border-[var(--card-border-color)] rounded-md">
                        <h4 className="font-semibold">پس‌زمینه</h4>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">رنگ پس‌زمینه</label>
                          <input type="color" value={styles.backgroundColor || '#ffffff'} onChange={(e) => handleStyleChange('backgroundColor', e.target.value)} className="w-full h-10 p-1 bg-white border border-gray-300 rounded cursor-pointer dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                      </div>
                      <div className="space-y-4 p-4 border border-[var(--card-border-color)] rounded-md">
                        <h4 className="font-semibold">کادر دور (Border)</h4>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">رنگ کادر</label>
                          <input type="color" value={styles.borderColor || '#e5e7eb'} onChange={(e) => handleStyleChange('borderColor', e.target.value)} className="w-full h-10 p-1 bg-white border border-gray-300 rounded cursor-pointer dark:bg-gray-700 dark:border-gray-600" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">ضخامت کادر ({styles.borderWidth || '1'}px)</label>
                          <input type="range" min="0" max="10" value={styles.borderWidth || '1'} onChange={(e) => handleStyleChange('borderWidth', e.target.value)} className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer dark:bg-gray-700" />
                        </div>
                        <div>
                          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">استایل کادر</label>
                          <select value={styles.borderStyle || 'solid'} onChange={(e) => handleStyleChange('borderStyle', e.target.value as any)} className="w-full bg-gray-200 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white text-sm rounded-lg p-2">
                            <option value="solid">Solid</option>
                            <option value="dashed">Dashed</option>
                            <option value="dotted">Dotted</option>
                            <option value="none">None</option>
                          </select>
                        </div>
                      </div>
                    </>
                  )}
                </>
              )}

              <div className="flex justify-end pt-4">
                <button onClick={handleReset} className="flex items-center gap-2 text-sm font-semibold text-red-600 hover:text-red-800 dark:text-red-400 dark:hover:text-red-300">
                  <TrashIcon />
                  <span>بازنشانی به حالت پیش‌فرض</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-full text-center text-gray-500"><p>یک المان را از لیست سمت راست برای ویرایش انتخاب کنید.</p></div>
          )}
        </div>

        <div className="mt-4 pt-4 border-t border-[var(--card-border-color)] flex justify-end">
          <button onClick={handleSaveAndPublish} disabled={isSaving} className="flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-md hover:bg-blue-700 transition-colors disabled:bg-gray-400 font-bold">
            {isSaving ? <><div className="w-4 h-4 border-2 border-t-transparent border-white rounded-full animate-spin"></div><span>در حال انتشار...</span></> : <><ArrowDownOnSquareIcon className="h-5 w-5" /><span>ذخیره و انتشار تغییرات ظاهری</span></>}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ThemeStudio;
