'use strict';

const axios = require('axios');

function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(String(value).replace(/,/g, '').replace(/٪/g, '').trim());
  return Number.isFinite(n) ? n : null;
}
function toBoolean(value) {
  if (typeof value === 'boolean') return value;
  const text = String(value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'y'].includes(text)) return true;
  if (['false', '0', 'no', 'n', ''].includes(text)) return false;
  return Boolean(value);
}
function first(obj, keys) {
  for (const key of keys) { const value = obj?.[key]; if (value !== undefined && value !== null && value !== '') return value; }
  return null;
}
function metric(row, keys) { return normalizeNumber(first(row, keys)); }
function growth(row, currentKeys, previousKeys) {
  const current = metric(row, currentKeys); const previous = metric(row, previousKeys);
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
function extractFinancialMetrics(row) {
  const metrics = {
    revenue: metric(row, ['revenue', 'Revenue', 'salesRevenue', 'SalesRevenue', 'netSales', 'NetSales', 'درآمد', 'درآمد فروش']),
    netProfit: metric(row, ['netProfit', 'NetProfit', 'profit', 'Profit', 'netIncome', 'NetIncome', 'سود خالص']),
    eps: metric(row, ['eps', 'EPS', 'earningsPerShare', 'Eps', 'سود هر سهم']),
    assets: metric(row, ['assets', 'Assets', 'totalAssets', 'TotalAssets', 'دارایی']),
    liabilities: metric(row, ['liabilities', 'Liabilities', 'totalLiabilities', 'TotalLiabilities', 'بدهی']),
    cash: metric(row, ['cash', 'Cash', 'cashAndEquivalents', 'CashAndEquivalents', 'وجه نقد']),
    salesVolume: metric(row, ['salesVolume', 'SalesVolume', 'volume', 'Volume', 'مقدار فروش']),
  };
  const growthFields = {
    revenueGrowthPercent: growth(row, ['revenue', 'Revenue', 'salesRevenue', 'SalesRevenue', 'netSales', 'NetSales'], ['previousRevenue', 'PreviousRevenue', 'priorRevenue', 'PriorRevenue', 'lastYearRevenue', 'LastYearRevenue']),
    netProfitGrowthPercent: growth(row, ['netProfit', 'NetProfit', 'profit', 'Profit', 'netIncome', 'NetIncome'], ['previousNetProfit', 'PreviousNetProfit', 'priorNetProfit', 'PriorNetProfit', 'lastYearNetProfit', 'LastYearNetProfit']),
  };
  return Object.fromEntries(Object.entries({ ...metrics, ...growthFields }).filter(([, value]) => value !== null));
}
function classifyReport(title, reportType) {
  const text = `${title || ''} ${reportType || ''}`.toLowerCase();
  const rules = [
    ['financial-statement', ['صورت مالی', 'صورتهای مالی', 'صورت‌های مالی', 'financial statement']],
    ['monthly-performance', ['گزارش فعالیت ماهانه', 'فعالیت ماهانه', 'monthly']],
    ['board-meeting', ['جلسه هیئت مدیره', 'جلسه هیات مدیره', 'board meeting']],
    ['dividend', ['تقسیم سود', 'سود نقدی', 'dividend']],
    ['capital-increase', ['افزایش سرمایه', 'capital increase']],
    ['general-meeting', ['مجمع عمومی', 'مجمع فوق العاده', 'مجمع عادی', 'general meeting']],
    ['earnings-forecast', ['پیش بینی', 'پیش‌بینی', 'برآورد سود', 'earnings']],
    ['audit', ['اظهارنظر حسابرس', 'حسابرسی', 'auditor', 'audit']],
    ['contract', ['قرارداد', 'contract']],
    ['production-sales', ['تولید و فروش', 'فروش محصول', 'production', 'sales']],
  ];
  for (const [category, keywords] of rules) if (keywords.some(keyword => text.includes(keyword))) return category;
  return 'other';
}
function normalizeItem(item) {
  const row = item && typeof item === 'object' ? item : {};
  const title = String(first(row, ['title', 'Title', 'reportTitle', 'subject', 'Subject']) || '').trim();
  const reportType = String(first(row, ['reportType', 'ReportType', 'type', 'kind']) || '').trim();
  return {
    title,
    symbol: String(first(row, ['symbol', 'Symbol', 'l18', 'ticker']) || '').trim(),
    companyName: String(first(row, ['companyName', 'CompanyName', 'company', 'name']) || '').trim(),
    reportType,
    category: classifyReport(title, reportType),
    publishDate: String(first(row, ['publishDate', 'PublishDate', 'date', 'Date', 'sendDate']) || '').trim(),
    period: String(first(row, ['period', 'Period', 'fiscalPeriod']) || '').trim(),
    periodEnd: String(first(row, ['periodEnd', 'PeriodEnd', 'endDate']) || '').trim(),
    url: String(first(row, ['url', 'URL', 'link', 'Link', 'documentUrl']) || '').trim(),
    audited: toBoolean(first(row, ['audited', 'Audited', 'isAudited'])),
    attachment: toBoolean(first(row, ['attachment', 'Attachment', 'hasAttachment'])),
    financialMetrics: extractFinancialMetrics(row),
    raw: row,
  };
}
function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['data', 'items', 'results', 'reports', 'Rows', 'Data']) if (Array.isArray(payload[key])) return payload[key];
  return [];
}
function dateKey(value) {
  const text = String(value || '').trim();
  const match = text.match(/^(\d{4}[-/]\d{1,2})/);
  return match ? match[1].replace('/', '-') : null;
}
function buildPeriodicTrend(items) {
  const byPeriod = items.reduce((map, item) => {
    const key = dateKey(item.publishDate);
    if (!key) return map;
    map[key] = (map[key] || 0) + 1;
    return map;
  }, {});
  const periods = Object.keys(byPeriod).sort();
  const latest = periods.length ? periods[periods.length - 1] : null;
  const previous = periods.length > 1 ? periods[periods.length - 2] : null;
  const latestCount = latest ? byPeriod[latest] : 0;
  const previousCount = previous ? byPeriod[previous] : null;
  return { periods: periods.map(period => ({ period, reports: byPeriod[period] })), latestPeriod: latest, latestReports: latestCount, previousPeriod: previous, previousReports: previousCount, changePercent: previousCount === null || previousCount === 0 ? null : ((latestCount - previousCount) / previousCount) * 100 };
}
function buildSensitiveEvents(items) {
  const categories = ['capital-increase', 'dividend', 'financial-statement', 'contract'];
  const counts = Object.fromEntries(categories.map(category => [category, items.filter(item => item.category === category).length]));
  const latest = {};
  for (const category of categories) {
    latest[category] = items.filter(item => item.category === category).sort((a, b) => String(b.publishDate).localeCompare(String(a.publishDate)))[0] || null;
  }
  return { categories, counts, total: categories.reduce((sum, category) => sum + counts[category], 0), latest };
}
function buildSummary(items) {
  const reports = items.length;
  const audited = items.filter(item => item.audited).length;
  const attachments = items.filter(item => item.attachment).length;
  const byType = items.reduce((map, item) => { const key = item.reportType || 'نامشخص'; map[key] = (map[key] || 0) + 1; return map; }, {});
  const byCategory = items.reduce((map, item) => { map[item.category] = (map[item.category] || 0) + 1; return map; }, {});
  const metricReports = items.filter(item => Object.keys(item.financialMetrics).length > 0).length;
  return { reports, audited, attachments, byType, byCategory, metricReports, periodicTrend: buildPeriodicTrend(items), sensitiveEvents: buildSensitiveEvents(items) };
}
async function getReports({ symbol = '', from = '', to = '', limit = 50 } = {}) {
  const baseUrl = process.env.BRS_CODAL_URL || process.env.CODAL_API_URL || '';
  if (!baseUrl) { const error = new Error('BRS_CODAL_URL تنظیم نشده است.'); error.code = 'CODAL_NOT_CONFIGURED'; throw error; }
  const apiKey = process.env.BRS_CODAL_API_KEY || process.env.CODAL_API_KEY || '';
  if (!apiKey) { const error = new Error('BRS_CODAL_API_KEY تنظیم نشده است.'); error.code = 'CODAL_KEY_NOT_CONFIGURED'; throw error; }
  const params = { key: apiKey };
  if (symbol) params.symbol = symbol; if (from) params.from = from; if (to) params.to = to;
  params.limit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const response = await axios.get(baseUrl, { params, timeout: Number(process.env.CODAL_TIMEOUT_MS) || 15000, headers: { Accept: 'application/json', 'User-Agent': process.env.CODAL_USER_AGENT || 'Roniya-Analyzer/1.0' } });
  const items = extractItems(response.data).map(normalizeItem).filter(item => item.title || item.symbol || item.publishDate || item.url);
  return { items, summary: buildSummary(items), fetchedAt: new Date().toISOString(), source: 'codal', configured: true };
}
module.exports = { getReports, normalizeNumber, classifyReport, extractFinancialMetrics, buildPeriodicTrend, buildSensitiveEvents };
