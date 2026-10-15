'use strict';

const {
  isTradingWeekday, isTradingSession, tehranDateKey, tehranSlot,
  isFresh, formatPercent, normalizeValuableResults, getImportantSymbolChanges,
  renderSummaryMessage, renderIndexMessage
} = require('../services/telegramPublisher.service.cjs');
const { DEFAULT_SETTINGS, normalizeSettings, validateSettings, isAllowedWeekday, isIntervalDue, isBeforeEndTime } = require('../services/telegramPublisherSettings.service.cjs');

describe('Telegram publisher helpers', () => {
  test('uses configurable Tehran index intervals', () => {
    expect(DEFAULT_SETTINGS.index.startTime).toBe('09:15');
    expect(DEFAULT_SETTINGS.valuable.startTime).toBe('09:00');
    expect(DEFAULT_SETTINGS.scalping.startTime).toBe('09:00');
    expect(DEFAULT_SETTINGS.valuable.endTime).toBe('12:30');
    expect(DEFAULT_SETTINGS.scalping.endTime).toBe('12:30');
    expect(DEFAULT_SETTINGS.index.endTime).toBe('12:30');
    expect(isIntervalDue(new Date('2026-10-10T05:45:00.000Z'), '09:15', 60)).toBe(true);
    expect(isIntervalDue(new Date('2026-10-10T06:45:00.000Z'), '09:15', 60)).toBe(true);
    expect(isIntervalDue(new Date('2026-10-10T06:30:00.000Z'), '09:15', 60)).toBe(false);
    expect(isIntervalDue(new Date('2026-10-10T05:59:00.000Z'), '09:00', 15)).toBe(false);
    expect(isIntervalDue(new Date('2026-10-10T06:00:00.000Z'), '09:00', 15)).toBe(true);
    expect(isIntervalDue(new Date('2026-10-10T06:15:00.000Z'), '09:00', 15)).toBe(true);
  });
  test('stops configured publication at the Tehran end time, including the exact minute', () => {
    const beforeEnd = new Date('2026-10-10T08:59:00.000Z'); // 12:29 Tehran
    const atEnd = new Date('2026-10-10T09:00:00.000Z'); // 12:30 Tehran
    expect(isBeforeEndTime(beforeEnd, '12:30')).toBe(true);
    expect(isBeforeEndTime(atEnd, '12:30')).toBe(false);
    expect(isBeforeEndTime(new Date('2026-10-10T07:00:00.000Z'), '11:00')).toBe(true);
    expect(isBeforeEndTime(new Date('2026-10-10T07:00:00.000Z'), 'invalid')).toBe(false);
  });
  test('normalizes publisher settings and applies selected Tehran weekdays', () => {
    const settings = normalizeSettings({ valuable: { enabled: false, intervalMinutes: 30, days: ['Sat'], maxSymbolsPerMessage: 5 } });
    expect(settings.valuable).toMatchObject({ enabled: false, intervalMinutes: 30, days: ['Sat'], maxSymbolsPerMessage: 5 });
    expect(isAllowedWeekday(new Date('2026-10-10T05:45:00.000Z'), settings.valuable.days)).toBe(true);
    expect(isAllowedWeekday(new Date('2026-10-11T05:45:00.000Z'), settings.valuable.days)).toBe(false);
  });
  test('rejects invalid publisher intervals and symbol limits', () => {
    const invalidInterval = { ...DEFAULT_SETTINGS, valuable: { ...DEFAULT_SETTINGS.valuable, intervalMinutes: 0 } };
    expect(() => validateSettings(invalidInterval)).toThrow('فاصله انتشار');
    const invalidLimit = { ...DEFAULT_SETTINGS, scalping: { ...DEFAULT_SETTINGS.scalping, maxSymbolsPerMessage: 21 } };
    expect(() => validateSettings(invalidLimit)).toThrow('حداکثر نماد');
  });
  test('rejects invalid configured publication start times', () => {
    const invalid = { ...DEFAULT_SETTINGS, valuable: { ...DEFAULT_SETTINGS.valuable, startTime: '25:00' } };
    expect(() => validateSettings(invalid)).toThrow('زمان شروع چرخه انتشار');
  });
  test('rejects invalid configured publication end times', () => {
    const invalid = { ...DEFAULT_SETTINGS, valuable: { ...DEFAULT_SETTINGS.valuable, endTime: '25:00' } };
    expect(() => validateSettings(invalid)).toThrow('زمان پایان انتشار');
  });
  test('uses Tehran local time for session and date calculations', () => {
    const duringSession = new Date('2026-10-10T05:45:00.000Z');
    expect(isTradingWeekday(duringSession)).toBe(true);
    expect(isTradingSession(duringSession)).toBe(true);
    expect(tehranSlot(duringSession)).toBe('09:15');
    expect(tehranDateKey(duringSession)).toBe('2026-10-10');
  });
  test('rejects dates outside the Tehran market window', () => {
    expect(isTradingSession(new Date('2026-10-10T04:00:00.000Z'))).toBe(false);
    expect(isTradingSession(new Date('2026-10-10T09:00:00.000Z'))).toBe(false);
    expect(isTradingSession(new Date('2026-10-08T06:15:00.000Z'))).toBe(false);
  });
  test('rejects stale and future timestamps', () => {
    const now = Date.parse('2026-10-10T06:00:00.000Z');
    expect(isFresh('2026-10-10T05:58:00.000Z', 5 * 60 * 1000, now)).toBe(true);
    expect(isFresh('2026-10-10T05:00:00.000Z', 5 * 60 * 1000, now)).toBe(false);
    expect(isFresh('2026-10-10T06:10:00.000Z', 5 * 60 * 1000, now)).toBe(false);
  });
  test('calculates percentage change from current index and numeric delta', () => {
    expect(formatPercent(100, 10100)).toBeCloseTo(1);
    expect(formatPercent(-100, 9900)).toBeCloseTo(-1);
    expect(formatPercent(0, 0)).toBeNull();
  });
  test('retains valid stored valuable symbols outside market hours without rewriting their timestamps', () => {
    const list = normalizeValuableResults([
      { symbol: 'الف', currentPrice: 100, marketStatus: 'OPEN', marketUpdatedAt: '2026-10-10T05:58:00.000Z' },
      { symbol: 'ب', currentPrice: 100, marketStatus: 'CLOSED', marketUpdatedAt: '2026-10-09T05:58:00.000Z' },
      { symbol: 'پ', currentPrice: 100, marketStatus: 'OPEN', marketUpdatedAt: '2026-10-10T05:00:00.000Z' },
      { symbol: 'ت', currentPrice: 0, marketStatus: 'OPEN', marketUpdatedAt: '2026-10-10T05:58:00.000Z' },
      { symbol: 'ث', currentPrice: 100, marketUpdatedAt: null }
    ]);
    expect(list.map(item => item.symbol)).toEqual(['الف', 'ب', 'پ']);
    expect(list[1].marketUpdatedAt).toBe('2026-10-09T05:58:00.000Z');
  });
  test('announces new symbols and only material score increases', () => {
    const previous = { 'الف': { score: 70 }, 'ب': { score: 60 } };
    const changes = getImportantSymbolChanges([
      { symbol: 'الف', score: 80 },
      { symbol: 'ب', score: 65 },
      { symbol: 'پ', score: 55 }
    ], previous);
    expect(changes.map(item => [item.type, item.item.symbol])).toEqual([
      ['score', 'الف'], ['new', 'پ']
    ]);
  });
  test('renders both index levels with numeric and percentage changes', () => {
    const message = renderIndexMessage({
      overallIndex: 10100,
      overallChange: 100,
      equalIndex: 9900,
      equalChange: -100,
      dataJson: JSON.stringify({ changePercent: 1, equalWeightedChangePercent: -1 })
    }, new Date('2026-10-10T06:00:00.000Z'));
    expect(message).toContain('شاخص کل:');
    expect(message).toContain('شاخص هم‌وزن:');
    expect(message).toContain('تغییر عددی: +');
    expect(message).toContain('تغییر درصدی: +۱٪');
    expect(message.replace(/[\u200e\u200f]/g, '')).toContain('تغییر درصدی: −۱٪');
    expect(message).toContain('ساعت تهران: ۰۹:۳۰');
  });
  test('renders the stored summary using its database market date and creation timestamp', () => {
    expect(renderSummaryMessage({ content: 'خلاصه ناقص' })).toBeNull();
    const message = renderSummaryMessage({
      content: 'خلاصه ثبت‌شده در دیتابیس',
      summaryDate: new Date('2026-10-14T00:00:00.000Z'),
      createdAt: new Date('2026-10-14T10:05:00.000Z')
    });
    expect(message).toContain('آخرین خلاصه ذخیره‌شده بازار بورس');
    expect(message).toContain('تاریخ بازار:');
    expect(message).toContain('زمان ثبت خلاصه در دیتابیس:');
    expect(message).toContain('خلاصه ثبت‌شده در دیتابیس');
  });
});
