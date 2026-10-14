'use strict';

const {
  INDEX_SLOTS, isTradingWeekday, isTradingSession, tehranDateKey, tehranSlot,
  isFresh, formatPercent, normalizeValuableResults, getImportantSymbolChanges,
  renderSummaryMessage, renderIndexMessage
} = require('../services/telegramPublisher.service.cjs');

describe('Telegram publisher helpers', () => {
  test('uses the configured Tehran index slots', () => {
    expect([...INDEX_SLOTS]).toEqual(['09:15', '10:00', '11:00', '12:15']);
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
  test('keeps only current, fresh, open-market valuable symbols', () => {
    const now = Date.parse('2026-10-10T06:00:00.000Z');
    const list = normalizeValuableResults([
      { symbol: 'الف', currentPrice: 100, marketStatus: 'OPEN', marketUpdatedAt: '2026-10-10T05:58:00.000Z' },
      { symbol: 'ب', currentPrice: 100, marketStatus: 'CLOSED', marketUpdatedAt: '2026-10-10T05:58:00.000Z' },
      { symbol: 'پ', currentPrice: 100, marketStatus: 'OPEN', marketUpdatedAt: '2026-10-10T05:00:00.000Z' }
    ], now);
    expect(list.map(item => item.symbol)).toEqual(['الف']);
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
    expect(message).toContain('تغییر درصدی: -۱٪');
    expect(message).toContain('ساعت تهران: 09:30');
  });
  test('requires a complete summary before rendering a post', () => {
    expect(renderSummaryMessage({ content: 'خلاصه ناقص' })).toBeNull();
    expect(renderSummaryMessage({ content: 'تحلیل تکنیکال و چشم‌انداز کوتاه‌مدت\nمحتوا' })).toContain('خلاصه نهایی بازار بورس');
  });
});
