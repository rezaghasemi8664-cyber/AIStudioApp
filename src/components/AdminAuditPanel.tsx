import React, { useCallback, useEffect, useMemo, useState } from 'react';
import * as adminControlService from '../services/adminControlService';

interface Props {
  modules: adminControlService.AdminModuleRecord[];
}

const moduleTitles: Record<string, string> = {
  dashboard: 'داشبورد مدیریتی', users: 'مدیریت کاربران', subscriptions: 'اشتراک‌ها', analysis: 'تحلیل‌ها',
  market: 'بازار', scalping: 'نوسان‌گیری', ai: 'هوش مصنوعی', prompts: 'پرامپت‌ها', history: 'تاریخچه',
  notifications: 'اطلاع‌رسانی', monitoring: 'مانیتورینگ', reports: 'گزارش‌ها', security: 'امنیت', settings: 'تنظیمات',
  maintenance: 'تعمیرات', updates: 'بروزرسانی', backup: 'پشتیبان‌گیری', payments: 'پرداخت‌ها', roles: 'نقش‌ها',
  audit: 'Audit Log', sessions: 'نشست‌ها', api: 'APIها', infrastructure: 'زیرساخت'
};

const actionTitles: Record<string, string> = {
  'activate-user': 'فعال‌سازی کاربر', 'deactivate-user': 'غیرفعال‌سازی کاربر', 'set-subscription': 'ثبت اشتراک',
  'delete-analysis': 'حذف تحلیل', 'delete-history-item': 'حذف سابقه', broadcast: 'ارسال اعلان',
  'revoke-session': 'لغو نشست', 'revoke-all-user-sessions': 'لغو همه نشست‌ها', 'revoke-api-key': 'لغو کلید API',
  'assign-role': 'تخصیص نقش', 'set-policy': 'ثبت سیاست', 'set-setting': 'ثبت تنظیم', enable: 'فعال‌سازی',
  disable: 'غیرفعال‌سازی', 'set-config': 'ثبت تنظیمات', 'set-prompt': 'ثبت پرامپت', 'health-check': 'بررسی سلامت',
  snapshot: 'ساخت گزارش', 'set-channel': 'تغییر کانال', 'create-transaction': 'ایجاد تراکنش', 'set-status': 'تغییر وضعیت',
  'create-backup': 'ایجاد پشتیبان', 'get-status': 'مشاهده وضعیت', 'record-deployment': 'ثبت استقرار'
};

const statusLabel = (code?: number | null) => {
  if (code != null && code >= 200 && code < 400) return 'موفق';
  if (code != null) return 'ناموفق';
  return 'نامشخص';
};

const AdminAuditPanel: React.FC<Props> = ({ modules }) => {
  const [rows, setRows] = useState<adminControlService.AdminAuditRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | number | null>(null);
  const [filters, setFilters] = useState<adminControlService.AdminAuditFilters>({});
  const [draft, setDraft] = useState<adminControlService.AdminAuditFilters>({});
  const limit = 25;

  const load = useCallback(async (nextOffset = offset, activeFilters = filters) => {
    setLoading(true); setError(null);
    try {
      const page = await adminControlService.getAuditPage(limit, nextOffset, activeFilters);
      setRows(page.data); setTotal(page.pagination.total); setOffset(page.pagination.offset);
    } catch (e) { setError(e instanceof Error ? e.message : 'دریافت Audit Log ناموفق بود.'); }
    finally { setLoading(false); }
  }, [filters, offset]);

  useEffect(() => { void load(0, filters); }, []);

  const moduleOptions = useMemo(() => modules.length ? modules : Object.keys(moduleTitles).map((moduleKey, id) => ({ id, moduleKey: moduleKey as adminControlService.AdminModuleKey, title: moduleTitles[moduleKey] } as adminControlService.AdminModuleRecord)), [modules]);
  const pageNumber = Math.floor(offset / limit) + 1;
  const pageCount = Math.max(1, Math.ceil(total / limit));

  const apply = () => { setFilters(draft); setOffset(0); void load(0, draft); };
  const reset = () => { const empty: adminControlService.AdminAuditFilters = {}; setDraft(empty); setFilters(empty); setOffset(0); void load(0, empty); };

  return <div dir="rtl" className="space-y-4">
    <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 mb-4">
        <div><h3 className="text-lg font-bold">گزارش کامل Audit Log</h3><p className="text-xs text-gray-500 mt-1">ثبت و بررسی عملیات مدیریتی سامانه</p></div>
        <button onClick={() => void load(offset, filters)} disabled={loading} className="rounded-xl border px-4 py-2 text-sm disabled:opacity-50">{loading ? 'در حال دریافت...' : 'به‌روزرسانی'}</button>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
        <select value={String(draft.moduleKey || '')} onChange={e => setDraft(v => ({ ...v, moduleKey: e.target.value || undefined }))} className="rounded-xl border bg-transparent px-3 py-2 text-sm"><option value="">همه ماژول‌ها</option>{moduleOptions.map(m => <option key={m.moduleKey} value={m.moduleKey}>{m.title || moduleTitles[m.moduleKey]}</option>)}</select>
        <input value={draft.action || ''} onChange={e => setDraft(v => ({ ...v, action: e.target.value || undefined }))} placeholder="عملیات" className="rounded-xl border bg-transparent px-3 py-2 text-sm" />
        <select value={String(draft.status || '')} onChange={e => setDraft(v => ({ ...v, status: e.target.value || undefined }))} className="rounded-xl border bg-transparent px-3 py-2 text-sm"><option value="">همه وضعیت‌ها</option><option value="200">موفق (۲xx)</option><option value="400">خطا (۴xx)</option><option value="500">خطای سرور (۵xx)</option></select>
        <input value={draft.adminUserId ? String(draft.adminUserId) : ''} onChange={e => setDraft(v => ({ ...v, adminUserId: e.target.value || undefined }))} placeholder="شناسه ادمین" inputMode="numeric" className="rounded-xl border bg-transparent px-3 py-2 text-sm" />
        <input type="datetime-local" value={draft.from || ''} onChange={e => setDraft(v => ({ ...v, from: e.target.value || undefined }))} className="rounded-xl border bg-transparent px-3 py-2 text-sm" />
        <input type="datetime-local" value={draft.to || ''} onChange={e => setDraft(v => ({ ...v, to: e.target.value || undefined }))} className="rounded-xl border bg-transparent px-3 py-2 text-sm" />
      </div>
      <div className="flex gap-2 mt-3"><button onClick={apply} className="rounded-xl bg-cyan-600 px-5 py-2 text-sm font-semibold text-white">اعمال فیلتر</button><button onClick={reset} className="rounded-xl border px-5 py-2 text-sm">حذف فیلترها</button></div>
    </div>
    {error && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error}</div>}
    <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] overflow-hidden">
      <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr className="border-b bg-gray-50/70 dark:bg-gray-800/40"><th className="p-3 text-right">ادمین</th><th className="p-3 text-right">عملیات</th><th className="p-3 text-right">ماژول</th><th className="p-3 text-right">وضعیت</th><th className="p-3 text-right">IP</th><th className="p-3 text-right">زمان</th><th className="p-3 text-right">جزئیات</th></tr></thead>
      <tbody>{rows.map((r, i) => { const ok = r.statusCode != null && r.statusCode >= 200 && r.statusCode < 400; const isOpen = expanded === r.id; return <React.Fragment key={String(r.id || i)}><tr className="border-b hover:bg-gray-50/50 dark:hover:bg-gray-800/20"><td className="p-3"><div className="font-semibold">{r.username || 'سیستم'}</div><div className="text-xs text-gray-500">{r.email || '-'}</div></td><td className="p-3">{actionTitles[r.action] || r.action || '-'}</td><td className="p-3">{moduleTitles[r.moduleKey || ''] || modules.find(m => m.moduleKey === r.moduleKey)?.title || r.moduleKey || '-'}</td><td className="p-3"><span className={`rounded-full px-2.5 py-1 text-xs ${ok ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>{statusLabel(r.statusCode)} {r.statusCode ? `(${r.statusCode})` : ''}</span></td><td dir="ltr" className="p-3">{r.ipAddress || '-'}</td><td className="p-3 whitespace-nowrap">{r.createdAt ? new Date(r.createdAt).toLocaleString('fa-IR') : '-'}</td><td className="p-3"><button onClick={() => setExpanded(isOpen ? null : r.id)} className="rounded-lg border px-3 py-1.5 text-xs">{isOpen ? 'بستن' : 'مشاهده'}</button></td></tr>{isOpen && <tr className="border-b bg-gray-50/50 dark:bg-gray-900/20"><td colSpan={7} className="p-4"><div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs"><div><b>شناسه هدف:</b> {r.targetId || '-'}</div><div><b>متد:</b> <span dir="ltr">{r.method || '-'}</span></div><div><b>مسیر:</b> <span dir="ltr">{r.path || '-'}</span></div></div><pre dir="ltr" className="mt-3 max-h-72 overflow-auto rounded-xl border p-3 text-left text-xs">{typeof r.details === 'string' ? r.details : JSON.stringify(r.details || {}, null, 2)}</pre></td></tr>}</React.Fragment>; })}</tbody></table></div>
      {rows.length === 0 && !loading && <div className="py-10 text-center text-gray-500">رویدادی مطابق فیلترها پیدا نشد.</div>}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 border-t p-4"><div className="text-xs text-gray-500">صفحه {pageNumber} از {pageCount} — مجموع {total.toLocaleString('fa-IR')} رویداد</div><div className="flex gap-2"><button disabled={offset === 0 || loading} onClick={() => void load(Math.max(0, offset - limit), filters)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">قبلی</button><button disabled={offset + limit >= total || loading} onClick={() => void load(offset + limit, filters)} className="rounded-lg border px-4 py-2 text-sm disabled:opacity-40">بعدی</button></div></div>
    </div>
  </div>;
};

export default AdminAuditPanel;
