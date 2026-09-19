import React, { useCallback, useEffect, useMemo, useState } from 'react';
import scalpingService, { type ScalpingHistoryResult, type ScalpingSignalsResponse, type ScalpingStatus } from '../services/scalpingService';
import * as adminActionsService from '../services/adminActionsService';

type Health = { status?: string; services?: Array<{ name?: string; status?: string; latencyMs?: number; httpStatus?: number; error?: string }>; [key: string]: unknown };

const fmt = (v: unknown) => Number(v || 0).toLocaleString('fa-IR');
const money = (v: unknown) => Number(v || 0).toLocaleString('fa-IR', { maximumFractionDigits: 0 });
const dateFa = (v: unknown) => v ? new Date(String(v)).toLocaleString('fa-IR') : '—';

const badge = (ok: boolean) => ok
  ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
  : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300';

const AdminScalpingPanel: React.FC<{ onComplete?: () => void }> = ({ onComplete = () => undefined }) => {
  const [status, setStatus] = useState<ScalpingStatus | null>(null);
  const [signals, setSignals] = useState<ScalpingSignalsResponse | null>(null);
  const [history, setHistory] = useState<ScalpingHistoryResult | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const [s, sig, h] = await Promise.all([
        scalpingService.getScalpingStatus(),
        scalpingService.getScalpingSignals(),
        scalpingService.getScalpingHistory(1, 10)
      ]);
      setStatus(s); setSignals(sig); setHistory(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'دریافت وضعیت موتور نوسان‌گیری ناموفق بود.');
    } finally { setLoading(false); }
  }, []);

  const healthCheck = useCallback(async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await adminActionsService.executeAction('scalping', 'health-check', {});
      setHealth(result as Health);
      setMessage('بررسی سلامت موتور نوسان‌گیری با موفقیت انجام شد.');
      await load(); await onComplete();
    } catch (e) { setError(e instanceof Error ? e.message : 'بررسی سلامت ناموفق بود.'); }
    finally { setBusy(false); }
  }, [load, onComplete]);

  const runNow = useCallback(async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await scalpingService.startScalping();
      if (!result.marketStatus.available) throw new Error('وضعیت بازار قابل تشخیص نیست.');
      if (!result.marketStatus.isOpen) throw new Error('بازار بسته است و اجرای موتور نوسان‌گیری مجاز نیست.');
      setMessage(`اجرای موتور انجام شد؛ ${fmt(result.count)} فرصت/نتیجه ثبت شد.`);
      await load(); await onComplete();
    } catch (e) { setError(e instanceof Error ? e.message : 'اجرای موتور ناموفق بود.'); }
    finally { setBusy(false); }
  }, [load, onComplete]);

  const stop = useCallback(async () => {
    setBusy(true); setError(null); setMessage(null);
    try {
      const result = await scalpingService.stopScalping();
      if (!result.success) throw new Error('توقف موتور توسط سرور تأیید نشد.');
      setMessage('موتور نوسان‌گیری متوقف شد.'); await load(); await onComplete();
    } catch (e) { setError(e instanceof Error ? e.message : 'توقف موتور ناموفق بود.'); }
    finally { setBusy(false); }
  }, [load, onComplete]);

  useEffect(() => { void load(); }, [load]);

  const healthServices = useMemo(() => Array.isArray(health?.services) ? health.services : [], [health]);
  const marketOpen = status?.marketStatus?.isOpen === true;
  const marketKnown = status?.marketStatus?.available === true;

  if (loading && !status) return <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-8 text-center">در حال دریافت وضعیت موتور نوسان‌گیری…</div>;

  return <div dir="rtl" className="space-y-6">
    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
      <div><h2 className="text-2xl font-extrabold">مرکز مدیریت نوسان‌گیری و موتور فرصت‌ها</h2><p className="mt-1 text-sm text-gray-500">وضعیت موتور، بازار، فرصت‌های جاری و اجرای آخرین اسکن</p></div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => void healthCheck()} disabled={busy} className="rounded-xl border border-cyan-500/40 px-4 py-2 text-sm font-semibold disabled:opacity-50">بررسی سلامت</button>
        <button onClick={() => void load()} disabled={busy || loading} className="rounded-xl border border-[var(--card-border-color)] px-4 py-2 text-sm font-semibold disabled:opacity-50">به‌روزرسانی</button>
      </div>
    </div>

    {error && <div className="rounded-xl border border-rose-300 bg-rose-50 p-4 text-sm text-rose-700 dark:bg-rose-950/20 dark:text-rose-300">{error}</div>}
    {message && <div className="rounded-xl border border-emerald-300 bg-emerald-50 p-4 text-sm text-emerald-700 dark:bg-emerald-950/20 dark:text-emerald-300">{message}</div>}

    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
      <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><div className="text-sm text-gray-500">وضعیت موتور</div><div className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ${badge(status?.isRunning === true)}`}>{status?.isRunning ? 'در حال اجرا' : 'متوقف'}</div></div>
      <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><div className="text-sm text-gray-500">وضعیت بازار</div><div className={`mt-2 inline-flex rounded-full px-3 py-1 text-sm font-bold ${badge(marketOpen)}`}>{!marketKnown ? 'نامشخص' : marketOpen ? 'باز' : 'بسته'}</div></div>
      <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><div className="text-sm text-gray-500">فرصت‌های جاری</div><div className="mt-2 text-3xl font-extrabold">{fmt(signals?.activeSignals)}</div></div>
      <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><div className="text-sm text-gray-500">معاملات امروز</div><div className="mt-2 text-3xl font-extrabold">{fmt(status?.todayTrades)}</div></div>
      <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><div className="text-sm text-gray-500">سود/زیان امروز</div><div className="mt-2 text-3xl font-extrabold">{money(status?.todayPnL)}</div></div>
    </div>

    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
      <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
        <div className="flex items-center justify-between gap-3"><div><h3 className="font-bold">کنترل موتور</h3><p className="mt-1 text-xs text-gray-500">اجرای دستی فقط با وضعیت معتبر بازار انجام می‌شود.</p></div><span className="text-xs text-gray-500">Run: {status?.lastRunId ?? '—'}</span></div>
        <div className="mt-5 grid grid-cols-2 gap-3"><button onClick={() => void runNow()} disabled={busy || !marketOpen} className="rounded-xl bg-cyan-600 px-4 py-3 font-bold text-white disabled:opacity-40">اجرای اسکن</button><button onClick={() => void stop()} disabled={busy || !status?.isRunning} className="rounded-xl border border-rose-400/50 px-4 py-3 font-bold disabled:opacity-40">توقف موتور</button></div>
        <div className="mt-4 space-y-2 text-sm"><div className="flex justify-between"><span>آخرین وضعیت</span><b>{status?.lastStatus || '—'}</b></div><div className="flex justify-between"><span>آخرین اجرا</span><b>{dateFa(status?.lastUpdate || status?.lastUpdated)}</b></div><div className="flex justify-between"><span>موقعیت‌های فعال</span><b>{fmt(status?.activePositions)}</b></div></div>
      </section>

      <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><h3 className="font-bold">سلامت موتور و وابستگی‌ها</h3>{health ? <div className="mt-4 space-y-2">{healthServices.map((s, i) => <div key={`${s.name}-${i}`} className="flex items-center justify-between rounded-xl bg-gray-50 p-3 dark:bg-gray-800/50"><div><b>{s.name || 'سرویس'}</b>{s.error && <div className="text-xs text-rose-500">{s.error}</div>}</div><div className="text-left text-xs"><span className={`rounded-full px-2 py-1 ${badge(s.status === 'healthy')}`}>{s.status || 'unknown'}</span>{typeof s.latencyMs === 'number' && <span className="mr-2 text-gray-500">{s.latencyMs}ms</span>}</div></div>)}</div> : <div className="mt-4 rounded-xl bg-gray-50 p-4 text-sm text-gray-500 dark:bg-gray-800/50">هنوز بررسی سلامت اجرا نشده است.</div>}</section>
    </div>

    <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><div className="flex items-center justify-between"><h3 className="font-bold">فرصت‌های جاری</h3><span className="text-xs text-gray-500">{fmt(signals?.totalSignals)} مورد</span></div><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--card-border-color)] text-right"><th className="p-3">نماد</th><th className="p-3">امتیاز</th><th className="p-3">قیمت</th><th className="p-3">دلیل</th><th className="p-3">زمان</th></tr></thead><tbody>{signals?.signals.slice(0, 20).map((x, i) => <tr key={String(x.id || i)} className="border-b border-[var(--card-border-color)]"><td className="p-3 font-bold">{x.symbol}</td><td className="p-3">{fmt(x.score)}</td><td className="p-3">{fmt(x.price)}</td><td className="p-3 max-w-md">{x.reason || '—'}</td><td className="p-3">{dateFa(x.updatedAt || x.createdAt)}</td></tr>)}</tbody></table>{!signals?.signals.length && <div className="p-6 text-center text-sm text-gray-500">در حال حاضر فرصت فعالی ثبت نشده است.</div>}</div></section>

    <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5"><h3 className="font-bold">آخرین اجرای موتور</h3><div className="mt-4 overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b border-[var(--card-border-color)] text-right"><th className="p-3">شناسه</th><th className="p-3">وضعیت</th><th className="p-3">تعداد</th><th className="p-3">زمان</th></tr></thead><tbody>{history?.items.map((x, i) => <tr key={String(x?.id || i)} className="border-b border-[var(--card-border-color)]"><td className="p-3 font-bold">{x?.id ?? x?.runId ?? '—'}</td><td className="p-3">{x?.status ?? x?.state ?? '—'}</td><td className="p-3">{fmt(x?.count ?? x?.signalsCount ?? x?.opportunitiesCount)}</td><td className="p-3">{dateFa(x?.createdAt || x?.startedAt || x?.updatedAt)}</td></tr>)}</tbody></table>{!history?.items.length && <div className="p-6 text-center text-sm text-gray-500">سابقه‌ای برای نمایش وجود ندارد.</div>}</div></section>
  </div>;
};

export default AdminScalpingPanel;
