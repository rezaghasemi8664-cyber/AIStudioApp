'use strict';

/**
 * Fundamental-analysis boundary for CODAL announcements.
 *
 * Announcement titles are useful for identifying financial disclosures, but
 * they are not sufficient to manufacture a fundamental score. This service
 * therefore classifies relevant announcements and explicitly returns a null
 * score until numeric financial-document data has been extracted.
 */

function normalizeText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

const IMPORTANT_CATEGORIES = [
  { key: 'financial_statements', weight: 30, patterns: ['صورت مالی', 'صورت‌های مالی', 'صورت هاي مالي', 'گزارش مالی'] },
  { key: 'profit_loss', weight: 25, patterns: ['سود و زیان', 'سود و زيان', 'درآمد و هزینه'] },
  { key: 'monthly_activity', weight: 15, patterns: ['گزارش فعالیت ماهانه', 'فعالیت ماهانه'] },
  { key: 'earnings_forecast', weight: 20, patterns: ['پیش بینی درآمد', 'پیش‌بینی درآمد', 'پیش بینی سود', 'پیش‌بینی سود'] },
  { key: 'capital_dividend', weight: 10, patterns: ['افزایش سرمایه', 'تقسیم سود', 'مجمع عمومی'] },
];

function classifyAnnouncement(announcement) {
  const title = normalizeText(announcement && announcement.title);
  const matched = IMPORTANT_CATEGORIES.filter((category) =>
    category.patterns.some((pattern) => title.includes(pattern))
  );

  return {
    title,
    categories: matched.map((item) => item.key),
    importance: matched.reduce((sum, item) => sum + item.weight, 0),
    financial: matched.some((item) => [
      'financial_statements',
      'profit_loss',
      'monthly_activity',
      'earnings_forecast',
    ].includes(item.key)),
  };
}

function analyzeAnnouncements(input) {
  const announcements = Array.isArray(input && input.announcements)
    ? input.announcements
    : [];

  const classified = announcements.map((item) => ({
    announcement: item,
    classification: classifyAnnouncement(item),
  }));

  const important = classified.filter((item) => item.classification.importance > 0);
  const financial = classified.filter((item) => item.classification.financial);

  return {
    available: announcements.length > 0,
    announcementCount: announcements.length,
    importantAnnouncementCount: important.length,
    financialAnnouncementCount: financial.length,
    announcements: classified,
    score: null,
    scoreStatus: financial.length > 0
      ? 'requires-financial-document-data'
      : 'insufficient-data',
    reason: financial.length > 0
      ? 'اطلاعیه‌های مالی شناسایی شدند، اما برای محاسبه امتیاز بنیادی باید داده‌های عددی صورت‌های مالی از فایل‌های PDF یا Excel استخراج شوند.'
      : 'برای محاسبه امتیاز بنیادی، داده عددی معتبر از صورت‌های مالی CODAL در دسترس نیست.',
  };
}

module.exports = {
  classifyAnnouncement,
  analyzeAnnouncements,
};
