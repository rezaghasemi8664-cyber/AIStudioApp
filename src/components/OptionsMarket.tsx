import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { getCached } from '../services/apiClient';
import { getSocket } from '../services/socketService';
import OptionsPortfolio from './OptionsPortfolio';

type OptionContract = Record<string, unknown>;

const BASE_SYMBOL_KEYS = ['base_l18', 'baseL18', 'baseSymbol', 'BaseSymbol', 'underlyingSymbol', 'UnderlyingSymbol', 'symbolBase', 'نماد پایه'];
const EXPIRY_KEYS = ['date_end', 'dateEnd', 'expiryDate', 'ExpiryDate', 'maturityDate', 'MaturityDate', 'endDate', 'EndDate', 'سررسید'];

function getValue(record: OptionContract, keys: string[]): string {
  for (const key of keys) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  return '—';
}

function parseNumeric(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string') return null;
  const normalized = value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit))).replace(/[,٬\s]/g, '').trim();
  if (!normalized) return null;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function formatPrice(value: unknown): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value.toLocaleString('fa-IR', { maximumFractionDigits: 4 });
}

function getNumeric(record: OptionContract, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = parseNumeric(record[key]);
    if (parsed !== null && parsed >= 0) return parsed;
  }
  return null;
}

function getPositiveNumeric(record: OptionContract, keys: string[]): number | null {
  for (const key of keys) {
    const parsed = parseNumeric(record[key]);
    if (parsed !== null && parsed > 0) return parsed;
  }
  return null;
}

function getKind(record: OptionContract): 'call' | 'put' | null {
  const raw = getValue(record, ['optionKind', 'OptionKind', 'type', 'Type', 'optionType', 'OptionType', 'callPut', 'CallPut', 'نوع']).trim().toLowerCase();
  if (raw === 'call' || raw === 'c' || raw.includes('اختیار خرید') || raw === 'خرید') return 'call';
  if (raw === 'put' || raw === 'p' || raw.includes('اختیار فروش') || raw === 'فروش') return 'put';
  return null;
}

function jalaliToGregorianDate(year: number, month: number, day: number): Date | null {
  if (year < 1300 || year > 1500 || month < 1 || month > 12 || day < 1 || day > 31) return null;
  let jy = year + 1595;
  let days = -355668 + 365 * jy + Math.floor(jy / 33) * 8 + Math.floor(((jy % 33) + 3) / 4) + day + (month < 7 ? (month - 1) * 31 : (month - 7) * 30 + 186);
  let gy = 400 * Math.floor(days / 146097);
  days %= 146097;
  if (days > 36524) {
    gy += 100 * Math.floor(--days / 36524);
    days %= 36524;
    if (days >= 365) days += 1;
  }
  gy += 4 * Math.floor(days / 1461);
  days %= 1461;
  if (days > 365) {
    gy += Math.floor((days - 1) / 365);
    days = (days - 1) % 365;
  }
  let gd = days + 1;
  const monthDays = [0, 31, ((gy % 4 === 0 && gy % 100 !== 0) || gy % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  let gm = 1;
  while (gm <= 12 && gd > monthDays[gm]) { gd -= monthDays[gm]; gm += 1; }
  return gm <= 12 ? new Date(Date.UTC(gy, gm - 1, gd)) : null;
}

function getExpiryDays(value: string): number | null {
  const digits = value.replace(/[۰-۹]/g, (digit) => String('۰۱۲۳۴۵۶۷۸۹'.indexOf(digit))).replace(/[٠-٩]/g, (digit) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(digit)));
  const match = digits.match(/(13\d{2}|14\d{2}|20\d{2})[\/-]?(\d{1,2})[\/-]?(\d{1,2})/);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const expiry = year < 1600 ? jalaliToGregorianDate(year, month, day) : new Date(Date.UTC(year, month - 1, day));
  if (!expiry || Number.isNaN(expiry.getTime())) return null;
  return Math.ceil((expiry.getTime() - Date.now()) / 86400000);
}

type RankRejectionReason = 'spot' | 'strike' | 'ask' | 'bid' | 'crossed' | 'kind' | 'expiry' | 'spread';

function getRankRejectionReason(contract: OptionContract): RankRejectionReason | null {
  const spot = getNumeric(contract, ['underlyingLastPrice']);
  const strike = getNumeric(contract, ['strikePrice', 'price_strike', 'priceStrike', 'strike']);
  const ask = getPositiveNumeric(contract, ['bestAskPrice', 'po1', 'pMeOf', 'askPrice', 'sellPrice']);
  const bid = getPositiveNumeric(contract, ['bestBidPrice', 'pd1', 'pMeDem', 'bidPrice', 'buyPrice']);
  const kind = getKind(contract);
  const days = getExpiryDays(getValue(contract, EXPIRY_KEYS));

  if (spot === null || spot <= 0) return 'spot';
  if (strike === null || strike <= 0) return 'strike';
  if (ask === null) return 'ask';
  if (bid === null) return 'bid';
  if (ask < bid) return 'crossed';
  if (!kind) return 'kind';
  if (days === null || days < 7) return 'expiry';

  const spreadPercent = ((ask - bid) / ((ask + bid) / 2)) * 100;
  if (!Number.isFinite(spreadPercent) || spreadPercent > 20) return 'spread';
  return null;
}

function rankOptionContract(contract: OptionContract) {
  const spot = getNumeric(contract, ['underlyingLastPrice']);
  const strike = getNumeric(contract, ['strikePrice', 'price_strike', 'priceStrike', 'strike']);
  const ask = getPositiveNumeric(contract, ['bestAskPrice', 'po1', 'pMeOf', 'askPrice', 'sellPrice']);
  const bid = getPositiveNumeric(contract, ['bestBidPrice', 'pd1', 'pMeDem', 'bidPrice', 'buyPrice']);
  const kind = getKind(contract);
  const expiryText = getValue(contract, EXPIRY_KEYS);
  const days = getExpiryDays(expiryText);
  // Do not present a last trade as an actionable entry quote.
  // Keep rejection diagnostics and eligibility gates in one shared validation path.
  if (getRankRejectionReason(contract) !== null) return null;
  // TypeScript cannot infer narrowing from the shared rejection helper.
  // Repeat explicit guards so nullable values are narrowed before scoring.
  if (
    spot === null || spot <= 0 ||
    strike === null || strike <= 0 ||
    ask === null ||
    bid === null || ask < bid ||
    kind === null ||
    days === null || days < 7
  ) return null;

  const entryPrice = ask;
  const spreadPercent = ((ask - bid) / ((ask + bid) / 2)) * 100;

  const moneyness = Math.abs(spot - strike) / spot;
  const moneynessScore = Math.max(0, 1 - moneyness / 0.15);
  const timeScore = days < 7 ? 0.15 : days < 14 ? 0.45 + (days - 7) / 7 * 0.25 : days <= 60 ? 1 : days <= 120 ? 0.8 : 0.55;
  const volume = getNumeric(contract, ['tradedVolume', 'tvol', 'volume', 'qTotTran5J']) || 0;
  const oi = getNumeric(contract, ['openInterest', 'interest_open', 'interestOpen', 'OI']) || 0;
  const liquidityScore = (Math.min(1, Math.log10(volume + 1) / 4) * 0.5) + (Math.min(1, Math.log10(oi + 1) / 5) * 0.5);
  const spreadScore = Math.max(0, 1 - spreadPercent / 20);
  const premiumRatio = entryPrice / spot;
  const premiumScore = premiumRatio <= 0.01 ? 0.5 : premiumRatio <= 0.08 ? 1 : Math.max(0, 1 - (premiumRatio - 0.08) / 0.2);
  const score = Math.round(100 * (moneynessScore * 0.25 + timeScore * 0.20 + liquidityScore * 0.30 + spreadScore * 0.15 + premiumScore * 0.10));
  return {
    contract,
    score,
    days,
    entryPrice,
    priceSource: 'best-ask',
    exitPrice: bid,
    spreadPercent,
    reasons: [
      moneynessScore >= 0.7 ? 'نزدیکی مناسب قیمت اعمال به قیمت پایه' : 'فاصله نسبتاً زیاد از قیمت پایه',
      liquidityScore >= 0.5 ? 'نقدشوندگی نسبی بهتر بر اساس حجم و موقعیت باز' : 'نقدشوندگی نیازمند بررسی',
      days < 14 ? 'سررسید نزدیک؛ ریسک زمانی بیشتر' : days <= 60 ? 'بازه زمانی سررسید متعادل در مدل' : 'زمان باقی‌مانده طولانی‌تر',
      `فاصله عرضه و تقاضا ${spreadPercent.toLocaleString('fa-IR', { maximumFractionDigits: 2 })}٪`
    ]
  };
}

const OptionsMarket: React.FC = () => {
  const [activeView, setActiveView] = useState<'market' | 'portfolio'>('market');
  const [contracts, setContracts] = useState<OptionContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [selectedBaseSymbol, setSelectedBaseSymbol] = useState('');
  const [selectedExpiry, setSelectedExpiry] = useState('');
  const [scenarioUnderlyingPrice, setScenarioUnderlyingPrice] = useState('');
  const [scenarioFeeRatePercent, setScenarioFeeRatePercent] = useState('');

  const loadContracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCached<OptionContract[]>('/brs/options', 300_000);
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error(result.message || 'دریافت اطلاعات بازار آپشن ناموفق بود.');
      }
      setContracts(result.data);
      setLastUpdated(new Date((result as any).fetchedAt || Date.now()));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات بازار آپشن.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContracts();
    const socket = getSocket();
    const refreshOnUpdate = () => { void loadContracts(); };
    socket?.on('options-market:updated', refreshOnUpdate);
    socket?.on('connect', refreshOnUpdate);

    // Socket.IO is the primary refresh path. Poll only while disconnected so
    // a temporary network interruption cannot leave the tab stale indefinitely.
    const timer = window.setInterval(() => {
      if (!socket?.connected) void loadContracts();
    }, 30_000);

    return () => {
      window.clearInterval(timer);
      socket?.off('options-market:updated', refreshOnUpdate);
      socket?.off('connect', refreshOnUpdate);
    };
  }, [loadContracts]);

  const baseSymbols = useMemo(
    () => Array.from(new Set(contracts.map((contract) => getValue(contract, BASE_SYMBOL_KEYS)).filter((value) => value !== '—'))).sort((a, b) => a.localeCompare(b, 'fa')),
    [contracts]
  );
  const expiries = useMemo(
    () => Array.from(new Set(contracts.map((contract) => getValue(contract, EXPIRY_KEYS)).filter((value) => value !== '—'))).sort(),
    [contracts]
  );
  const filteredContracts = useMemo(
    () => contracts.filter((contract) => {
      const baseMatches = !selectedBaseSymbol || getValue(contract, BASE_SYMBOL_KEYS) === selectedBaseSymbol;
      const expiryMatches = !selectedExpiry || getValue(contract, EXPIRY_KEYS) === selectedExpiry;
      return baseMatches && expiryMatches;
    }),
    [contracts, selectedBaseSymbol, selectedExpiry]
  );

  const rankedContracts = useMemo(
    () => filteredContracts
      .map((contract) => rankOptionContract(contract))
      .filter((item): item is NonNullable<ReturnType<typeof rankOptionContract>> => item !== null)
      .sort((a, b) => b.score - a.score)
      .slice(0, 3),
    [filteredContracts]
  );

  const rankDiagnostics = useMemo(() => {
    const counts: Record<RankRejectionReason, number> = {
      spot: 0,
      strike: 0,
      ask: 0,
      bid: 0,
      crossed: 0,
      kind: 0,
      expiry: 0,
      spread: 0,
    };
    let eligible = 0;
    for (const contract of filteredContracts) {
      const reason = getRankRejectionReason(contract);
      if (reason) counts[reason] += 1;
      else eligible += 1;
    }
    return { counts, eligible };
  }, [filteredContracts]);

  return (
    <section dir="rtl" className="space-y-5">
      <div className="flex flex-wrap gap-2 border-b border-gray-200 pb-3 dark:border-gray-700" role="tablist" aria-label="بخش‌های بازار آپشن">
        <button type="button" role="tab" aria-selected={activeView === 'market'} onClick={() => setActiveView('market')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeView === 'market' ? 'bg-cyan-600 text-white' : 'border border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>بازار آپشن</button>
        <button type="button" role="tab" aria-selected={activeView === 'portfolio'} onClick={() => setActiveView('portfolio')} className={`rounded-lg px-4 py-2 text-sm font-semibold ${activeView === 'portfolio' ? 'bg-cyan-600 text-white' : 'border border-gray-300 bg-white text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200'}`}>سبد آپشن</button>
      </div>
      {activeView === 'portfolio' ? <OptionsPortfolio contracts={contracts} /> : <>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold">بازار آپشن</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            زنجیره قراردادهای اختیار معامله بر پایه داده‌های دریافتی از BRS؛ بدون تولید یا تخمین داده ساختگی.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void loadContracts()}
          disabled={loading}
          className="rounded-lg bg-cyan-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? <span className="inline-flex items-center justify-center gap-2"><span aria-hidden="true" className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />در حال دریافت…</span> : 'به‌روزرسانی اطلاعات'}
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">تعداد قراردادهای دریافتی</p>
          <p className="mt-2 text-2xl font-bold tabular-nums">{contracts.length.toLocaleString('fa-IR')}</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">منبع داده</p>
          <p className="mt-2 text-lg font-bold">BRS</p>
        </div>
        <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
          <p className="text-sm text-gray-500 dark:text-gray-400">آخرین دریافت موفق</p>
          <p className="mt-2 text-sm font-semibold">{lastUpdated ? lastUpdated.toLocaleString('fa-IR') : '—'}</p>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4 dark:border-gray-700 dark:bg-gray-800">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">قیمت فرضی نماد پایه در سررسید</span>
            <input
              type="number"
              min="0"
              step="any"
              inputMode="decimal"
              value={scenarioUnderlyingPrice}
              onChange={(event) => setScenarioUnderlyingPrice(event.target.value)}
              placeholder="قیمت فرضی را وارد کنید"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">کارمزد هر سمت معامله (درصد)</span>
            <input
              type="number"
              min="0"
              max="100"
              step="any"
              inputMode="decimal"
              value={scenarioFeeRatePercent}
              onChange={(event) => setScenarioFeeRatePercent(event.target.value)}
              placeholder="درصد کارمزد را وارد کنید"
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-900"
            />
          </label>
        </div>
        <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">سود/زیان سناریو برای یک قرارداد و با استفاده از اندازه قرارداد دریافتی از BRS محاسبه می‌شود. حداکثر حق‌بیمه سربه‌سر به‌ازای هر واحد از دارایی پایه است. اگر اندازه قرارداد معتبر نباشد، سود/زیان نمایش داده نمی‌شود. درصد کارمزد هر سمت را مطابق تعرفه واقعی وارد کنید؛ مقدار خالی معادل صفر است. کارمزد خروج به‌صورت ساده‌شده روی ارزش تسویه فرضی اعمال می‌شود؛ این سناریو پیش‌بینی قیمت نیست.</p>
      </div>

      <section className="rounded-xl border border-blue-200 bg-blue-50/60 p-4 dark:border-blue-900 dark:bg-blue-950/20">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h3 className="font-bold">رتبه‌بندی فرمولی قراردادها</h3>
            <p className="mt-1 text-xs text-gray-600 dark:text-gray-300">امتیاز ۰ تا ۱۰۰ بر اساس نزدیکی به قیمت پایه، زمان تا سررسید، حجم/موقعیت باز، فاصله عرضه و تقاضا و نسبت حق‌بیمه به قیمت پایه است. فقط قراردادهایی با قیمت عرضه و تقاضای معتبر، سررسید حداقل ۷ روز و فاصله حداکثر ۲۰٪ وارد رتبه‌بندی می‌شوند؛ امتیاز، احتمال سود را تضمین نمی‌کند.</p>
          </div>
          <span className="text-xs text-gray-500">فقط داده‌های دارای قیمت و سررسید قابل‌محاسبه</span>
        </div>
        {rankedContracts.length === 0 ? (
          <>
            <p className="mt-3 text-sm">فعلاً قرارداد واجد شرایط پیشنهاد پیدا نشد. برای ورود، قیمت معتبر عرضه و تقاضا، سررسید حداقل ۷ روزه و فاصله عرضه/تقاضای حداکثر ۲۰٪ لازم است؛ این محدودیت‌ها مانع پیشنهاد بر اساس آخرین معامله قدیمی می‌شوند.</p>
            <div className="mt-3 rounded-lg border border-blue-100 bg-white/80 p-3 dark:border-gray-700 dark:bg-gray-900/70">
              <p className="text-sm font-semibold">علت کنار گذاشته‌شدن قراردادها (بدون تغییر محدودیت‌ها)</p>
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">از {filteredContracts.length.toLocaleString('fa-IR')} قراردادِ منطبق با فیلترها، {rankDiagnostics.eligible.toLocaleString('fa-IR')} قرارداد از بررسی اولیه عبور کرده‌اند.</p>
              <ul className="mt-2 grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                <li>قیمت نماد پایه نامعتبر/ناموجود: {rankDiagnostics.counts.spot.toLocaleString('fa-IR')}</li>
                <li>قیمت اعمال نامعتبر/ناموجود: {rankDiagnostics.counts.strike.toLocaleString('fa-IR')}</li>
                <li>قیمت فروش/عرضه ناموجود یا صفر: {rankDiagnostics.counts.ask.toLocaleString('fa-IR')}</li>
                <li>قیمت خرید/تقاضای ناموجود یا صفر: {rankDiagnostics.counts.bid.toLocaleString('fa-IR')}</li>
                <li>قیمت عرضه کمتر از تقاضا: {rankDiagnostics.counts.crossed.toLocaleString('fa-IR')}</li>
                <li>نوع اختیار خرید/فروش نامشخص: {rankDiagnostics.counts.kind.toLocaleString('fa-IR')}</li>
                <li>سررسید نامعتبر یا کمتر از ۷ روز: {rankDiagnostics.counts.expiry.toLocaleString('fa-IR')}</li>
                <li>فاصله عرضه و تقاضا بیشتر از ۲۰٪: {rankDiagnostics.counts.spread.toLocaleString('fa-IR')}</li>
              </ul>
              <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">هر قرارداد فقط در اولین علتِ عدم احراز شرایط شمرده می‌شود؛ تعدادها با هم جمع‌پذیرند و محدودیت‌های رتبه‌بندی را تغییر نمی‌دهند.</p>
            </div>
          </>
        ) : (
          <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-3">
            {rankedContracts.map((item, index) => (
              <div key={getValue(item.contract, ['l18', 'symbol', 'contractSymbol']) + '-' + index} className="rounded-lg border border-blue-100 bg-white p-3 dark:border-gray-700 dark:bg-gray-900">
                <div className="flex items-center justify-between gap-2">
                  <strong>{getValue(item.contract, ['l18', 'L18', 'symbol', 'Symbol', 'contractSymbol'])}</strong>
                  <span className="rounded-full bg-blue-100 px-2 py-1 text-xs font-bold text-blue-900 dark:bg-blue-900 dark:text-blue-100">امتیاز {item.score}</span>
                </div>
                <p className="mt-2 text-sm">نماد پایه: {getValue(item.contract, BASE_SYMBOL_KEYS)}</p>
                <p className="text-sm">سررسید: {getValue(item.contract, EXPIRY_KEYS)} · {item.days} روز</p>
                <p className="mt-1 text-sm">قیمت پیشنهادی ورود (هر واحد): <strong>{formatPrice(item.entryPrice)}</strong></p>
                <p className="text-xs text-gray-500">بر مبنای بهترین قیمت عرضه ثبت‌شده؛ قیمت سفارش واقعی ممکن است تغییر کند</p>
                <p className="mt-1 text-sm">قیمت بهترین تقاضا برای خروج: <strong>{formatPrice(item.exitPrice)}</strong></p>
                <ul className="mt-2 list-disc space-y-1 pr-4 text-xs text-gray-600 dark:text-gray-300">
                  {item.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-xs text-gray-500 dark:text-gray-400">این رتبه‌بندی، غربالگری اولیه است نه پیش‌بینی سود. پیش از معامله، عمق سفارش، کارمزد، اندازه قرارداد، محدودیت نقدشوندگی و ریسک افت ارزش زمانی را بررسی کن. در نبود داده معتبر، نباید امتیاز را مبنای سفارش قرار داد.</p>
      </section>

      {error && (
        <div role="alert" className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300">
          <p className="font-bold">اطلاعات بازار آپشن در دسترس نیست</p>
          <p className="mt-1">{error}</p>
          <p className="mt-2 text-xs">تا دریافت موفق از سرویس، داده‌ای جایگزین یا ساختگی نمایش داده نمی‌شود.</p>
        </div>
      )}

      {!error && !loading && contracts.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-300 p-8 text-center text-sm text-gray-500 dark:border-gray-700">
          در پاسخ منبع داده، قراردادی برای نمایش دریافت نشد.
        </div>
      )}

      {contracts.length > 0 && (
        <>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">فیلتر نماد پایه</span>
            <select value={selectedBaseSymbol} onChange={(event) => setSelectedBaseSymbol(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
              <option value="">همه نمادها</option>
              {baseSymbols.map((symbol) => <option key={symbol} value={symbol}>{symbol}</option>)}
            </select>
          </label>
          <label className="block text-sm">
            <span className="mb-1 block font-semibold">فیلتر سررسید</span>
            <select value={selectedExpiry} onChange={(event) => setSelectedExpiry(event.target.value)} className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 dark:border-gray-700 dark:bg-gray-800">
              <option value="">همه سررسیدها</option>
              {expiries.map((expiry) => <option key={expiry} value={expiry}>{expiry}</option>)}
            </select>
          </label>
          <div className="flex items-end justify-between gap-3 text-sm">
            <span className="text-gray-500 dark:text-gray-400">قراردادهای منطبق: {filteredContracts.length.toLocaleString('fa-IR')}</span>
            <button type="button" onClick={() => { setSelectedBaseSymbol(''); setSelectedExpiry(''); }} className="rounded-lg border border-gray-300 px-3 py-2 dark:border-gray-700">پاک‌کردن فیلترها</button>
          </div>
        </div>
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">نماد پایه</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">نماد قرارداد</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">نوع قرارداد</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">اندازه قرارداد</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">قیمت اعمال</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">قیمت نماد پایه</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">ارزش ذاتی</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">قیمت سربه‌سر</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">سود/زیان خالص یک قرارداد</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">بازده خالص نسبت به حق‌بیمه (٪)</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">حداکثر حق‌بیمه سربه‌سر (هر واحد)</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">سررسید</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">بهترین تقاضا</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">حجم تقاضا</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">بهترین عرضه</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">حجم عرضه</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">قیمت آخرین معامله</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">حجم</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">موقعیت باز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {filteredContracts.map((contract, index) => (
                  <tr key={getValue(contract, ['insCode', 'InsCode', 'symbol', 'Symbol', 'l18']) + '-' + index} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="whitespace-nowrap px-4 py-3">{getValue(contract, ['base_l18', 'baseL18', 'baseSymbol', 'BaseSymbol', 'underlyingSymbol', 'UnderlyingSymbol', 'symbolBase', 'نماد پایه'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{getValue(contract, ['l18', 'L18', 'symbol', 'Symbol', 'contractSymbol', 'ContractSymbol', 'نماد'])}</td>
                    <td className="whitespace-nowrap px-4 py-3">{getValue(contract, ['type', 'Type', 'optionType', 'OptionType', 'callPut', 'CallPut', 'نوع'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPrice(getNumeric(contract, ['contractSize', 'size_contract', 'sizeContract', 'contract_size']))}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{getValue(contract, ['price_strike', 'priceStrike', 'strikePrice', 'StrikePrice', 'strike', 'Strike', 'قیمت اعمال'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPrice(contract.underlyingLastPrice)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPrice(contract.intrinsicValue)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPrice(contract.breakEvenPrice)}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {(() => {
                        const scenario = parseNumeric(scenarioUnderlyingPrice);
                        const strike = getNumeric(contract, ['strikePrice', 'price_strike', 'priceStrike', 'strike']);
                        const premium = getPositiveNumeric(contract, ['bestAskPrice', 'po1', 'pMeOf', 'askPrice', 'sellPrice']);
                        const contractSize = getNumeric(contract, ['contractSize', 'size_contract', 'sizeContract', 'contract_size']);
                        const kind = getKind(contract);
                        const feeInput = scenarioFeeRatePercent.trim() === '' ? 0 : parseNumeric(scenarioFeeRatePercent);
                        if (premium === null) return 'عرضه معتبر ندارد';
                        if (scenario === null || scenario < 0 || strike === null || contractSize === null || contractSize <= 0 || (kind !== 'call' && kind !== 'put') || feeInput === null || feeInput < 0 || feeInput > 100) return '—';
                        const feeRate = feeInput / 100;
                        const payoff = Math.max(0, kind === 'call' ? scenario - strike : strike - scenario);
                        const netPnlPerUnit = payoff - (premium * (1 + feeRate)) - (payoff * feeRate);
                        return formatPrice(netPnlPerUnit * contractSize);
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {(() => {
                        const scenario = parseNumeric(scenarioUnderlyingPrice);
                        const strike = getNumeric(contract, ['strikePrice', 'price_strike', 'priceStrike', 'strike']);
                        const premium = getPositiveNumeric(contract, ['bestAskPrice', 'po1', 'pMeOf', 'askPrice', 'sellPrice']);
                        const contractSize = getNumeric(contract, ['contractSize', 'size_contract', 'sizeContract', 'contract_size']);
                        const kind = getKind(contract);
                        const feeInput = scenarioFeeRatePercent.trim() === '' ? 0 : parseNumeric(scenarioFeeRatePercent);
                        if (premium === null) return 'عرضه معتبر ندارد';
                        if (scenario === null || scenario < 0 || strike === null || contractSize === null || contractSize <= 0 || (kind !== 'call' && kind !== 'put') || feeInput === null || feeInput < 0 || feeInput > 100) return '—';
                        const feeRate = feeInput / 100;
                        const payoff = Math.max(0, kind === 'call' ? scenario - strike : strike - scenario);
                        const netPnlPerUnit = payoff - (premium * (1 + feeRate)) - (payoff * feeRate);
                        const investedPerUnit = premium * (1 + feeRate);
                        return Number.isFinite(netPnlPerUnit) && investedPerUnit > 0
                          ? (netPnlPerUnit / investedPerUnit * 100).toLocaleString('fa-IR', { maximumFractionDigits: 2 }) + '٪'
                          : '—';
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">
                      {(() => {
                        const scenario = parseNumeric(scenarioUnderlyingPrice);
                        const strike = getNumeric(contract, ['strikePrice', 'price_strike', 'priceStrike', 'strike']);
                        const kind = getKind(contract);
                        const feeInput = scenarioFeeRatePercent.trim() === '' ? 0 : parseNumeric(scenarioFeeRatePercent);
                        if (scenario === null || scenario < 0 || strike === null || (kind !== 'call' && kind !== 'put') || feeInput === null || feeInput < 0 || feeInput > 100) return '—';
                        const feeRate = feeInput / 100;
                        const payoff = Math.max(0, kind === 'call' ? scenario - strike : strike - scenario);
                        return formatPrice(Math.max(0, payoff * (1 - feeRate) / (1 + feeRate)));
                      })()}
                    </td>
                    <td className="whitespace-nowrap px-4 py-3">{getValue(contract, ['date_end', 'dateEnd', 'expiryDate', 'ExpiryDate', 'maturityDate', 'MaturityDate', 'endDate', 'EndDate', 'سررسید'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPrice(getPositiveNumeric(contract, ['bestBidPrice', 'pd1', 'pMeDem', 'bestBid', 'bidPrice', 'buyPrice']))}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPrice(parseNumeric(contract.bestBidQuantity))}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPrice(getPositiveNumeric(contract, ['bestAskPrice', 'po1', 'pMeOf', 'bestAsk', 'askPrice', 'sellPrice']))}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{formatPrice(parseNumeric(contract.bestAskQuantity))}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{getValue(contract, ['pl', 'lastPrice', 'LastPrice', 'pClosing', 'PClosing', 'last', 'Last'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{getValue(contract, ['tvol', 'volume', 'Volume', 'qTotTran5J', 'QTotTran5J'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{getValue(contract, ['interest_open', 'interestOpen', 'openInterest', 'OpenInterest', 'open_interest', 'OI'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            قیمت نماد پایه از دیتابیس مشترک بازار خوانده می‌شود. سود/زیان یک قرارداد با ضرب سود/زیان هر واحد در اندازه قرارداد دریافتی از BRS محاسبه می‌شود؛ اگر اندازه قرارداد معتبر نباشد، مقدار نمایش داده نمی‌شود. بازده درصدی نسبت به حق‌بیمه خرید به‌علاوه کارمزد ورود محاسبه می‌شود و پیش‌بینی یا تضمین سود نیست. حداکثر حق‌بیمه سربه‌سر به‌ازای هر واحد است و فقط در سناریوی واردشده معنا دارد. کارمزد مدل ساده‌شده است و باید با تعرفه واقعی تطبیق داده شود. «—» یعنی داده کافی یا فرض معتبر وجود ندارد.
          </p>
        </div>
        </>
      )}
      </>}
    </section>
  );
};

export default OptionsMarket;
