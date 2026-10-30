'use strict';

function normalizeDigits(value) {
  return String(value ?? '').replace(/[۰-۹٠-٩]/g, digit => {
    const code = digit.charCodeAt(0);
    return String(code >= 0x06f0 && code <= 0x06f9 ? code - 0x06f0 : code - 0x0660);
  });
}
function normalizeNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const text = normalizeDigits(value).replace(/[٬,]/g, '').replace(/٪/g, '').trim();
  const n = Number(text);
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
  if (!obj || typeof obj !== 'object') return null;
  for (const key of keys) {
    const value = obj[key];
    if (value !== undefined && value !== null && value !== '') return value;
  }
  const wanted = new Set(keys.map(key => String(key).toLowerCase()));
  for (const [key, value] of Object.entries(obj)) {
    if (wanted.has(key.toLowerCase()) && value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}
function financialSources(row) {
  const sources = [row];
  for (const key of ['financialMetrics', 'FinancialMetrics', 'metrics', 'Metrics', 'financialData', 'FinancialData', 'data', 'Data', 'reportData', 'ReportData', 'result', 'Result']) {
    const value = row && row[key];
    if (value && typeof value === 'object' && !Array.isArray(value)) sources.push(value);
  }
  return sources;
}
function metricFromSources(row, keys) {
  for (const source of financialSources(row)) {
    const value = metric(source, keys);
    if (value !== null) return value;
  }
  return null;
}
function metric(row, keys) { return normalizeNumber(first(row, keys)); }
function growth(row, currentKeys, previousKeys) {
  const current = metric(row, currentKeys); const previous = metric(row, previousKeys);
  if (current === null || previous === null || previous === 0) return null;
  return ((current - previous) / Math.abs(previous)) * 100;
}
function extractFinancialMetrics(row) {
  const revenueKeys = ['revenue', 'Revenue', 'salesRevenue', 'SalesRevenue', 'netSales', 'NetSales', 'درآمد', 'درآمد فروش', 'درآمدهای عملیاتی', 'مبلغ فروش'];
  const profitKeys = ['netProfit', 'NetProfit', 'profit', 'Profit', 'netIncome', 'NetIncome', 'سود خالص', 'سود (زیان) خالص'];
  const epsKeys = ['eps', 'EPS', 'earningsPerShare', 'Eps', 'سود هر سهم', 'سود هر سهم (ریال)'];
  const metrics = {
    revenue: metricFromSources(row, revenueKeys),
    netProfit: metricFromSources(row, profitKeys),
    eps: metricFromSources(row, epsKeys),
    assets: metricFromSources(row, ['assets', 'Assets', 'totalAssets', 'TotalAssets', 'دارایی', 'جمع دارایی‌ها']),
    liabilities: metricFromSources(row, ['liabilities', 'Liabilities', 'totalLiabilities', 'TotalLiabilities', 'بدهی', 'جمع بدهی‌ها']),
    cash: metricFromSources(row, ['cash', 'Cash', 'cashAndEquivalents', 'CashAndEquivalents', 'وجه نقد']),
    salesVolume: metricFromSources(row, ['salesVolume', 'SalesVolume', 'volume', 'Volume', 'مقدار فروش']),
  };
  const growthFields = {
    revenueGrowthPercent: growth(row, revenueKeys, ['previousRevenue', 'PreviousRevenue', 'priorRevenue', 'PriorRevenue', 'lastYearRevenue', 'LastYearRevenue', 'درآمد دوره مشابه سال قبل']),
    netProfitGrowthPercent: growth(row, profitKeys, ['previousNetProfit', 'PreviousNetProfit', 'priorNetProfit', 'PriorNetProfit', 'lastYearNetProfit', 'LastYearNetProfit', 'سود خالص دوره مشابه سال قبل']),
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
    publishDate: normalizeDigits(first(row, ['date_publish', 'Date_Publish', 'datePublish', 'DatePublish', 'publishDate', 'PublishDate', 'publishDateTime', 'PublishDateTime', 'date_send', 'Date_Send', 'dateSend', 'DateSend', 'sendDate', 'SendDate', 'sentDate', 'SentDate', 'insertDate', 'InsertDate', 'date', 'Date', 'dateTime', 'DateTime', 'تاریخ انتشار', 'تاریخ ارسال']) || '').trim(),
    period: String(first(row, ['period', 'Period', 'fiscalPeriod']) || '').trim(),
    periodEnd: String(first(row, ['periodEnd', 'PeriodEnd', 'endDate']) || '').trim(),
    url: String(first(row, ['url', 'URL', 'link', 'Link', 'documentUrl']) || '').trim(),
    pdfUrl: String(first(row, ['link_pdf', 'Link_Pdf', 'linkPdf', 'pdfUrl', 'PdfUrl']) || '').trim(),
    excelUrl: String(first(row, ['link_excel', 'Link_Excel', 'linkExcel', 'excelUrl', 'ExcelUrl']) || '').trim(),
    attachmentUrl: String(first(row, ['link_attachment', 'Link_Attachment', 'linkAttachment', 'attachmentUrl']) || '').trim(),
    audited: toBoolean(first(row, ['audited', 'Audited', 'isAudited'])),
    attachment: toBoolean(first(row, ['attachment', 'Attachment', 'hasAttachment'])),
    financialMetrics: extractFinancialMetrics(row),
    raw: row,
  };
}
function extractItems(payload) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  for (const key of ['announcement', 'data', 'items', 'results', 'reports', 'Rows', 'Data']) if (Array.isArray(payload[key])) return payload[key];
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
  const snapshot = require('./codalSnapshot.service.cjs');
  const boundedLimit = Math.min(Math.max(Number(limit) || 50, 1), 200);
  const cached = await snapshot.getCodalSnapshotFromCache();
  const normalizeDate = value => normalizeDigits(value).replace(/[^0-9]/g, '');
  const fromKey = normalizeDate(from);
  const toKey = normalizeDate(to);
  const symbolKey = String(symbol || '').trim().toLowerCase();
  let sourceItems = cached && Array.isArray(cached.announcements) ? cached.announcements : [];
  if (symbolKey) sourceItems = sourceItems.filter(item => String(first(item, ['l18', 'symbol', 'Symbol']) || '').trim().toLowerCase() === symbolKey);
  if (fromKey) sourceItems = sourceItems.filter(item => normalizeDate(first(item, ['datePublish', 'date_publish', 'dateSend', 'date_send', 'dateTitle'])) >= fromKey);
  if (toKey) sourceItems = sourceItems.filter(item => normalizeDate(first(item, ['datePublish', 'date_publish', 'dateSend', 'date_send', 'dateTitle'])) <= toKey);
  const items = sourceItems.map(normalizeItem)
    .filter(item => item.title || item.symbol || item.publishDate || item.url)
    .sort((a, b) => normalizeDate(b.publishDate).localeCompare(normalizeDate(a.publishDate)))
    .slice(0, boundedLimit);
  return {
    items,
    summary: buildSummary(items),
    fetchedAt: cached?.fetchedAt || null,
    source: 'codal-db-snapshot-central-cache',
    configured: true,
    stale: !(cached && cached.snapshotId),
    snapshotId: cached?.snapshotId || null
  };
}
module.exports = { getReports, normalizeNumber, normalizeDigits, normalizeItem, classifyReport, extractFinancialMetrics, buildPeriodicTrend, buildSensitiveEvents };
