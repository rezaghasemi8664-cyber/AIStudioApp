import React, { useState } from 'react';
import * as adminActionsService from '../services/adminActionsService';
import type { AdminModuleKey } from '../services/adminControlService';

interface Props {
  moduleKey: AdminModuleKey;
  onComplete: () => Promise<void> | void;
}

const card = 'rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5';
const input = 'w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30';

const OperationalPanels: React.FC<Props> = ({ moduleKey, onComplete }) => {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('IRR');
  const [gateway, setGateway] = useState('');
  const [description, setDescription] = useState('');
  const [transactionId, setTransactionId] = useState('');
  const [status, setStatus] = useState('paid');
  const [referenceNo, setReferenceNo] = useState('');
  const [channel, setChannel] = useState('stable');
  const [version, setVersion] = useState('');
  const [commitSha, setCommitSha] = useState('');
  const [deploymentStatus, setDeploymentStatus] = useState('success');
  const [backupResult, setBackupResult] = useState<Record<string, unknown> | null>(null);

  const run = async (action: string, payload: Record<string, unknown> = {}) => {
    setBusy(true); setMessage(null); setError(null);
    try {
      const result = await adminActionsService.executeAction(moduleKey, action, payload);
      if (moduleKey === 'backup' && action === 'get-status') setBackupResult((result?.data as Record<string, unknown>) || result || null);
      setMessage('عملیات با موفقیت انجام شد و در گزارش Audit ثبت شد.');
      await onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'اجرای عملیات ناموفق بود.');
    } finally { setBusy(false); }
  };

  if (moduleKey === 'payments') return <div className={card} dir="rtl">
    <div className="mb-5"><h3 className="font-bold text-lg">مدیریت پرداخت و تراکنش</h3><p className="mt-1 text-sm text-gray-500">ثبت تراکنش، کنترل وضعیت و ثبت شماره مرجع بدون ورود JSON.</p></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <label className="space-y-1.5"><span className="text-sm font-medium">شناسه کاربر</span><input className={input} value={userId} onChange={e=>setUserId(e.target.value)} placeholder="مثلاً 125" dir="ltr" /></label>
      <label className="space-y-1.5"><span className="text-sm font-medium">مبلغ</span><input className={input} value={amount} onChange={e=>setAmount(e.target.value)} type="number" min="0" placeholder="مثلاً 500000" dir="ltr" /></label>
      <label className="space-y-1.5"><span className="text-sm font-medium">واحد پول</span><select className={input} value={currency} onChange={e=>setCurrency(e.target.value)}><option value="IRR">ریال</option><option value="IRT">تومان</option></select></label>
      <label className="space-y-1.5"><span className="text-sm font-medium">درگاه</span><input className={input} value={gateway} onChange={e=>setGateway(e.target.value)} placeholder="نام درگاه" /></label>
      <label className="space-y-1.5 md:col-span-2"><span className="text-sm font-medium">توضیحات</span><input className={input} value={description} onChange={e=>setDescription(e.target.value)} placeholder="توضیحات تراکنش" /></label>
    </div>
    <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy || !userId || !amount} onClick={()=>void run('create-transaction',{userId:Number(userId),amount:Number(amount),currency,gateway,description})} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">ثبت تراکنش</button></div>
    <div className="mt-6 border-t border-[var(--card-border-color)] pt-5"><h4 className="font-bold mb-3">تغییر وضعیت تراکنش</h4><div className="grid grid-cols-1 md:grid-cols-3 gap-3"><input className={input} value={transactionId} onChange={e=>setTransactionId(e.target.value)} placeholder="شناسه تراکنش" dir="ltr"/><select className={input} value={status} onChange={e=>setStatus(e.target.value)}><option value="pending">در انتظار</option><option value="paid">پرداخت‌شده</option><option value="failed">ناموفق</option><option value="cancelled">لغوشده</option><option value="refunded">مستردشده</option></select><input className={input} value={referenceNo} onChange={e=>setReferenceNo(e.target.value)} placeholder="شماره مرجع" dir="ltr"/></div><button disabled={busy || !transactionId} onClick={()=>void run('set-status',{id:transactionId,status,referenceNo})} className="mt-3 rounded-xl border border-cyan-500/50 px-5 py-2.5 font-semibold disabled:opacity-50">ثبت وضعیت</button></div>
    {message&&<p className="mt-4 text-sm text-green-600">{message}</p>}{error&&<p className="mt-4 text-sm text-red-600">{error}</p>}
  </div>;

  if (moduleKey === 'backup') return <div className={card} dir="rtl">
    <div className="mb-5"><h3 className="font-bold text-lg">پشتیبان‌گیری و بازیابی</h3><p className="mt-1 text-sm text-gray-500">ایجاد Backup واقعی از پایگاه داده و مشاهده وضعیت آخرین عملیات.</p></div>
    <div className="flex flex-wrap gap-3"><button disabled={busy} onClick={()=>void run('create-backup',{type:'database'})} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">ایجاد پشتیبان جدید</button><button disabled={busy} onClick={()=>void run('get-status')} className="rounded-xl border px-5 py-2.5 font-semibold disabled:opacity-50">دریافت وضعیت پشتیبان‌ها</button></div>
    {backupResult&&<pre dir="ltr" className="mt-5 max-h-72 overflow-auto rounded-xl bg-gray-950 p-4 text-xs text-gray-100">{JSON.stringify(backupResult,null,2)}</pre>}
    <div className="mt-5 rounded-xl bg-amber-50 dark:bg-amber-950/20 p-4 text-sm text-amber-800 dark:text-amber-200">برای اجرای Backup واقعی باید <span dir="ltr">ADMIN_BACKUP_DIR</span> روی سرور تنظیم شده باشد و حساب سرویس SQL Server مجوز نوشتن در آن مسیر را داشته باشد.</div>
    {message&&<p className="mt-4 text-sm text-green-600">{message}</p>}{error&&<p className="mt-4 text-sm text-red-600">{error}</p>}
  </div>;

  if (moduleKey === 'updates') return <div className={card} dir="rtl">
    <div className="mb-5"><h3 className="font-bold text-lg">بروزرسانی و استقرار</h3><p className="mt-1 text-sm text-gray-500">انتخاب کانال انتشار و ثبت نتیجه استقرار در تاریخچه مدیریتی.</p></div>
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4"><label className="space-y-1.5"><span className="text-sm font-medium">کانال انتشار</span><select className={input} value={channel} onChange={e=>setChannel(e.target.value)}><option value="stable">پایدار</option><option value="beta">آزمایشی</option></select></label><label className="space-y-1.5"><span className="text-sm font-medium">نسخه</span><input className={input} value={version} onChange={e=>setVersion(e.target.value)} placeholder="مثلاً 2.2.0" dir="ltr" /></label><label className="space-y-1.5"><span className="text-sm font-medium">Commit SHA</span><input className={input} value={commitSha} onChange={e=>setCommitSha(e.target.value)} placeholder="SHA استقرار" dir="ltr" /></label><label className="space-y-1.5"><span className="text-sm font-medium">نتیجه استقرار</span><select className={input} value={deploymentStatus} onChange={e=>setDeploymentStatus(e.target.value)}><option value="success">موفق</option><option value="failed">ناموفق</option><option value="pending">در انتظار</option></select></label></div>
    <div className="mt-4 flex flex-wrap gap-2"><button disabled={busy} onClick={()=>void run('set-channel',{channel})} className="rounded-xl border border-cyan-500/50 px-5 py-2.5 font-semibold disabled:opacity-50">ذخیره کانال انتشار</button><button disabled={busy || !version} onClick={()=>void run('record-deployment',{version,channel,commitSha,status:deploymentStatus})} className="rounded-xl bg-cyan-600 px-5 py-2.5 font-semibold text-white disabled:opacity-50">ثبت استقرار</button></div>
    <div className="mt-5 rounded-xl bg-slate-50 dark:bg-slate-900/50 p-4 text-sm text-gray-600 dark:text-gray-300">این بخش نتیجه استقرار را ثبت می‌کند؛ اجرای واقعی Deploy همچنان توسط فرآیند CI/CD انجام می‌شود.</div>
    {message&&<p className="mt-4 text-sm text-green-600">{message}</p>}{error&&<p className="mt-4 text-sm text-red-600">{error}</p>}
  </div>;

  return null;
};

export default OperationalPanels;
