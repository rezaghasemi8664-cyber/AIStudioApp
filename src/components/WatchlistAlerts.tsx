import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNotification } from './NotificationSystem';
import * as alertService from '../services/watchlistAlertService';
import { WATCHLIST_ALERT_METRICS, WATCHLIST_ALERT_OPERATORS } from '../types/watchlistAlert';
import type { WatchlistAlertMetric, WatchlistAlertOperator, WatchlistAlertRule, WatchlistAlertLogic, WatchlistAlertCondition } from '../types/watchlistAlert';
import type { WatchlistAlertHistoryItem } from '../services/watchlistAlertService';
import * as watchlistService from '../services/watchlistService';

interface Props { isOnline: boolean; }
const READ_HISTORY_KEY = 'roniya_watchlist_alert_history_read';
const metricLabel = (metric: WatchlistAlertMetric) => WATCHLIST_ALERT_METRICS.find(item => item.value === metric)?.label || metric;
const operatorLabel = (operator: WatchlistAlertOperator) => WATCHLIST_ALERT_OPERATORS.find(item => item.value === operator)?.label || operator;
const statusLabel: Record<WatchlistAlertRule['status'], string> = { armed: 'فعال', triggered: 'فعال‌شده', disabled: 'غیرفعال' };
const dataStatusLabel: Record<alertService.WatchlistAlertDataStatus, string> = { LIVE: 'داده زنده', CACHED: 'داده ذخیره‌شده', UNAVAILABLE: 'داده در دسترس نیست' };
const readReadIds = (): string[] => { try { const value = JSON.parse(localStorage.getItem(READ_HISTORY_KEY) || '[]'); return Array.isArray(value) ? value.map(String) : []; } catch { return []; } };
const persistReadIds = (ids: string[]) => { try { localStorage.setItem(READ_HISTORY_KEY, JSON.stringify(ids.slice(-500))); } catch { /* ignore */ } };

const WatchlistAlerts: React.FC<Props> = ({ isOnline }) => {
  const { addNotification } = useNotification();
  const [alerts, setAlerts] = useState<WatchlistAlertRule[]>([]);
  const [history, setHistory] = useState<WatchlistAlertHistoryItem[]>([]);
  const [readIds, setReadIds] = useState<string[]>(readReadIds);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [symbols, setSymbols] = useState<watchlistService.WatchlistSymbol[]>([]);
  const [loading, setLoading] = useState(true); const [saving, setSaving] = useState(false); const [evaluating, setEvaluating] = useState(false);
  const dataStatus = useMemo<alertService.WatchlistAlertDataStatus>(() => { const statuses = history.map(item => item.dataStatus || item.snapshot?.dataStatus).filter(Boolean) as alertService.WatchlistAlertDataStatus[]; return statuses.includes('LIVE') ? 'LIVE' : (statuses.includes('CACHED') ? 'CACHED' : 'UNAVAILABLE'); }, [history]);
  const [symbol, setSymbol] = useState('');
  const [logic, setLogic] = useState<WatchlistAlertLogic>('AND');
  const [conditions, setConditions] = useState<WatchlistAlertCondition[]>([{ metric: 'lastPrice', operator: 'gte', threshold: 0 }]);
  const [note, setNote] = useState('');

  const load = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const [loadedAlerts, loadedHistory, lists] = await Promise.all([alertService.getAlerts(), alertService.getAlertHistory(), watchlistService.getWatchlists()]);
      setAlerts(loadedAlerts); setHistory(loadedHistory);
      const knownReadIds = readReadIds(); const newItems = loadedHistory.filter(item => !knownReadIds.includes(item.id));
      if (newItems.length && history.length) addNotification(`${newItems.length.toLocaleString('fa-IR')} هشدار جدید در مرکز اعلان‌ها ثبت شد.`, 'info');
      const map = new Map<string, watchlistService.WatchlistSymbol>(); lists.forEach(list => list.symbols.forEach(item => map.set(item.symbol, item))); setSymbols(Array.from(map.values()));
    } catch (error: any) { if (showLoading) addNotification(error?.response?.data?.message || 'دریافت هشدارها ناموفق بود.', 'error'); }
    finally { if (showLoading) setLoading(false); }
  }, [addNotification, history.length]);

  useEffect(() => { void load(); }, [load]);
  useEffect(() => { if (!isOnline) return undefined; const timer = window.setInterval(() => { void load(false); }, 60_000); return () => window.clearInterval(timer); }, [isOnline, load]);

  const stats = useMemo(() => ({ total: alerts.length, armed: alerts.filter(item => item.status === 'armed').length, triggered: alerts.filter(item => item.status === 'triggered').length, disabled: alerts.filter(item => item.status === 'disabled').length, unread: history.filter(item => !readIds.includes(item.id)).length }), [alerts, history, readIds]);
  const updateCondition = (index: number, patch: Partial<WatchlistAlertCondition>) => setConditions(prev => prev.map((item, i) => i === index ? { ...item, ...patch } : item));
  const addCondition = () => setConditions(prev => [...prev, { metric: 'lastChangePercent', operator: 'gte', threshold: 0 }]);
  const removeCondition = (index: number) => setConditions(prev => prev.length <= 1 ? prev : prev.filter((_, i) => i !== index));
  const markRead = (id: string) => { if (readIds.includes(id)) return; const next = [...readIds, id]; setReadIds(next); persistReadIds(next); };
  const markAllRead = () => { const next = history.map(item => item.id); setReadIds(next); persistReadIds(next); addNotification('همه هشدارهای تاریخچه خوانده شدند.', 'success'); };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!symbol) return addNotification('نماد را انتخاب کنید.', 'error');
    if (conditions.some(item => !Number.isFinite(Number(item.threshold)))) return addNotification('آستانه همه شروط باید معتبر باشد.', 'error');
    if (!isOnline) return addNotification('برای ایجاد هشدار باید آنلاین باشید.', 'error');
    setSaving(true);
    try {
      const normalized = conditions.map(item => ({ ...item, threshold: Number(item.threshold) }));
      const created = await alertService.createAlert({ symbol, metric: normalized[0].metric, operator: normalized[0].operator, threshold: normalized[0].threshold, conditions: normalized, logic, note: note.trim() || undefined });
      setAlerts(previous => [created, ...previous]); setConditions([{ metric: 'lastPrice', operator: 'gte', threshold: 0 }]); setNote('');
      addNotification(`هشدار ${normalized.length > 1 ? 'چندشرطی' : 'تک‌شرطی'} با موفقیت ایجاد شد.`, 'info');
    } catch (error: any) { addNotification(error?.response?.data?.message || 'ایجاد هشدار ناموفق بود.', 'error'); } finally { setSaving(false); }
  };

  const toggle = async (alert: WatchlistAlertRule) => {
    if (!isOnline) return addNotification('برای تغییر وضعیت هشدار باید آنلاین باشید.', 'error');
    const next = alert.status === 'disabled' ? 'armed' : 'disabled';
    try { const updated = await alertService.updateAlert(alert.id, { status: next }); setAlerts(previous => previous.map(item => item.id === updated.id ? updated : item)); if (next === 'armed') await load(false); }
    catch (error: any) { addNotification(error?.response?.data?.message || 'تغییر وضعیت هشدار ناموفق بود.', 'error'); }
  };
  const remove = async (id: string) => {
    if (!isOnline || !window.confirm('آیا از حذف این هشدار اطمینان دارید؟')) return;
    try { await alertService.deleteAlert(id); setAlerts(previous => previous.filter(item => item.id !== id)); addNotification('هشدار حذف شد.', 'info'); }
    catch (error: any) { addNotification(error?.response?.data?.message || 'حذف هشدار ناموفق بود.', 'error'); }
  };
  const evaluate = async () => {
    if (!isOnline) return addNotification('برای بررسی هشدارها باید آنلاین باشید.', 'error'); setEvaluating(true);
    try { const result = await alertService.evaluateAlerts(); await load(false); addNotification(`${result.evaluated.toLocaleString('fa-IR')} هشدار بررسی شد و ${result.triggered.toLocaleString('fa-IR')} مورد فعال شد.`, 'info'); }
    catch (error: any) { addNotification(error?.response?.data?.message || 'اجرای موتور هشدار ناموفق بود.', 'error'); } finally { setEvaluating(false); }
  };

  return <div dir="rtl" className="page-shell watchlist-alerts-page space-y-5">
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <div className={`col-span-2 md:col-span-5 rounded-2xl border p-3 watchlist-alert-data-${dataStatus}`}><div className="flex flex-wrap items-center justify-between gap-2"><div><div className="text-xs text-gray-500 dark:text-gray-400">وضعیت داده موتور هشدار</div><div className="font-black mt-1">{dataStatusLabel[dataStatus]}</div></div><div className="text-xs text-gray-500 dark:text-gray-400">هشدار فقط با داده واقعی بازار بررسی می‌شود؛ در نبود داده هیچ Trigger جعلی ایجاد نمی‌شود.</div></div></div>
      {[['کل هشدارها', stats.total], ['فعال', stats.armed], ['فعال‌شده', stats.triggered], ['غیرفعال', stats.disabled], ['خوانده‌نشده', stats.unread]].map(([label, value]) => <div key={String(label)} className={`rounded-2xl border p-4 ${label === 'خوانده‌نشده' && Number(value) > 0 ? 'border-amber-400 bg-amber-50/80 dark:bg-amber-950/20' : 'border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60'}`}><div className="text-xs text-gray-500 dark:text-gray-400">{label}</div><div className="mt-1 text-2xl font-black">{Number(value).toLocaleString('fa-IR')}</div></div>)}
    </div>

    <form onSubmit={create} className="rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4 space-y-4">
      <div className="flex items-center justify-between gap-3"><div><h3 className="font-black">ایجاد هشدار چندشرطی</h3><p className="text-xs text-gray-500 mt-1">همه شروط با یک Snapshot واقعی بازار ارزیابی می‌شوند.</p></div><button type="button" onClick={evaluate} disabled={evaluating || !isOnline} className="px-3 py-2 rounded-xl bg-cyan-600 text-white text-sm font-bold disabled:opacity-50">{evaluating ? 'در حال بررسی…' : 'بررسی هشدارها'}</button></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <select value={symbol} onChange={e => setSymbol(e.target.value)} className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2"><option value="">انتخاب نماد</option>{symbols.map(item => <option key={item.symbol} value={item.symbol}>{item.symbol} — {item.name}</option>)}</select>
        <select value={logic} onChange={e => setLogic(e.target.value as WatchlistAlertLogic)} className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2"><option value="AND">تمام شروط برقرار باشد (AND)</option><option value="OR">حداقل یک شرط برقرار باشد (OR)</option></select>
        <input value={note} onChange={e => setNote(e.target.value)} placeholder="یادداشت اختیاری" className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2" />
      </div>
      <div className="space-y-2">
        {conditions.map((condition, index) => <div key={`${index}-${condition.metric}`} className="grid grid-cols-1 md:grid-cols-4 gap-2 rounded-xl border border-[var(--color-border)] p-3">
          <select value={condition.metric} onChange={e => updateCondition(index, { metric: e.target.value as WatchlistAlertMetric })} className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2">{WATCHLIST_ALERT_METRICS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <select value={condition.operator} onChange={e => updateCondition(index, { operator: e.target.value as WatchlistAlertOperator })} className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2">{WATCHLIST_ALERT_OPERATORS.map(item => <option key={item.value} value={item.value}>{item.label}</option>)}</select>
          <input type="number" step="any" value={condition.threshold} onChange={e => updateCondition(index, { threshold: Number(e.target.value) })} placeholder="آستانه" className="rounded-xl border border-[var(--color-border)] bg-transparent px-3 py-2" />
          <button type="button" onClick={() => removeCondition(index)} disabled={conditions.length <= 1} className="rounded-xl bg-red-50 text-red-600 dark:bg-red-950/20 disabled:opacity-30">حذف شرط</button>
        </div>)}
        <button type="button" onClick={addCondition} disabled={conditions.length >= 5} className="px-3 py-2 rounded-xl bg-gray-100 dark:bg-gray-800 text-sm font-bold disabled:opacity-40">+ افزودن شرط ({conditions.length}/5)</button>
      </div>
      <button type="submit" disabled={saving || !isOnline} className="px-5 py-2.5 rounded-xl bg-emerald-600 text-white font-bold disabled:opacity-50">{saving ? 'در حال ذخیره…' : 'ایجاد هشدار'}</button>
    </form>

    <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden">
      {loading ? <div className="p-8 text-center text-gray-500">در حال دریافت هشدارها…</div> : alerts.length === 0 ? <div className="p-8 text-center text-gray-500">هنوز هشداری ایجاد نشده است.</div> : <div className="overflow-x-auto"><table className="w-full text-sm"><thead className="bg-gray-50 dark:bg-gray-800/80"><tr><th className="p-3 text-right">نماد</th><th className="p-3 text-right">منطق</th><th className="p-3 text-right">شروط</th><th className="p-3 text-right">وضعیت</th><th className="p-3 text-right">عملیات</th></tr></thead><tbody>{alerts.map(alert => { const list = alert.conditions?.length ? alert.conditions : [{ metric: alert.metric, operator: alert.operator, threshold: alert.threshold }]; return <tr key={alert.id} className="border-t border-[var(--color-border)]"><td className="p-3 font-bold">{alert.symbol}</td><td className="p-3 font-mono">{alert.logic || 'AND'}</td><td className="p-3"><div className="space-y-1">{list.map((condition, i) => <div key={`${alert.id}-${i}`} className="text-xs">{metricLabel(condition.metric)} {operatorLabel(condition.operator)} <b>{Number(condition.threshold).toLocaleString('fa-IR')}</b></div>)}</div></td><td className="p-3"><span className="px-2 py-1 rounded-lg bg-gray-100 dark:bg-gray-800">{statusLabel[alert.status]}</span></td><td className="p-3 flex gap-2"><button type="button" onClick={() => toggle(alert)} className="px-2.5 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800">{alert.status === 'disabled' ? 'فعال‌سازی' : 'غیرفعال‌سازی'}</button><button type="button" onClick={() => remove(alert.id)} className="px-2.5 py-1.5 rounded-lg text-red-600 bg-red-50 dark:bg-red-950/20">حذف</button></td></tr>; })}</tbody></table></div>}
    </div>

    <div className="rounded-2xl border border-[var(--color-border)] overflow-hidden">
      <div className="px-4 py-3 border-b border-[var(--color-border)] flex flex-wrap items-center justify-between gap-3"><div><h3 className="font-black">مرکز اعلان‌های هشدار</h3><p className="text-xs text-gray-500 mt-1">Triggerهای واقعی موتور هشدار، با وضعیت خوانده‌شده و Snapshot بازار</p></div><div className="flex items-center gap-2"><span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300 text-xs font-bold">{stats.unread.toLocaleString('fa-IR')} خوانده‌نشده</span><button type="button" onClick={markAllRead} disabled={!stats.unread} className="px-3 py-1.5 rounded-lg bg-gray-100 dark:bg-gray-800 text-xs font-bold disabled:opacity-40">همه را خواندم</button></div></div>
      {history.length === 0 ? <div className="p-8 text-center text-gray-500">هنوز هیچ هشداری فعال نشده است.</div> : <div className="divide-y divide-[var(--color-border)]">{history.map(item => { const unread = !readIds.includes(item.id); const expanded = expandedId === item.id; return <div key={item.id} className={unread ? 'bg-amber-50/70 dark:bg-amber-950/10' : ''}><button type="button" onClick={() => { markRead(item.id); setExpandedId(expanded ? null : item.id); }} className="w-full text-right px-4 py-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition"><div className="flex flex-col lg:flex-row lg:items-center gap-2 lg:gap-4"><span className={`w-2.5 h-2.5 rounded-full shrink-0 ${unread ? 'bg-amber-500' : 'bg-gray-300 dark:bg-gray-600'}`} /><span className="text-xs text-gray-500 whitespace-nowrap">{new Date(item.triggeredAt).toLocaleString('fa-IR')}</span><span className={`px-2 py-1 rounded-lg text-[11px] font-bold watchlist-alert-data-${item.dataStatus || item.snapshot?.dataStatus || 'UNAVAILABLE'}`}>{dataStatusLabel[item.dataStatus || item.snapshot?.dataStatus || 'UNAVAILABLE']}</span><span className="font-black">{item.symbol}</span><span className="text-sm">{item.logic || 'AND'} · {item.conditions?.length || 1} شرط</span><span className="mr-auto text-xs text-cyan-600">{expanded ? 'بستن جزئیات' : 'مشاهده جزئیات'}</span></div></button>{expanded && <div className="px-4 pb-4 space-y-3"><div className="rounded-xl bg-gray-50 dark:bg-gray-800/70 p-3 grid grid-cols-2 md:grid-cols-6 gap-3 text-xs"><div><span className="text-gray-500">قیمت آخر</span><b className="block mt-1">{item.snapshot?.lastPrice != null ? item.snapshot.lastPrice.toLocaleString('fa-IR') : '—'}</b></div><div><span className="text-gray-500">درصد آخر</span><b className="block mt-1">{item.snapshot?.lastChangePercent != null ? `${item.snapshot.lastChangePercent.toLocaleString('fa-IR')}٪` : '—'}</b></div><div><span className="text-gray-500">حجم</span><b className="block mt-1">{item.snapshot?.volume != null ? item.snapshot.volume.toLocaleString('fa-IR') : '—'}</b></div><div><span className="text-gray-500">قیمت پایانی</span><b className="block mt-1">{item.snapshot?.closePrice != null ? item.snapshot.closePrice.toLocaleString('fa-IR') : '—'}</b></div><div><span className="text-gray-500">زمان Snapshot</span><b className="block mt-1">{item.snapshot?.capturedAt ? new Date(item.snapshot.capturedAt).toLocaleString('fa-IR') : '—'}</b></div><div><span className="text-gray-500">منبع</span><b className="block mt-1">{item.source || item.snapshot?.source || '—'}</b></div></div>{item.conditions?.length ? <div className="rounded-xl border border-[var(--color-border)] p-3 space-y-2"><div className="font-bold text-sm">نتیجه شروط</div>{item.conditions.map((condition, i) => <div key={`${item.id}-condition-${i}`} className="flex flex-wrap items-center gap-2 text-xs"><span>{metricLabel(condition.metric)}</span><span>{operatorLabel(condition.operator)}</span><b>{Number(condition.threshold).toLocaleString('fa-IR')}</b><span>→ {condition.value == null ? 'داده موجود نیست' : Number(condition.value).toLocaleString('fa-IR')}</span><span className={`px-2 py-1 rounded-lg ${condition.matched ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300' : 'bg-gray-100 dark:bg-gray-800'}`}>{condition.matched ? 'برقرار' : 'برقرار نیست'}</span></div>)}</div> : null}</div>}</div>; })}</div>}
    </div>
  </div>;
};

export default WatchlistAlerts;
