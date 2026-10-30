import { globalSettingsService } from './settingsService';
import { GUIDE_PAGES, type GuidePage } from '../data/comprehensiveGuide';

const CATEGORY = 'help-guide';
export async function loadGuidePages(): Promise<GuidePage[]> {
  const result = await globalSettingsService.getByCategory(CATEGORY);
  if (!result.success || !result.data || typeof result.data !== 'object') return GUIDE_PAGES;
  return GUIDE_PAGES.map((fallback) => {
    const stored = (result.data as Record<string, unknown>)[fallback.id];
    if (!stored || typeof stored !== 'object') return fallback;
    const page = stored as Partial<GuidePage>;
    if (page.id !== fallback.id || !Array.isArray(page.sections)) return fallback;
    return {
      ...fallback,
      ...page,
      sections: page.sections.filter((section): section is GuidePage['sections'][number] =>
        !!section && typeof section === 'object' &&
        typeof (section as any).title === 'string' &&
        typeof (section as any).purpose === 'string' &&
        typeof (section as any).usage === 'string' &&
        typeof (section as any).interpretation === 'string' &&
        typeof (section as any).cautions === 'string'
      ),
    };
  });
}
export async function saveGuidePage(page: GuidePage): Promise<void> {
  const result = await globalSettingsService.set(CATEGORY, page.id, page);
  if (!result.success) throw new Error(result.error || result.message || 'ذخیره راهنمای صفحه ناموفق بود.');
}
