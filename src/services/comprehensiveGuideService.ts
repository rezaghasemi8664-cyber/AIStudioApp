import { globalSettingsService } from './settingsService';
import { GUIDE_PAGES, type GuidePage } from '../data/comprehensiveGuide';

const CATEGORY = 'help-guide';
const isGuidePage = (value: unknown): value is GuidePage => {
 if (!value || typeof value !== 'object') return false;
 const page = value as Partial<GuidePage>;
 return typeof page.id === 'string' && typeof page.title === 'string' &&
  typeof page.summary === 'string' && Array.isArray(page.sections) &&
  page.sections.every(section => !!section && typeof section.title === 'string' &&
   typeof section.purpose === 'string' && typeof section.usage === 'string' &&
   typeof section.interpretation === 'string' && typeof section.cautions === 'string');
};
export async function loadGuidePages(): Promise<GuidePage[]> {
 const result = await globalSettingsService.getByCategory(CATEGORY);
 if (!result.success || !result.data || typeof result.data !== 'object') return GUIDE_PAGES;
 const stored = result.data as Record<string, unknown>;
 const defaults = GUIDE_PAGES.map(fallback => {
  const value = stored[fallback.id];
  return isGuidePage(value) ? value : fallback;
 });
 const defaultIds = new Set(GUIDE_PAGES.map(page => page.id));
 const custom = Object.entries(stored).filter(([id,value]) => !defaultIds.has(id) && isGuidePage(value)).map(([,value]) => value as GuidePage);
 return [...defaults,...custom];
}
export async function saveGuidePage(page: GuidePage): Promise<void> {
 const result = await globalSettingsService.set(CATEGORY,page.id,page);
 if (!result.success) throw new Error(result.error || result.message || 'ذخیره راهنمای صفحه ناموفق بود.');
}
export async function saveGuidePages(pages: GuidePage[], deletedIds: string[] = []): Promise<void> {
 const ids = new Set<string>();
 for (const page of pages) {
  if (!isGuidePage(page) || ids.has(page.id)) throw new Error('ساختار یا شناسه یکی از صفحات راهنما معتبر نیست.');
  ids.add(page.id);
 }
 for (const page of pages) await saveGuidePage(page);
 for (const id of deletedIds) {
  const result = await globalSettingsService.remove(CATEGORY,id);
  if (!result.success) throw new Error(result.error || result.message || `حذف صفحه ${id} ناموفق بود.`);
 }
}
