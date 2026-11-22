import React, { useCallback, useEffect, useRef, useState } from 'react';
import { getCached, invalidateCachedGet } from '../services/apiClient';
import { onCommoditySnapshotUpdated } from '../services/socketService';
import NerkhCommodityPanel from './NerkhCommodityPanel';

type CommodityRow = {
  date: string | null; time: string | null; time_unix: number | null;
  symbol: string; name: string; price: number; change_value: number | null;
  change_percent: number | null; unit: string;
};
type CommoditySnapshot = {
  fetchedAt: string; source?: string;
  groups: { metal_precious: CommodityRow[]; metal_base: CommodityRow[]; energy: CommodityRow[] };
};
const ENDPOINT = '/market/commodity';

const GROUPS: { key: keyof CommoditySnapshot['groups']; title: string }[] = [
  { key: 'metal_precious', title: 'فلزات گران‌بها' },
  { key: 'metal_base', title: 'فلزات پایه' },
  { key: 'energy', title: 'انرژی' }
];

const formatNumber = (value: number | null) => value == null
  ? '—' : new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);

const Commodity: React.FC = () => {
  const [snapshot, setSnapshot] = useState<CommoditySnapshot | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const refreshSequence = useRef(0);

  const loadSnapshot = useCallback(async () => {
    const sequence = ++refreshSequence.current;
    try {
      const response: any = await getCached(ENDPOINT, 300000);
      const data = response?.data?.data ?? response?.data ?? null;
      if (sequence !== refreshSequence.current) return;
      if (response?.success && data?.groups) {
        setSnapshot(data);
        setError('');
      } else if (!data) {
        setError('اطلاعات کامودیتی هنوز آماده نیست.');
      }
    } catch {
      if (sequence === refreshSequence.current) setError('دریافت اطلاعات کامودیتی با خطا مواجه شد.');
    } finally {
      if (sequence === refreshSequence.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onCommoditySnapshotUpdated((payload: any) => {
      const updated = payload?.snapshot;
      if (updated?.groups) {
        // Prefer the committed snapshot delivered by the server; do not wait for another GET.
        refreshSequence.current += 1;
        invalidateCachedGet(ENDPOINT);
        setSnapshot(updated);
        setError('');
        setLoading(false);
        return;
      }
      // Socket has just connected/reconnected; fetch the latest server-side cached snapshot.
      invalidateCachedGet(ENDPOINT);
      loadSnapshot();
    });
    loadSnapshot();
    return () => {
      refreshSequence.current += 1;
      unsubscribe();
    };
  }, [loadSnapshot]);

  return (
    <section className="space-y-4" dir="rtl">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">کامودیتی</h1>
          <p className="text-sm text-gray-500 mt-1">قیمت جهانی کالاها · به‌روزرسانی خودکار هر ۵ دقیقه</p>
        </div>
        <div className="text-xs text-gray-500">
          {snapshot?.fetchedAt ? 'آخرین دریافت: ' + new Date(snapshot.fetchedAt).toLocaleString('fa-IR') : ''}
        </div>
      </header>
      {loading && !snapshot && <div className="rounded-xl border p-5 text-center text-gray-500">در حال دریافت اسنپ‌شات کامودیتی…</div>}
      {error && !snapshot && <div className="rounded-xl border p-5 text-center text-amber-600">{error}</div>}
      {GROUPS.map(group => {
        const rows = snapshot?.groups?.[group.key] || [];
        if (!rows.length) return null;
        return (
          <div key={group.key} className="overflow-hidden rounded-xl border border-gray-200 dark:border-gray-700">
            <h2 className="px-4 py-3 font-bold bg-gray-50 dark:bg-gray-800">{group.title}</h2>
            <div className="overflow-x-auto">
              <table className="min-w-[850px] w-full table-fixed text-sm">
                <colgroup>
                  <col style={{ width: '12%' }} />
                  <col style={{ width: '8%' }} />
                  <col style={{ width: '10%' }} />
                  <col style={{ width: '16%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '14%' }} />
                  <col style={{ width: '12%' }} />
                </colgroup>
                <thead className="text-gray-500 bg-gray-50/70 dark:bg-gray-800/60">
                  <tr>{['تاریخ','زمان','نماد','نام','قیمت','تغییر قیمت','درصد تغییر','واحد'].map(title =>
                    <th key={title} className="px-3 py-3 text-center align-middle font-medium whitespace-nowrap">{title}</th>)}</tr>
                </thead>
                <tbody>
                  {rows.map(row => {
                    const positive = Number(row.change_value || 0) >= 0;
                    const color = positive ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400';
                    return <tr key={row.symbol} className="border-t border-gray-100 dark:border-gray-700">
                      <td className="px-3 py-3 text-center align-middle whitespace-nowrap">{row.date || '—'}</td>
                      <td className="px-3 py-3 text-center align-middle whitespace-nowrap">{row.time || '—'}</td>
                      <td className="px-3 py-3 text-center align-middle font-semibold whitespace-nowrap" dir="ltr">{row.symbol}</td>
                      <td className="px-3 py-3 text-center align-middle whitespace-nowrap">{row.name}</td>
                      <td className="px-3 py-3 text-center align-middle font-semibold whitespace-nowrap" dir="ltr">{formatNumber(row.price)}</td>
                      <td className={'px-3 py-3 text-center align-middle whitespace-nowrap '+color} dir="ltr">{row.change_value == null ? '—' : (row.change_value > 0 ? '+' : '')+formatNumber(row.change_value)}</td>
                      <td className={'px-3 py-3 text-center align-middle whitespace-nowrap '+color} dir="ltr">{row.change_percent == null ? '—' : (row.change_percent > 0 ? '+' : '')+formatNumber(row.change_percent)+'%'}</td>
                      <td className="px-3 py-3 text-center align-middle whitespace-nowrap">{row.unit || 'دلار'}</td>
                    </tr>;
                  })}
                </tbody>
              </table>
            </div>
          </div>);
      })}
      {!loading && !snapshot && !error && <div className="text-center text-gray-500 py-8">داده‌ای موجود نیست.</div>}
      <NerkhCommodityPanel />
    </section>
  );
};

export default Commodity;
