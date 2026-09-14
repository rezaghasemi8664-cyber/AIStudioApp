'use strict';

var documentService = require('./codal-document.service.cjs');
var fundamentalScoreService = require('./fundamental-score.service.cjs');

const IMPORTANT_CATEGORIES = [
  { key: 'financial_statements', weight: 30, patterns: ['صورت مالی', 'صورت‌های مالی', 'صورت هاي مالي', 'گزارش مالی'] },
  { key: 'profit_loss', weight: 25, patterns: ['سود و زیان', 'سود و زيان', 'درآمد و هزینه'] },
  { key: 'monthly_activity', weight: 15, patterns: ['گزارش فعالیت ماهانه', 'فعالیت ماهانه'] },
  { key: 'earnings_forecast', weight: 20, patterns: ['پیش بینی درآمد', 'پیش‌بینی درآمد', 'پیش بینی سود', 'پیش‌بینی سود'] },
  { key: 'capital_dividend', weight: 10, patterns: ['افزایش سرمایه', 'تقسیم سود', 'مجمع عمومی'] },
];

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function classifyAnnouncement(announcement) {
  const title = normalizeText(announcement && announcement.title);
  const matched = IMPORTANT_CATEGORIES.filter((category) => category.patterns.some((pattern) => title.includes(pattern)));
  return {
    title,
    categories: matched.map((item) => item.key),
    importance: matched.reduce((sum, item) => sum + item.weight, 0),
    financial: matched.some((item) => ['financial_statements', 'profit_loss', 'monthly_activity', 'earnings_forecast'].includes(item.key)),
  };
}

function aggregateNumericMetrics(documents) {
  const metrics = {};
  for (const document of documents) {
    for (const [key, value] of Object.entries(document.metrics || {})) {
      if (metrics[key] !== undefined) continue;
      metrics[key] = { ...value, sourceUrl: document.url };
    }
  }
  return metrics;
}

function numericDataQuality(metrics) {
  const core = ['revenue', 'operatingProfit', 'netProfit', 'assets', 'liabilities', 'equity', 'eps'];
  const coreMetricCount = core.filter((key) => metrics[key] && Number.isFinite(Number(metrics[key].value))).length;
  return {
    extractedMetricCount: Object.keys(metrics).length,
    coreMetricCount,
    sufficientForScoring: coreMetricCount >= 4,
  };
}

async function extractFinancialDocuments(financialAnnouncements) {
  const maxDocuments = Math.max(1, Math.min(5, Number(process.env.CODAL_MAX_FINANCIAL_DOCUMENTS) || 3));
  const selected = financialAnnouncements.filter((item) => item && item.announcement && item.announcement.link_excel).slice(0, maxDocuments);
  const documents = [];

  for (const item of selected) {
    const result = await documentService.extractFinancialDataFromAnnouncement(item.announcement);
    documents.push({
      announcement: item.announcement,
      classification: item.classification,
      available: result.available,
      sourceType: result.sourceType,
      url: result.url || item.announcement.link_excel,
      bytes: result.bytes || 0,
      sheetCount: result.sheetCount || 0,
      metrics: result.metrics || {},
      reason: result.reason || null,
    });
  }
  return documents;
}

async function analyzeAnnouncements(input) {
  const announcements = Array.isArray(input && input.announcements) ? input.announcements : [];
  const classified = announcements.map((item) => ({ announcement: item, classification: classifyAnnouncement(item) }));
  const important = classified.filter((item) => item.classification.importance > 0);
  const financial = classified.filter((item) => item.classification.financial);
  const documents = await extractFinancialDocuments(financial);
  const numericMetrics = aggregateNumericMetrics(documents.filter((item) => item.available));
  const quality = numericDataQuality(numericMetrics);
  const calculatedScore = fundamentalScoreService.calculateFundamentalScore(numericMetrics);
  const scoreReady = calculatedScore.score !== null;

  return {
    available: announcements.length > 0,
    announcementCount: announcements.length,
    importantAnnouncementCount: important.length,
    financialAnnouncementCount: financial.length,
    announcements: classified,
    financialDocuments: documents,
    numericData: { metrics: numericMetrics, quality },
    score: calculatedScore.score,
    scoreStatus: scoreReady ? 'calculated' : calculatedScore.status,
    scoreCoverage: calculatedScore.coverage,
    scoreComponents: calculatedScore.components,
    reason: scoreReady
      ? calculatedScore.reason
      : quality.sufficientForScoring
        ? 'داده‌های عددی کافی شناسایی شدند، اما اجزای لازم برای محاسبه امتیاز بنیادی کامل نیستند.'
        : financial.length > 0
          ? 'اطلاعیه‌های مالی شناسایی شدند، اما داده عددی کافی از فایل‌های Excel برای محاسبه امتیاز بنیادی استخراج نشد.'
          : 'برای محاسبه امتیاز بنیادی، داده عددی معتبر از صورت‌های مالی CODAL در دسترس نیست.',
  };
}

module.exports = { classifyAnnouncement, analyzeAnnouncements };
