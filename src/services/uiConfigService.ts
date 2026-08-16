// src/services/uiConfigService.ts
import apiClient from './apiClient';

export const initializeTseLinks = () => { /* logic */ };
export const getAdminLinks = () => { return []; };
export const setAdminLinks = (links: any) => { /* logic */ };
export const publishLinks = () => { /* logic */ };

export interface TseLink {
  id: string;
  title: string;
  url: string;
  category?: string;
}

const GLOBAL_TSE_LINKS_KEY = 'global_app_tse_links';

const DEFAULT_TSE_LINKS: TseLink[] = [
  { id: '1', title: 'شاخص بازار', url: 'http://www.tsetmc.com/service/market/indicator', category: 'market' },
  { id: '2', title: 'دیده‌بان بازار', url: 'http://www.tsetmc.com/Loader.aspx?ParTree=15', category: 'market' },
  { id: '3', title: 'کدال', url: 'https://codal.ir', category: 'reports' },
];

function normalizeLinks(input: any): TseLink[] {
  if (!Array.isArray(input)) return [];
  return input
    .map((item, index) => ({
      id: String(item?.id ?? `${Date.now()}-${index}`),
      title: String(item?.title ?? '').trim(),
      url: String(item?.url ?? '').trim(),
      category: item?.category ? String(item.category) : undefined,
    }))
    .filter((x) => x.title && x.url);
}

function withDefaultIds(links: TseLink[]): TseLink[] {
  return links.map((l, i) => ({
    ...l,
    id: l.id || `${Date.now()}-${i}`,
  }));
}

async function getGlobalLinksSetting(): Promise<TseLink[] | null> {
  try {
    const res = await apiClient.get(`/settings/global/links/${GLOBAL_TSE_LINKS_KEY}`);
    // حالت‌های رایج پاسخ: {value: [...]}, {data: [...]}, [...]
    const payload = res?.data?.value ?? res?.data?.data ?? res?.data ?? null;
    const links = withDefaultIds(normalizeLinks(payload));
    return links.length ? links : null;
  } catch {
    return null;
  }
}

async function setGlobalLinksSetting(links: TseLink[]): Promise<TseLink[]> {
  const normalized = withDefaultIds(normalizeLinks(links));
  await apiClient.put(`/settings/global/links/${GLOBAL_TSE_LINKS_KEY}`, {
    value: normalized,
  });
  return normalized;
}

class UIConfigService {
  private adminLinksCache: TseLink[] | null = null;
  private published = false;

  async initializeTseLinks(): Promise<void> {
    // قبلاً no-op بود؛ الان مقدار اولیه را از بک‌اند می‌گیرد
    const serverLinks = await getGlobalLinksSetting();
    if (serverLinks && serverLinks.length) {
      this.adminLinksCache = serverLinks;
      this.published = true;
    } else {
      this.adminLinksCache = [...DEFAULT_TSE_LINKS];
      this.published = false;
    }
  }

  async getLinksForDisplay(): Promise<TseLink[]> {
    // برای نمایش عمومی: اول بک‌اند، سپس fallback
    const serverLinks = await getGlobalLinksSetting();
    if (serverLinks && serverLinks.length) return serverLinks;
    return [...DEFAULT_TSE_LINKS];
  }

  async getAdminLinks(): Promise<TseLink[]> {
    // برای پنل ادمین: cache -> server -> fallback
    if (this.adminLinksCache?.length) return this.adminLinksCache;

    const serverLinks = await getGlobalLinksSetting();
    if (serverLinks && serverLinks.length) {
      this.adminLinksCache = serverLinks;
      this.published = true;
      return serverLinks;
    }

    this.adminLinksCache = [...DEFAULT_TSE_LINKS];
    this.published = false;
    return this.adminLinksCache;
  }

  async setAdminLinks(links: TseLink[]): Promise<TseLink[]> {
    // فقط استیج در حافظه (پیش‌نویس)
    const normalized = withDefaultIds(normalizeLinks(links));
    this.adminLinksCache = normalized;
    this.published = false;
    return normalized;
  }

  async publishLinks(): Promise<{ success: boolean; links: TseLink[] }> {
    // قبلاً fake success بود؛ الان persist واقعی
    const toPublish = this.adminLinksCache?.length
      ? this.adminLinksCache
      : [...DEFAULT_TSE_LINKS];

    const saved = await setGlobalLinksSetting(toPublish);
    this.adminLinksCache = saved;
    this.published = true;

    return { success: true, links: saved };
  }

  async revertGlobalLinks(): Promise<TseLink[]> {
    // بازگردانی از سرور
    const serverLinks = await getGlobalLinksSetting();
    if (serverLinks && serverLinks.length) {
      this.adminLinksCache = serverLinks;
      this.published = true;
      return serverLinks;
    }

    this.adminLinksCache = [...DEFAULT_TSE_LINKS];
    this.published = false;
    return this.adminLinksCache;
  }

  areGlobalLinksPublished(): boolean {
    return this.published;
  }
}

const uiConfigService = new UIConfigService();
export default uiConfigService;
