// src/services/themeService.ts
import type { ThemeSettings, ElementStyles, ThemeableElement, WelcomeBannerConfig } from '../types';
import type { ApiResult } from '../types';
import { safeApi } from './apiResult';

// ==============================
// Constants
// ==============================

const THEME_KEY = 'app_theme_settings';
const GLOBAL_THEME_KEY = 'global_app_theme_settings';

// Backend-first: welcome banner key is managed server-side
const DEFAULT_WELCOME_BANNER_CONFIG: WelcomeBannerConfig = {
  text: 'به استودیوی طراحی خوش آمدید. در این بخش می‌توانید ظاهر اجزای مختلف سامانه را شخصی‌سازی کرده و تغییرات را به‌صورت سراسری اعمال کنید.',
  durationSeconds: 10,
};

// This object defines all elements that can be styled by the Theme Studio.
// The actual default values are set in CSS variables. This is for metadata.
const THEMEABLE_ELEMENTS_METADATA: Record<string, { name: string; group: string }> = {
 header: { name: 'هدر اصلی', group: 'عمومی' },
  'main-content': { name: 'محتوای اصلی', group: 'عمومی' },
  'tab-active': { name: 'تب فعال', group: 'عمومی' },
  'tab-inactive': { name: 'تب غیرفعال', group: 'عمومی' },
  'market-index-open': { name: 'شاخص (بازار باز)', group: 'عمومی' },
  'market-index-closed': { name: 'شاخص (بازار بسته)', group: 'عمومی' },
  // --- Welcome Banner ---
  'welcome-banner-text': { name: 'متن بنر خوش‌آمدگویی', group: 'عمومی' },
  // --- Logo ---
  'ronia-logo-bg': { name: 'لوگو: دایره پس‌زمینه', group: 'لوگو' },
  'ronia-logo-fg': { name: 'لوگو: دایره جلویی', group: 'لوگو' },
  'ronia-logo-bars': { name: 'لوگو: میله‌ها', group: 'لوگو' },
  'ronia-logo-swoosh': { name: 'لوگو: خط منحنی', group: 'لوگو' },
  // --- Login Page ---
  'login-card': { name: 'کارت ورود', group: 'صفحه ورود' },
  'login-button': { name: 'دکمه ورود', group: 'صفحه ورود' },
  // --- Stock Analysis Page ---
  'analysis-form-card': { name: 'فرم تحلیل', group: 'تحلیل سهم' },
  'analysis-button': { name: 'دکمه تحلیل', group: 'تحلیل سهم' },
  'analysis-result-card': { name: 'نتیجه تحلیل', group: 'تحلیل سهم' },
  'analysis-history-card': { name: 'تاریخچه تحلیل', group: 'تحلیل سهم' },
  'most-traded-card': { name: 'کارت پرتراکنش‌ها', group: 'تحلیل سهم' },
  'most-traded-header': { name: 'هدر پرتراکنش‌ها', group: 'تحلیل سهم' },
  'most-traded-rows': { name: 'ردیف پرتراکنش‌ها', group: 'تحلیل سهم' },
  'analysis-market-summary-card': { name: 'کارت خلاصه بازار', group: 'تحلیل سهم' },
  'analysis-recommendation-box': { name: 'کادر توصیه تحلیل', group: 'تحلیل سهم' },
  'analysis-section-header': { name: 'تیتر بخش تحلیل', group: 'تحلیل سهم' },
  'analysis-history-item': { name: 'آیتم تاریخچه تحلیل', group: 'تحلیل سهم' },
  // --- Stock Comparison Page ---
  'comparison-page': { name: 'صفحه مقایسه سهام', group: 'مقایسه سهام' },
  'comparison-recommendation-card': { name: 'کارت توصیه نهایی', group: 'مقایسه سهام' },
  'comparison-summary-card': { name: 'کارت خلاصه مقایسه', group: 'مقایسه سهام' },
  'comparison-side-by-side-card': { name: 'کارت تحلیل جانبی', group: 'مقایسه سهام' },
  // --- Scalping Page ---
  'scalping-card': { name: 'کارت نوسان‌گیری', group: 'نوسان‌گیری' },
  'scalping-header': { name: 'هدر نوسان‌گیری', group: 'نوسان‌گیری' },
  'scalping-last-updated': { name: 'متن آخرین بروزرسانی', group: 'نوسان‌گیری' },
  'scalping-placeholder': { name: 'کادر پیام', group: 'نوسان‌گیری' },
  // --- Portfolio Page ---
  'portfolio-item-card': { name: 'کارت سهم سبد', group: 'سبد سهام' },
  'portfolio-add-form': { name: 'فرم افزودن به سبد', group: 'سبد سهام' },
  'portfolio-pie-chart-card': { name: 'کارت نمودار سبد', group: 'سبد سهام' },
  'portfolio-optimize-button-container': { name: 'دکمه بهینه‌سازی', group: 'سبد سهام' },
  'portfolio-placeholder': { name: 'کادر پیام', group: 'سبد سهام' },
  'portfolio-optimization-modal': { name: 'پنجره بهینه‌سازی', group: 'سبد سهام' },
  'portfolio-suggestion-increase': { name: 'پیشنهاد: افزایش', group: 'سبد سهام' },
  'portfolio-suggestion-hold': { name: 'پیشنهاد: نگهداری', group: 'سبد سهام' },
  'portfolio-suggestion-decrease': { name: 'پیشنهاد: کاهش', group: 'سبد سهام' },
  'portfolio-suggestion-sell': { name: 'پیشنهاد: فروش', group: 'سبد سهام' },
  // --- User Profile Page ---
  'user-profile-info-card': { name: 'کارت اطلاعات کاربری', group: 'پروفایل کاربر' },
  'user-profile-validity-card': { name: 'کارت اعتبار اکانت', group: 'پروفایل کاربر' },
  'user-profile-message-card': { name: 'کارت پیغام به ادمین', group: 'پروفایل کاربر' },
  'user-profile-guest-settings-card': { name: 'کارت تنظیمات میهمان', group: 'پروفایل کاربر' },
  'user-profile-guest-management-card': { name: 'کارت مدیریت میهمان', group: 'پروفایل کاربر' },
  'password-form-card': { name: 'فرم تغییر رمز', group: 'پروفایل کاربر' },
  // --- User Management Page ---
  'user-management-add-form': { name: 'فرم افزودن کاربر', group: 'مدیریت کاربران' },
  'user-management-table-header': { name: 'هدر جدول کاربران', group: 'مدیریت کاربران' },
  'user-management-table-rows': { name: 'ردیف‌های جدول کاربران', group: 'مدیریت کاربران' },
  // --- Sources Page ---
  'sources-api-card': { name: 'کارت API سرور', group: 'مدیریت منابع' },
  // --- Notifications Page ---
  'notifications-form-card': { name: 'فرم ارسال اطلاعیه', group: 'اطلاع‌رسانی' },
  'notifications-send-button': { name: 'دکمه ارسال اطلاعیه', group: 'اطلاع‌رسانی' },
  // --- Settings Page ---
  'settings-card': { name: 'کارت تنظیمات عمومی', group: 'تنظیمات' },
  'settings-user-access-card': { name: 'کارت کنترل دسترسی', group: 'تنظیمات' },
  'settings-update-card': { name: 'کارت به‌روزرسانی', group: 'تنظیمات' },
  'settings-version-upload-form': { name: 'فرم آپلود نسخه', group: 'تنظیمات' },
  'settings-version-management-card': { name: 'کارت مدیریت نسخه‌ها', group: 'تنظیمات' },
  // --- Icons ---
  'icon-magnifying-glass': { name: 'آیکون: ذره‌بین', group: 'آیکون‌ها' },
  'icon-chart-bar': { name: 'آیکون: نمودار میله‌ای', group: 'آیکون‌ها' },
  'icon-briefcase': { name: 'آیکون: کیف', group: 'آیکون‌ها' },
  'icon-sparkles': { name: 'آیکون: درخشش', group: 'آیکون‌ها' },
  'icon-bell': { name: 'آیکون: زنگوله', group: 'آیکون‌ها' },
  'icon-check-circle': { name: 'آیکون: تیک دایره', group: 'آیکون‌ها' },
  'icon-x-circle': { name: 'آیکون: ضربدر دایره', group: 'آیکون‌ها' },
  'icon-info': { name: 'آیکون: اطلاعات', group: 'آیکون‌ها' },
  'icon-plus': { name: 'آیکون: بعلاوه', group: 'آیکون‌ها' },
  'icon-trash': { name: 'آیکون: سطل زباله', group: 'آیکون‌ها' },
  'icon-arrow-trending-up': { name: 'آیکون: روند صعودی', group: 'آیکون‌ها' },
  'icon-arrow-trending-down': { name: 'آیکون: روند نزولی', group: 'آیکون‌ها' },
  'icon-chevron-down': { name: 'آیکون: فلش پایین', group: 'آیکون‌ها' },
  'icon-user-group': { name: 'آیکون: گروه کاربران', group: 'آیکون‌ها' },
  'icon-cog-6-tooth': { name: 'آیکون: چرخ‌دنده', group: 'آیکون‌ها' },
  'icon-arrow-right-on-rectangle': { name: 'آیکون: خروج', group: 'آیکون‌ها' },
  'icon-lock-closed': { name: 'آیکون: قفل', group: 'آیکون‌ها' },
  'icon-clock': { name: 'آیکون: ساعت', group: 'آیکون‌ها' },
  'icon-x-mark': { name: 'آیکون: ضربدر', group: 'آیکون‌ها' },
  'icon-key': { name: 'آیکون: کلید', group: 'آیکون‌ها' },
  'icon-arrow-uturn-left': { name: 'آیکون: بازگشت', group: 'آیکون‌ها' },
  'icon-calendar-days': { name: 'آیکون: تقویم', group: 'آیکون‌ها' },
  'icon-presentation-chart-line': { name: 'آیکون: نمودار ارائه', group: 'آیکون‌ها' },
  'icon-eye': { name: 'آیکون: چشم', group: 'آیکون‌ها' },
  'icon-eye-slash': { name: 'آیکون: چشم خط‌خورده', group: 'آیکون‌ها' },
  'icon-sun': { name: 'آیکون: خورشید', group: 'آیکون‌ها' },
  'icon-moon': { name: 'آیکون: ماه', group: 'آیکون‌ها' },
  'icon-globe-alt': { name: 'آیکون: کره زمین', group: 'آیکون‌ها' },
  'icon-wifi-slash': { name: 'آیکون: آفلاین', group: 'آیکون‌ها' },
  'icon-pencil': { name: 'آیکون: مداد', group: 'آیکون‌ها' },
  'icon-check': { name: 'آیکون: تیک', group: 'آیکون‌ها' },
  'icon-megaphone': { name: 'آیکون: بلندگو', group: 'آیکون‌ها' },
  'icon-user-circle': { name: 'آیکون: کاربر دایره', group: 'آیکون‌ها' },
  'icon-paint-brush': { name: 'آیکون: قلم‌مو', group: 'آیکون‌ها' },
  'icon-paper-airplane': { name: 'آیکون: موشک کاغذی', group: 'آیکون‌ها' },
  'icon-envelope': { name: 'آیکون: پاکت‌نامه', group: 'آیکون‌ها' },
  'icon-cloud-arrow-up': { name: 'آیکون: آپلود', group: 'آیکون‌ها' },
  'icon-exclamation-triangle': { name: 'آیکون: هشدار', group: 'آیکون‌ها' },
  'icon-arrow-down-on-square': { name: 'آیکون: دانلود', group: 'آیکون‌ها' },
  'icon-user-plus': { name: 'آیکون: افزودن کاربر', group: 'آیکون‌ها' },
  'icon-clipboard-document': { name: 'آیکون: کلیپ‌بورد', group: 'آیکون‌ها' },
  'icon-server': { name: 'آیکون: سرور', group: 'آیکون‌ها' },
  'icon-paperclip': { name: 'آیکون: گیره کاغذ', group: 'آیکون‌ها' },
  'icon-building-library': { name: 'آیکون: ساختمان بورس', group: 'آیکون‌ها' },
};
// ==============================
// Internal state (in-memory only)
// ==============================

let localDraftTheme: ThemeSettings = {};
let globalThemeCache: ThemeSettings = {};

// ==============================
// Helpers
// ==============================

const toCssVarName = (elementId: string, property: keyof ElementStyles): string => {
  const propMap: Record<keyof ElementStyles, string> = {
    fontFamily: 'font-family',
    fontSize: 'font-size',
    color: 'color',
    backgroundColor: 'bg',
    borderColor: 'border-color',
    borderWidth: 'border-width',
    borderStyle: 'border-style',
    size: 'size',
  };
  return `--${elementId}-${propMap[property]}`;
};

const isObjectRecord = (v: unknown): v is Record<string, unknown> =>
  !!v && typeof v === 'object' && !Array.isArray(v);

const sanitizeTheme = (input: unknown): ThemeSettings => {
  if (!isObjectRecord(input)) return {};
  const out: ThemeSettings = {};

  for (const [elementId, styles] of Object.entries(input)) {
    if (!isObjectRecord(styles)) continue;
    const safeStyles: Partial<ElementStyles> = {};

    for (const [prop, val] of Object.entries(styles)) {
      if (val === undefined || val === null) continue;
      if (
        prop === 'fontFamily' ||
        prop === 'fontSize' ||
        prop === 'color' ||
        prop === 'backgroundColor' ||
        prop === 'borderColor' ||
        prop === 'borderWidth' ||
        prop === 'borderStyle' ||
        prop === 'size'
      ) {
        (safeStyles as Record<string, unknown>)[prop] = val;
      }
    }

    out[elementId] = safeStyles;
  }

  return out;
};

const applyTheme = (theme: ThemeSettings): void => {
  if (!isObjectRecord(theme)) return;

  Object.entries(theme).forEach(([elementId, styles]) => {
    if (!isObjectRecord(styles)) return;

    Object.entries(styles).forEach(([property, value]) => {
      if (value === undefined || value === null) return;
      const varName = toCssVarName(elementId, property as keyof ElementStyles);
      const varValue = ['fontSize', 'borderWidth', 'size'].includes(property)
        ? `${value}px`
        : String(value);
      document.documentElement.style.setProperty(varName, varValue);
    });
  });
};

const clearElementCssVars = (elementId: string, styles: Partial<ElementStyles>): void => {
  Object.keys(styles).forEach((prop) => {
    const varName = toCssVarName(elementId, prop as keyof ElementStyles);
    document.documentElement.style.removeProperty(varName);
  });
};

const getActiveTheme = (): ThemeSettings => {
  // precedence: global theme > local draft
  return { ...localDraftTheme, ...globalThemeCache };
};

// ==============================
// Backend APIs
// ==============================

async function fetchGlobalThemeFromServer(): Promise<ApiResult<ThemeSettings>> {
  // value can be direct object or wrapped
  const res = await safeApi<unknown>(`/settings/global/theme/${encodeURIComponent(GLOBAL_THEME_KEY)}`, {
    method: 'GET',
  });

  if (!res.ok) return { ...res, data: {} as ThemeSettings };

  const normalized = sanitizeTheme(res.data);
  return { ...res, data: normalized };
}

async function saveGlobalThemeToServer(theme: ThemeSettings): Promise<ApiResult<{ success: true }>> {
  return safeApi<{ success: true }>(
    `/settings/global/theme/${encodeURIComponent(GLOBAL_THEME_KEY)}`,
    {
      method: 'PUT',
      body: JSON.stringify({ value: theme }),
    }
  );
}

async function fetchWelcomeBannerConfigFromServer(): Promise<ApiResult<WelcomeBannerConfig>> {
  const res = await safeApi<unknown>('/settings/global/ui/welcome-banner-config', { method: 'GET' });
  if (!res.ok) return { ...res, data: DEFAULT_WELCOME_BANNER_CONFIG };

  const raw = res.data as Partial<WelcomeBannerConfig> | undefined;
  const text = typeof raw?.text === 'string' && raw.text.trim() ? raw.text : DEFAULT_WELCOME_BANNER_CONFIG.text;
  const durationRaw = Number(raw?.durationSeconds);
  const durationSeconds = Number.isFinite(durationRaw)
    ? Math.max(1, Math.min(120, Math.trunc(durationRaw)))
    : DEFAULT_WELCOME_BANNER_CONFIG.durationSeconds;

  return { ...res, data: { text, durationSeconds } };
}

async function saveWelcomeBannerConfigToServer(
  config: WelcomeBannerConfig
): Promise<ApiResult<{ success: true }>> {
  const duration = Math.max(1, Math.min(120, Math.trunc(Number(config.durationSeconds) || 10)));
  return safeApi<{ success: true }>('/settings/global/ui/welcome-banner-config', {
    method: 'PUT',
    body: JSON.stringify({
      value: {
        text: config.text ?? DEFAULT_WELCOME_BANNER_CONFIG.text,
        durationSeconds: duration,
      },
    }),
  });
}

// ==============================
// Exported Service Functions
// ==============================

export const initializeTheme = async (): Promise<void> => {
  // 1) load global theme from backend
  const globalRes = await fetchGlobalThemeFromServer();
  globalThemeCache = globalRes.ok ? globalRes.data : {};

  // 2) apply active theme (global + current in-memory draft)
  applyTheme(getActiveTheme());

  // 3) dark/light mode from backend user preference (fallback: system)
  const prefRes = await safeApi<{ key: string; value: string } | { value: string }>(
    '/user/preferences/theme',
    { method: 'GET' }
  );

  const mode =
    prefRes.ok && prefRes.data
      ? ('value' in prefRes.data ? prefRes.data.value : (prefRes.data as { key: string; value: string }).value)
      : null;

  if (mode === 'dark' || (!mode && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.classList.add('dark');
  } else {
    document.documentElement.classList.remove('dark');
  }
};

export const getAllThemeableElements = (): ThemeableElement[] =>
  Object.entries(THEMEABLE_ELEMENTS_METADATA).map(([id, { name, group }]) => ({ id, name, group }));

export const getStylesFor = (elementId: string): Partial<ElementStyles> => {
  const theme = getActiveTheme();
  return theme[elementId] || {};
};

export const updateStyle = (elementId: string, property: keyof ElementStyles, value: unknown): void => {
  if (!localDraftTheme[elementId]) localDraftTheme[elementId] = {};
  localDraftTheme[elementId]![property] = value as never;

  const varName = toCssVarName(elementId, property);
  const varValue = ['fontSize', 'borderWidth', 'size'].includes(property) ? `${value}px` : String(value);
  document.documentElement.style.setProperty(varName, varValue);
};

export const resetStyle = (elementId: string): void => {
  const active = getActiveTheme();
  const styles = active[elementId];
  if (styles) clearElementCssVars(elementId, styles);

  if (localDraftTheme[elementId]) delete localDraftTheme[elementId];

  // re-apply global style for this element if exists
  const globalStyles = globalThemeCache[elementId];
  if (globalStyles && isObjectRecord(globalStyles)) {
    Object.entries(globalStyles).forEach(([prop, val]) => {
      if (val === undefined || val === null) return;
      const varName = toCssVarName(elementId, prop as keyof ElementStyles);
      const varValue = ['fontSize', 'borderWidth', 'size'].includes(prop) ? `${val}px` : String(val);
      document.documentElement.style.setProperty(varName, varValue);
    });
  }
};

export const publishGlobalTheme = async (): Promise<ApiResult<{ success: true }>> => {
  const nextTheme = sanitizeTheme({ ...globalThemeCache, ...localDraftTheme });
  const res = await saveGlobalThemeToServer(nextTheme);

  if (res.ok) {
    globalThemeCache = nextTheme;
    localDraftTheme = {};
    applyTheme(globalThemeCache);
  }

  return res;
};

// Optional helper: discard local unsaved draft and restore global
export const discardLocalDraftTheme = (): void => {
  Object.entries(localDraftTheme).forEach(([elementId, styles]) => {
    clearElementCssVars(elementId, styles ?? {});
  });
  localDraftTheme = {};
  applyTheme(globalThemeCache);
};

// ==============================
// Welcome Banner Configuration
// ==============================

export const getWelcomeBannerConfig = async (): Promise<WelcomeBannerConfig> => {
  const res = await fetchWelcomeBannerConfigFromServer();
  return res.ok ? res.data : DEFAULT_WELCOME_BANNER_CONFIG;
};

export const setWelcomeBannerConfig = async (
  config: WelcomeBannerConfig
): Promise<ApiResult<{ success: true }>> => {
  return saveWelcomeBannerConfigToServer(config);
};

// ==============================
// Stock Analysis Theme Tokens
// ==============================

export const STOCK_ANALYSIS_THEMES: Record<string, { name: string; group: string }> = {
  'stock-analysis-form-card': { name: 'فرم تحلیل سهم', group: 'تحلیل سهم' },
  'stock-analysis-result-card': { name: 'کارت نتیجه تحلیل', group: 'تحلیل سهم' },
  'stock-analysis-recommendation-buy': { name: 'توصیه خرید', group: 'تحلیل سهم' },
  'stock-analysis-recommendation-sell': { name: 'توصیه فروش', group: 'تحلیل سهم' },
  'stock-analysis-history-list': { name: 'لیست تاریخچه', group: 'تحلیل سهم' },
};