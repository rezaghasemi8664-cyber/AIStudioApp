import { post } from './apiClient';

export interface MarketingAttribution {
  source: string;
  medium: string;
  campaign: string;
  content: string;
  capturedAt: string;
}

const STORAGE_KEY = 'roniyaMarketingAttribution';
const ALLOWED_CONTENT = new Set(['bursebazaar', 'arzonlineinfo']);

function clean(value: string | null, maxLength = 100): string {
  return String(value || '').trim().slice(0, maxLength);
}

export function captureMarketingAttribution(): MarketingAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const params = new URLSearchParams(window.location.search);
    const source = clean(params.get('utm_source'));
    const medium = clean(params.get('utm_medium'));
    const campaign = clean(params.get('utm_campaign'));
    const content = clean(params.get('utm_content'));
    if (!source && !medium && !campaign && !content) return getStoredMarketingAttribution();
    if (source !== 'telegram' || medium !== 'paid' || campaign !== 'roniya_oct2026' || !ALLOWED_CONTENT.has(content)) {
      return getStoredMarketingAttribution();
    }
    const attribution: MarketingAttribution = { source, medium, campaign, content, capturedAt: new Date().toISOString() };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(attribution));
    return attribution;
  } catch {
    return null;
  }
}

export function getStoredMarketingAttribution(): MarketingAttribution | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as MarketingAttribution;
    if (value?.source !== 'telegram' || value?.medium !== 'paid' || value?.campaign !== 'roniya_oct2026' || !ALLOWED_CONTENT.has(value?.content)) return null;
    return value;
  } catch {
    return null;
  }
}

export async function trackMarketingVisit(): Promise<void> {
  const attribution = captureMarketingAttribution();
  if (!attribution) return;
  const sessionKey = `roniyaMarketingVisitTracked:${attribution.campaign}:${attribution.content}`;
  try {
    if (window.sessionStorage.getItem(sessionKey) === '1') return;
    window.sessionStorage.setItem(sessionKey, '1');
    const response = await post('/marketing-attribution/visit', { attribution });
    if (!response.success) window.sessionStorage.removeItem(sessionKey);
  } catch (error) {
    try { window.sessionStorage.removeItem(sessionKey); } catch {}
    console.warn('[MarketingAttribution] visit tracking failed:', error);
  }
}

export function clearMarketingAttribution(): void {
  if (typeof window !== 'undefined') window.localStorage.removeItem(STORAGE_KEY);
}
