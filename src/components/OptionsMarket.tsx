import React, { useCallback, useEffect, useState } from 'react';
import { get } from '../services/apiClient';

type OptionContract = Record<string, unknown>;

const OptionsMarket: React.FC = () => {
  const [contracts, setContracts] = useState<OptionContract[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  const loadContracts = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await get<OptionContract[]>('/brs/options');
      if (!result.success || !Array.isArray(result.data)) {
        throw new Error(result.message || 'دریافت اطلاعات بازار آپشن ناموفق بود.');
      }
      setContracts(result.data);
      setLastUpdated(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'خطا در دریافت اطلاعات بازار آپشن.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadContracts();
  }, [loadContracts]);

  const getValue = (record: OptionContract, keys: string[]): string => {
    for (const key of keys) {
      const value = record[key];
      if (value !== undefined && value !== null && value !== '') return String(value);
    }
    return '—';
  };

  return (
    <section dir="rtl" className="space-y-5">
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
          {loading ? 'در حال دریافت…' : 'به‌روزرسانی اطلاعات'}
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
        <div className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">نماد پایه</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">نماد قرارداد</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">نوع قرارداد</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">قیمت اعمال</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">سررسید</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">قیمت آخرین معامله</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">حجم</th>
                  <th className="whitespace-nowrap px-4 py-3 text-right font-semibold">موقعیت باز</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {contracts.map((contract, index) => (
                  <tr key={getValue(contract, ['insCode', 'InsCode', 'symbol', 'Symbol', 'l18']) + '-' + index} className="hover:bg-gray-50 dark:hover:bg-gray-800/60">
                    <td className="whitespace-nowrap px-4 py-3">{getValue(contract, ['base_l18', 'baseL18', 'baseSymbol', 'BaseSymbol', 'underlyingSymbol', 'UnderlyingSymbol', 'symbolBase', 'نماد پایه'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 font-semibold">{getValue(contract, ['l18', 'L18', 'symbol', 'Symbol', 'contractSymbol', 'ContractSymbol', 'نماد'])}</td>
                    <td className="whitespace-nowrap px-4 py-3">{getValue(contract, ['type', 'Type', 'optionType', 'OptionType', 'callPut', 'CallPut', 'نوع'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{getValue(contract, ['price_strike', 'priceStrike', 'strikePrice', 'StrikePrice', 'strike', 'Strike', 'قیمت اعمال'])}</td>
                    <td className="whitespace-nowrap px-4 py-3">{getValue(contract, ['date_end', 'dateEnd', 'expiryDate', 'ExpiryDate', 'maturityDate', 'MaturityDate', 'endDate', 'EndDate', 'سررسید'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{getValue(contract, ['pl', 'lastPrice', 'LastPrice', 'pClosing', 'PClosing', 'last', 'Last'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{getValue(contract, ['tvol', 'volume', 'Volume', 'qTotTran5J', 'QTotTran5J'])}</td>
                    <td className="whitespace-nowrap px-4 py-3 tabular-nums">{getValue(contract, ['interest_open', 'interestOpen', 'openInterest', 'OpenInterest', 'open_interest', 'OI'])}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="border-t border-gray-200 px-4 py-3 text-xs text-gray-500 dark:border-gray-700 dark:text-gray-400">
            ستون‌هایی که در پاسخ خام BRS موجود نباشند با «—» مشخص می‌شوند؛ محاسبه و تحلیل فرمولی در گام‌های بعدی اضافه می‌شود.
          </p>
        </div>
      )}
    </section>
  );
};

export default OptionsMarket;
