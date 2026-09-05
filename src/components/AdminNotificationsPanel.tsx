import React, { useState } from 'react';
import * as adminActionsService from '../services/adminActionsService';

interface Props { onComplete?: () => Promise<void> | void; }

type NotificationType = 'INFO' | 'SUCCESS' | 'WARNING' | 'ERROR';

const AdminNotificationsPanel: React.FC<Props> = ({ onComplete = () => undefined }) => {
  const [title, setTitle] = useState('اطلاعیه سامانه');
  const [message, setMessage] = useState('');
  const [type, setType] = useState<NotificationType>('INFO');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ created?: number; skipped?: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const send = async () => {
    if (!title.trim() || !message.trim()) {
      setError('عنوان و متن اطلاعیه الزامی است.');
      return;
    }
    const confirmed = window.confirm('این اطلاعیه برای کاربران سامانه ارسال می‌شود. ادامه می‌دهید؟');
    if (!confirmed) return;

    setBusy(true);
    setError(null);
    setResult(null);
    try {
      const data = await adminActionsService.executeAction<{ created?: number; skipped?: number }>(
        'notifications',
        'broadcast',
        { title: title.trim(), message: message.trim(), type },
      );
      setResult(data || {});
      setMessage('');
      await onComplete();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'ارسال اطلاعیه ناموفق بود.');
    } finally {
      setBusy(false);
    }
  };

  const typeLabel: Record<NotificationType, string> = {
    INFO: 'اطلاع‌رسانی',
    SUCCESS: 'موفقیت',
    WARNING: 'هشدار',
    ERROR: 'خطا',
  };

  return (
    <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5" dir="rtl">
      <div className="mb-6">
        <h2 className="text-xl font-bold">مرکز اطلاع‌رسانی</h2>
        <p className="mt-1 text-sm text-gray-500">ارسال اطلاعیه عمومی به کاربران و ثبت عملیات در Audit Log.</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <label className="space-y-1.5 lg:col-span-2">
          <span className="text-sm font-medium">عنوان اطلاعیه</span>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            maxLength={200}
            className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30"
          />
        </label>
        <label className="space-y-1.5">
          <span className="text-sm font-medium">نوع اطلاعیه</span>
          <select
            value={type}
            onChange={e => setType(e.target.value as NotificationType)}
            className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-2.5 text-sm outline-none"
          >
            {(Object.keys(typeLabel) as NotificationType[]).map(key => <option key={key} value={key}>{typeLabel[key]}</option>)}
          </select>
        </label>
      </div>

      <label className="mt-4 block space-y-1.5">
        <span className="text-sm font-medium">متن اطلاعیه</span>
        <textarea
          value={message}
          onChange={e => setMessage(e.target.value)}
          maxLength={5000}
          rows={7}
          placeholder="متن اطلاعیه را وارد کنید..."
          className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30"
        />
        <span className="block text-xs text-gray-500">حداکثر ۵۰۰۰ نویسه</span>
      </label>

      <div className="mt-5 rounded-xl border border-cyan-500/20 bg-cyan-50/50 dark:bg-cyan-950/20 p-4 text-sm">
        <b>گیرندگان:</b> همه کاربران سامانه
        <div className="mt-1 text-xs text-gray-500">این بخش از عملیات واقعی «ارسال اعلان همگانی» در Backend استفاده می‌کند.</div>
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <button
          type="button"
          disabled={busy || !title.trim() || !message.trim()}
          onClick={() => void send()}
          className="rounded-xl bg-cyan-600 px-6 py-2.5 font-semibold text-white disabled:opacity-50"
        >
          {busy ? 'در حال ارسال...' : 'ارسال اطلاعیه به همه کاربران'}
        </button>
        {result && <span className="text-sm text-green-600">ارسال انجام شد{result.created !== undefined ? `؛ ${result.created.toLocaleString('fa-IR')} اعلان ایجاد شد` : ''}{result.skipped ? ` و ${result.skipped.toLocaleString('fa-IR')} مورد رد شد` : ''}.</span>}
      </div>

      {error && <div className="mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-700 dark:bg-red-950/20">{error}</div>}
    </div>
  );
};

export default AdminNotificationsPanel;
