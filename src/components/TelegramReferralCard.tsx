import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { get } from '../services/apiClient';
import { useNotification } from './NotificationSystem';
import { PaperAirplaneIcon, ClipboardDocumentIcon } from './Icons';

interface TelegramReferralData {
  inviteLink: string;
  channelId?: string;
  createdAt?: string;
  confirmedMembers?: number | null;
  giftedDays?: number | null;
  trackingEnabled?: boolean;
}

const formatNumber = (value: number) => value.toLocaleString('fa-IR');

const TelegramReferralCard: React.FC = () => {
  const { addNotification } = useNotification();
  const [data, setData] = useState<TelegramReferralData | null>(null);
  const [loading, setLoading] = useState(true);
  const [copying, setCopying] = useState(false);
  const [loadError, setLoadError] = useState('');

  const loadInviteLink = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const response = await get<TelegramReferralData>('/telegram-referrals/me');
      if (!response?.success || !response.data?.inviteLink) {
        throw new Error(response?.message || 'دریافت لینک دعوت تلگرام ناموفق بود');
      }
      setData(response.data);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'دریافت لینک دعوت تلگرام ناموفق بود';
      setLoadError(message);
      addNotification(message, 'error');
    } finally {
      setLoading(false);
    }
  }, [addNotification]);

  useEffect(() => {
    void loadInviteLink();
  }, [loadInviteLink]);

  const confirmedMembers = data?.trackingEnabled && Number.isFinite(data.confirmedMembers)
    ? Math.max(0, Number(data.confirmedMembers))
    : null;
  const giftedDays = data?.trackingEnabled && Number.isFinite(data.giftedDays)
    ? Math.max(0, Number(data.giftedDays))
    : null;
  const progress = useMemo(() => confirmedMembers === null ? null : confirmedMembers % 20, [confirmedMembers]);
  const remaining = progress === null ? null : 20 - progress;

  const handleCopy = async () => {
    if (!data?.inviteLink || copying) return;
    setCopying(true);
    try {
      await navigator.clipboard.writeText(data.inviteLink);
      addNotification('لینک دعوت اختصاصی کپی شد.', 'success');
    } catch {
      addNotification('کپی خودکار انجام نشد؛ لینک را به‌صورت دستی کپی کنید.', 'error');
    } finally {
      setCopying(false);
    }
  };

  const metricValue = (value: number | null) => value === null
    ? 'در انتظار فعال‌سازی'
    : formatNumber(value);

  return (
    <section
      data-style-id="user-profile-telegram-referral-card"
      data-style-name="کارت دعوت دوستان به کانال تلگرام"
      className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-6 shadow-md"
      style={{ color: 'var(--card-color)' }}
      dir="rtl"
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold">
            <PaperAirplaneIcon className="h-5 w-5 text-cyan-600 dark:text-cyan-400" />
            دعوت دوستان به کانال تلگرام
          </h3>
          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            دوستانتان را به کانال رونیا دعوت کنید و به‌ازای هر ۲۰ عضو تأییدشده، ۵ روز اشتراک هدیه بگیرید.
          </p>
        </div>
        <span className="self-start rounded-full bg-cyan-50 px-3 py-1 text-xs font-semibold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-300">
          هر ۲۰ دعوت = ۵ روز هدیه
        </span>
      </div>

      <div className="mt-5">
        <label className="mb-2 block text-sm font-semibold">لینک دعوت اختصاصی شما</label>
        {loading ? (
          <div className="h-12 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800" />
        ) : data?.inviteLink ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              type="text"
              readOnly
              value={data.inviteLink}
              dir="ltr"
              aria-label="لینک دعوت اختصاصی تلگرام"
              onFocus={(event) => event.currentTarget.select()}
              className="min-w-0 flex-1 rounded-xl border border-[var(--card-border-color)] bg-transparent px-3 py-3 text-left text-sm"
            />
            <button
              type="button"
              onClick={handleCopy}
              disabled={copying}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-5 py-3 text-sm font-bold text-white transition hover:bg-cyan-700 disabled:opacity-60"
            >
              <ClipboardDocumentIcon className="h-4 w-4" />
              {copying ? 'در حال کپی…' : 'کپی لینک'}
            </button>
          </div>
        ) : (
          <div className="rounded-xl border border-red-300/60 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
            {loadError || 'لینک دعوت در دسترس نیست.'}
            <button type="button" onClick={() => void loadInviteLink()} className="mr-2 font-bold underline">تلاش مجدد</button>
          </div>
        )}
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-[var(--card-border-color)] p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">اعضای دعوت‌شده و تأییدشده</p>
          <p className="mt-2 text-lg font-bold">{metricValue(confirmedMembers)}</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border-color)] p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">روزهای اشتراک هدیه دریافت‌شده</p>
          <p className="mt-2 text-lg font-bold">{giftedDays === null ? 'در انتظار فعال‌سازی' : `${formatNumber(giftedDays)} روز`}</p>
        </div>
        <div className="rounded-xl border border-[var(--card-border-color)] p-4">
          <p className="text-xs text-gray-500 dark:text-gray-400">مانده تا پاداش بعدی</p>
          <p className="mt-2 text-lg font-bold">{remaining === null ? 'در انتظار فعال‌سازی' : `${formatNumber(remaining)} عضو`}</p>
        </div>
      </div>

      <div className="mt-5">
        <div className="mb-2 flex items-center justify-between gap-3 text-sm">
          <span className="font-semibold">پیشرفت تا پاداش بعدی</span>
          <span className="text-gray-500 dark:text-gray-400">
            {progress === null ? 'پس از فعال‌سازی رصد عضویت نمایش داده می‌شود' : `${formatNumber(progress)} از ۲۰ عضو`}
          </span>
        </div>
        <div className="h-3 overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
          <div
            className="h-full rounded-full bg-cyan-600 transition-all duration-500"
            style={{ width: progress === null ? '0%' : `${(progress / 20) * 100}%` }}
          />
        </div>
      </div>

      <p className="mt-4 text-xs leading-6 text-gray-500 dark:text-gray-400">
        فقط عضویت واقعی و یکتای کاربران در کانال محاسبه می‌شود؛ ارسال لینک به‌تنهایی امتیاز ندارد.
      </p>
    </section>
  );
};

export default TelegramReferralCard;
