import api from '../api/apiClient';
import * as portfolioService from './portfolioService';

export interface CorrelationPair { left: string; right: string; correlation: number; observations: number; }
export interface PortfolioCorrelationResult { symbols: string[]; pairs: CorrelationPair[]; averageAbsoluteCorrelation: number | null; highCorrelationPairs: CorrelationPair[]; }

const num = (value: unknown): number | null => { const n = Number(value); return Number.isFinite(n) ? n : null; };
const date = (value: unknown): string | null => { const raw = String(value ?? '').trim(); if (!raw) return null; const parsed = Date.parse(raw); return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : raw.slice(0, 10); };

async function quotes(symbol: string) {
  const response = await api.get(`/brs/symbol/${encodeURIComponent(symbol)}/history`, { params: { limit: 365 } });
  const raw = response?.data?.data ?? response?.data ?? [];
  if (!Array.isArray(raw)) return [];
  return raw.map(row => ({ date: date(row.date ?? row.tradeDate ?? row.jalaliDate ?? row.timestamp), close: num(row.close ?? row.closePrice ?? row.closingPrice ?? row.lastPrice) })).filter((x): x is { date: string; close: number } => Boolean(x.date) && x.close != null && x.close > 0).sort((a, b) => a.date.localeCompare(b.date));
}

function correlation(a: number[], b: number[]) {
  if (a.length < 3 || a.length !== b.length) return null;
  const ma = a.reduce((s, x) => s + x, 0) / a.length; const mb = b.reduce((s, x) => s + x, 0) / b.length;
  let xy = 0; let aa = 0; let bb = 0;
  for (let i = 0; i < a.length; i += 1) { const da = a[i] - ma; const db = b[i] - mb; xy += da * db; aa += da * da; bb += db * db; }
  if (aa <= 0 || bb <= 0) return null;
  return xy / Math.sqrt(aa * bb);
}

export async function getPortfolioCorrelation(): Promise<PortfolioCorrelationResult> {
  const portfolio = await portfolioService.getPortfolio();
  if (portfolio.length < 2) return { symbols: portfolio.map(x => x.symbol), pairs: [], averageAbsoluteCorrelation: null, highCorrelationPairs: [] };
  const rows = await Promise.all(portfolio.map(async item => ({ item, quotes: await quotes(item.symbol).catch(() => []) })));
  const returns = new Map<string, Map<string, number>>();
  rows.forEach(({ item, quotes: qs }) => {
    const entry = date(item.entryDate); const active = qs.filter(q => !entry || q.date >= entry); const map = new Map<string, number>();
    for (let i = 1; i < active.length; i += 1) { const prev = active[i - 1].close; if (prev > 0) map.set(active[i].date, (active[i].close / prev) - 1); }
    returns.set(item.symbol, map);
  });
  const pairs: CorrelationPair[] = [];
  for (let i = 0; i < portfolio.length; i += 1) for (let j = i + 1; j < portfolio.length; j += 1) {
    const left = portfolio[i].symbol; const right = portfolio[j].symbol; const a = returns.get(left) ?? new Map(); const b = returns.get(right) ?? new Map();
    const xs: number[] = []; const ys: number[] = [];
    a.forEach((value, key) => { const other = b.get(key); if (other != null) { xs.push(value); ys.push(other); } });
    const value = correlation(xs, ys); if (value != null) pairs.push({ left, right, correlation: value, observations: xs.length });
  }
  pairs.sort((a, b) => Math.abs(b.correlation) - Math.abs(a.correlation));
  const averageAbsoluteCorrelation = pairs.length ? pairs.reduce((s, p) => s + Math.abs(p.correlation), 0) / pairs.length : null;
  return { symbols: portfolio.map(x => x.symbol), pairs, averageAbsoluteCorrelation, highCorrelationPairs: pairs.filter(p => Math.abs(p.correlation) >= 0.7) };
}
