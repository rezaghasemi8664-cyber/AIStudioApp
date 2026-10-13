import React, { useCallback, useEffect, useState } from 'react';
import { useNotification } from './NotificationSystem';
import { getReferralSummary, sendReferralInvite, type ReferralSummary } from '../services/referralService';

const ReferralInvitePanel: React.FC = () => {
  const { addNotification } = useNotification();
  const [summary, setSummary] = useState<ReferralSummary | null>(null);
  const [mobile, setMobile] = useState('');
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { setSummary(await getReferralSummary()); }
    catch (error) { addNotification(error instanceof Error ? error.message : 'دریافت کد معرف ناموفق بود', 'error'); }
    finally { setLoading(false); }
  }, [addNotification]);

  useEffect(() => { void load(); }, [load]);

  const handleSend = async (event: React.FormEvent) => {
    event.preventDefault();
    setSending(true);
    try {
      await sendReferralInvite(mobile);
      addNotification('کد معرف با موفقیت برای این شماره موبایل پیامک شد.', 'success');
      setMobile('');
      await load();
    } catch (error) {
      addNotification(error instanceof Error ? error.message : 'ارسال کد معرف ناموفق بود', 'error');
    } finally { setSending(false); }
  };

  return (
    <section className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-6 shadow-sm" dir="rtl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h3 className="text-lg font-bold">دعوت از دوستان</h3>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">با معرفی دوستان، ۵ روز اشتراک هدیه دریافت نمایید</p>
        </div>
        <div className="rounded-xl bg-cyan-50 px-4 py-2 text-sm font-semibold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300">
          {loading ? 'در حال دریافت کد…' : `کد معرف: ${summary?.referralCode || '—'}`}
        </div>
      </div>

      <form onSubmit={handleSend} className="mt-5 flex flex-col gap-3 sm:flex-row">
        <input
          type="tel"
          inputMode="numeric"
          autoComplete="tel"
          value={mobile}
          onChange={(event) => setMobile(event.target.value)}
          required
          pattern="(?:\+98|0098|98|0)?9[0-9]{9}"
          placeholder="شماره موبایل دوست"
          aria-label="شماره موبایل دوست"
          className="min-w-0 flex-1 rounded-xl border border-[var(--card-border-color)] bg-transparent px-4 py-3 text-sm outline-none focus:ring-2 focus:ring-cyan-500/30"
        />
        <button type="submit" disabled={sending || loading} className="rounded-xl bg-cyan-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-50">
          {sending ? 'در حال ارسال…' : 'ارسال کد معرف'}
        </button>
      </form>

      <div className="mt-4 flex flex-wrap gap-x-6 gap-y-2 text-sm text-gray-500 dark:text-gray-400">
        <span>دعوت‌های ارسال‌شده: {Number(summary?.invitationsSent || 0).toLocaleString('fa-IR')}</span>
        <span>ثبت‌نام موفق: {Number(summary?.successfulInvites || 0).toLocaleString('fa-IR')}</span>
        <span>هدیه هر ثبت‌نام موفق: ۵ روز</span>
      </div>
      <p className="mt-3 text-xs leading-6 text-gray-500 dark:text-gray-400">کد فقط برای شماره موبایلی معتبر است که دعوت برای آن ارسال شده باشد. پس از ثبت‌نام موفق با این کد، ۵ روز به اعتبار اشتراک شما افزوده می‌شود.</p>
    </section>
  );
};

export default ReferralInvitePanel;
