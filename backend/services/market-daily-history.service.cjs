'use strict';

const MIN_VALID_CANDLES = 15;
const HISTORY_LIMIT = 40;

function parseMarketHistoryDate(value) {
  const match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})(?:$|[T\s])/);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) return null;

  return date;
}

function isValidDailyCandle(candle) {
  if (!candle) return false;
  const values = [candle.open, candle.high, candle.low, candle.close].map(Number);
  if (!values.every(Number.isFinite)) return false;
  const [open, high, low, close] = values;
  return low > 0 && high >= low &&
    open >= low && open <= high &&
    close >= low && close <= high;
}

function toNonNegativeBigInt(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return BigInt(0);
  return BigInt(Math.trunc(number));
}

function getValidCount(rows) {
  return Array.isArray(rows) ? rows.filter(isValidDailyCandle).length : 0;
}

async function ensureMarketDailyHistory({ prisma, brsService, symbol, marketDate }) {
  const query = () => prisma.marketDaily.findMany({
    where: { symbol },
    orderBy: { date: 'desc' },
    take: HISTORY_LIMIT,
    select: { date: true, open: true, high: true, low: true, close: true }
  });

  let rows = await query();
  if (getValidCount(rows) >= MIN_VALID_CANDLES) return rows;

  if (!brsService || typeof brsService.getSymbolHistory !== 'function') {
    return rows;
  }

  const response = await brsService.getSymbolHistory(symbol, HISTORY_LIMIT);
  const history = Array.isArray(response && response.data) ? response.data : [];
  const cutoff = marketDate instanceof Date ? marketDate : parseMarketHistoryDate(marketDate);
  if (!cutoff) return rows;

  let backfilled = 0;
  for (const candle of history) {
    if (!isValidDailyCandle(candle)) continue;

    const date = parseMarketHistoryDate(candle.date);
    // Today's candle is maintained by updateMarketDaily from the live snapshot.
    // Never overwrite it with a historical endpoint response.
    if (!date || date >= cutoff) continue;

    const open = Number(candle.open);
    const high = Number(candle.high);
    const low = Number(candle.low);
    const close = Number(candle.close);
    await prisma.marketDaily.upsert({
      where: { symbol_date: { symbol, date } },
      create: {
        symbol,
        date,
        open,
        high,
        low,
        close,
        volume: toNonNegativeBigInt(candle.volume),
        value: toNonNegativeBigInt(candle.value),
        trades: Math.max(0, Math.trunc(Number(candle.count ?? candle.tradeCount) || 0))
      },
      update: {
        open,
        high,
        low,
        close,
        volume: toNonNegativeBigInt(candle.volume),
        value: toNonNegativeBigInt(candle.value),
        trades: Math.max(0, Math.trunc(Number(candle.count ?? candle.tradeCount) || 0))
      }
    });
    backfilled += 1;
  }

  if (backfilled > 0) {
    console.log('[MARKET DAILY HISTORY] backfilled', JSON.stringify({ symbol, records: backfilled }));
    rows = await query();
  }

  return rows;
}

module.exports = {
  ensureMarketDailyHistory,
  parseMarketHistoryDate,
  isValidDailyCandle
};
