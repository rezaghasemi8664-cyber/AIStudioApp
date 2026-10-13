'use strict';

const DEFAULT_MAX_PRICE_AGE_HOURS = 72;
const OPEN_MARKET_MAX_PRICE_AGE_MINUTES = 10;

function toPositiveNumber(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

/**
 * Refresh cached recommendation prices from the shared market snapshot before
 * returning them to clients. Fundamental/technical screening remains cached.
 * During closed hours, a row marked stale by the live market worker may still
 * be the latest valid persisted price; age and technical-risk checks remain
 * mandatory, and the caller labels the market as closed.
 */
function refreshValuableSymbolPrices(results, marketRows, now = new Date(), marketOpen = false) {
  const nowMs = now instanceof Date ? now.getTime() : new Date(now).getTime();
  if (!Number.isFinite(nowMs)) return [];

  const maxAgeMs = marketOpen
    ? OPEN_MARKET_MAX_PRICE_AGE_MINUTES * 60 * 1000
    : DEFAULT_MAX_PRICE_AGE_HOURS * 60 * 60 * 1000;
  const bySymbol = new Map(
    (Array.isArray(marketRows) ? marketRows : [])
      .filter(row => row && typeof row.symbol === 'string')
      .map(row => [row.symbol, row])
  );

  return (Array.isArray(results) ? results : []).flatMap(item => {
    if (!item || !item.symbol) return [];
    const row = bySymbol.get(item.symbol);
    const currentPrice = toPositiveNumber(row && row.lastPrice);
    const timestamp = row && row.updatedAt ? new Date(row.updatedAt).getTime() : NaN;
    const ageMs = nowMs - timestamp;

    if (!row || (marketOpen && row.isStale) || currentPrice === null ||
        !Number.isFinite(timestamp) || ageMs < -5 * 60 * 1000 || ageMs > maxAgeMs) {
      return [];
    }

    const support = toPositiveNumber(item.support);
    const sma20 = toPositiveNumber(item.sma20);
    const rsi14 = Number(item.rsi14);
    if (support === null || sma20 === null || !Number.isFinite(rsi14) ||
        currentPrice <= support || currentPrice < sma20 || rsi14 < 45 || rsi14 > 68) {
      return [];
    }

    const risk = currentPrice - support;
    if (!(risk > 0)) return [];

    return [{
      ...item,
      currentPrice,
      entryPrice: currentPrice,
      targetPrice: currentPrice + risk * 2,
      stopLoss: support,
      marketUpdatedAt: new Date(timestamp).toISOString(),
      marketDataAgeMinutes: Math.max(0, Math.floor(ageMs / 60000)),
      marketStatus: marketOpen ? 'OPEN' : 'CLOSED'
    }];
  });
}

module.exports = { refreshValuableSymbolPrices };
