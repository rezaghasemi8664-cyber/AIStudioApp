import api from '../api/apiClient';

export interface WatchlistSymbol {
  symbol: string;
  name: string;
}

export interface Watchlist {
  id: string;
  name: string;
  symbols: WatchlistSymbol[];
  createdAt?: string;
  updatedAt?: string;
}

export interface WatchlistQuote extends WatchlistSymbol {
  volume: number | null;
  lastPrice: number | null;
  lastChangePercent: number | null;
  closePrice: number | null;
  closeChangePercent: number | null;
  updatedAt: string;
}

function unwrap<T>(response: any): T {
  return (response?.data?.data ?? response?.data ?? response) as T;
}

export async function getWatchlists(): Promise<Watchlist[]> {
  const response = await api.get('/watchlist');
  const data = unwrap<{ watchlists?: Watchlist[] }>(response);
  return Array.isArray(data?.watchlists) ? data.watchlists : [];
}

export async function createWatchlist(name: string): Promise<Watchlist> {
  const response = await api.post('/watchlist', { name });
  return unwrap<Watchlist>(response);
}

export async function renameWatchlist(id: string, name: string): Promise<Watchlist> {
  const response = await api.put(`/watchlist/${encodeURIComponent(id)}`, { name });
  return unwrap<Watchlist>(response);
}

export async function deleteWatchlist(id: string): Promise<void> {
  await api.delete(`/watchlist/${encodeURIComponent(id)}`);
}

export async function addSymbolToWatchlist(id: string, symbol: string, name: string): Promise<Watchlist> {
  const response = await api.post(`/watchlist/${encodeURIComponent(id)}/symbols`, { symbol, name });
  return unwrap<Watchlist>(response);
}

export async function removeSymbolsFromWatchlist(id: string, symbols: string[]): Promise<Watchlist> {
  const response = await api.delete(`/watchlist/${encodeURIComponent(id)}/symbols`, { data: { symbols } });
  return unwrap<Watchlist>(response);
}

export async function validateSymbol(symbol: string): Promise<WatchlistSymbol | null> {
  const response = await api.get(`/brs/symbol/${encodeURIComponent(symbol)}`);
  const raw: any = unwrap<any>(response);
  if (!raw || raw.available === false) return null;
  const data = raw?.data ?? raw;
  const resolved = String(data?.symbol ?? data?.l18 ?? data?.lVal18AFC ?? data?.ticker ?? symbol).trim().toUpperCase();
  if (!resolved) return null;
  return { symbol: resolved, name: String(data?.name ?? data?.lVal30 ?? data?.companyName ?? resolved).trim() || resolved };
}

export async function getQuote(symbol: string): Promise<WatchlistQuote> {
  const response = await api.get(`/brs/symbol/${encodeURIComponent(symbol)}`);
  const raw: any = unwrap<any>(response);
  const data: any = raw?.data ?? raw ?? {};
  if (raw?.available === false || data?.available === false) throw new Error(`اطلاعات نماد ${symbol} در دسترس نیست.`);

  const number = (...values: any[]) => {
    for (const value of values) {
      if (value === null || value === undefined || value === '') continue;
      const n = Number(value);
      if (Number.isFinite(n)) return n;
    }
    return null;
  };

  const lastPrice = number(data.pDrCotVal, data.pl, data.last, data.lastPrice, data.priceLast);
  const closePrice = number(data.pClosing, data.pc, data.close, data.closingPrice);
  const volume = number(data.tvol, data.qTotTran5J, data.volume, data.tradeVolume);
  const lastChangePercent = number(data.plp, data.lastChangePercent, data.percentChange, data.priceChangePercent);
  const closeChangePercent = number(data.pcp, data.closeChangePercent, data.closingChangePercent);
  const yesterday = number(data.pYest, data.py, data.yesterdayPrice, data.previousClose, data.yesterday);

  return {
    symbol: String(data.symbol ?? data.l18 ?? data.lVal18AFC ?? data.ticker ?? symbol).trim().toUpperCase(),
    name: String(data.name ?? data.lVal30 ?? data.companyName ?? symbol).trim() || symbol,
    volume,
    lastPrice,
    lastChangePercent: lastChangePercent ?? (lastPrice != null && yesterday ? ((lastPrice - yesterday) / yesterday) * 100 : null),
    closePrice,
    closeChangePercent: closeChangePercent ?? (closePrice != null && yesterday ? ((closePrice - yesterday) / yesterday) * 100 : null),
    updatedAt: new Date().toISOString(),
  };
}
