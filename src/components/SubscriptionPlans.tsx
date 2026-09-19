import React, { useEffect, useMemo, useState } from 'react';
import * as profileService from '../services/profileService';
import { createSubscriptionPayment } from '../services/subscriptionService';
import type { SubscriptionPlan } from '../services/subscriptionService';

interface SubscriptionPlansProps {
  currentPlanId?: number | null;
  onRenew?: (plan: SubscriptionPlan) => void;
}

const PlanIcon: React.FC<{ durationMonths: number }> = ({ durationMonths }) => (
  <svg viewBox="0 0 64 64" className="h-12 w-12" fill="none" aria-hidden="true">
    <circle cx="32" cy="32" r="29" stroke="currentColor" strokeWidth="2.5" opacity="0.18" />
    <path d="M20 34.5 28 42l17-20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />
    <path d="M18 18h28" stroke="currentColor" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
    <text x="32" y="56" textAnchor="middle" fontSize="9" fontWeight="700" fill="currentColor">
      {durationMonths}M
    </text>
  </svg>
);

const formatPrice = (price: string | number, currency: string): string => {
  const numeric = Number(price);
  const formatted = Number.isFinite(numeric)
    ? new Intl.NumberFormat('fa-IR').format(numeric)
    : String(price);

  const normalizedCurrency = String(currency || '').trim();
  if (!normalizedCurrency) return formatted;

  const labels: Record<string, string> = {
    IRR: 'ریال',
    IRT: 'تومان',
    RIAL: 'ریال',
    TOMAN: 'تومان',
  };

  return `${formatted} ${labels[normalizedCurrency.toUpperCase()] || normalizedCurrency}`;
};

const formatDuration = (months: number): string => {
  const value = Number(months);
  if (!Number.isFinite(value) || value <= 0) return 'مدت نامشخص';
  return value === 1 ? '۱ ماه' : `${new Intl.NumberFormat('fa-IR').format(value)} ماه`;
};

const SubscriptionPlans: React.FC<SubscriptionPlansProps> = ({
  currentPlanId = null,
  onRenew,
}) => {
  const [plans, setPlans] = useState<SubscriptionPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [payingPlanId, setPayingPlanId] = useState<number | null>(null);
  const [paymentError, setPaymentError] = useState('');

  useEffect(() => {
    let cancelled = false;

    const loadPlans = async () => {
      setLoading(true);
      setError('');
      try {
        const rows = await profileService.getActiveSubscriptionPlans();
        if (!cancelled) setPlans(Array.isArray(rows) ? rows : []);
      } catch (err: any) {
        if (!cancelled) {
          setPlans([]);
          setError(err?.message || 'دریافت پلن‌های اشتراک ناموفق بود.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void loadPlans();
    return () => {
      cancelled = true;
    };
  }, []);

  const orderedPlans = useMemo(
    () => [...plans].sort((a, b) => Number(a.durationMonths) - Number(b.durationMonths)),
    [plans],
  );

  const handleRenew = async (plan: SubscriptionPlan) => {
    if (payingPlanId !== null) return;

    setPaymentError('');
    setPayingPlanId(Number(plan.id));
    onRenew?.(plan);

    try {
      const payment = await createSubscriptionPayment(Number(plan.id));
      window.location.assign(payment.redirectUrl);
    } catch (err: any) {
      setPaymentError(err?.message || 'ایجاد درخواست پرداخت ناموفق بود.');
      setPayingPlanId(null);
    }
  };

  if (loading) {
    return (
      <section className="mt-6 rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="h-6 w-6 animate-spin rounded-full border-2 border-current border-t-transparent" />
          <span className="text-sm text-gray-500 dark:text-gray-400">در حال دریافت پلن‌های فعال...</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-6 rounded-2xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/20">
        <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
      </section>
    );
  }

  if (orderedPlans.length === 0) {
    return (
      <section className="mt-6 rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-6 shadow-sm">
        <p className="text-sm text-gray-500 dark:text-gray-400">در حال حاضر پلن فعالی برای خرید وجود ندارد.</p>
      </section>
    );
  }

  return (
    <section className="mt-6" dir="rtl">
      <div className="mb-4">
        <h3 className="text-lg font-bold">پلن‌های فعال اشتراک</h3>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          همه پلن‌ها دسترسی کامل به امکانات نرم‌افزار دارند؛ تفاوت آن‌ها در مدت و قیمت اشتراک است.
        </p>
      </div>

      {paymentError && (
        <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/20 dark:text-red-300">
          {paymentError}
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {orderedPlans.map((plan) => {
          const isCurrent = currentPlanId != null && Number(plan.id) === Number(currentPlanId);
          const isPaying = payingPlanId === Number(plan.id);

          return (
            <article
              key={plan.id}
              className={`relative overflow-hidden rounded-2xl border p-5 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg ${
                isCurrent
                  ? 'border-green-500/60 ring-2 ring-green-500/10'
                  : 'border-[var(--card-border-color)]'
              }`}
              style={{ backgroundColor: 'var(--card-bg)', color: 'var(--card-color)' }}
            >
              {isCurrent && (
                <span className="absolute left-4 top-4 rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-bold text-green-700 dark:bg-green-900/40 dark:text-green-300">
                  پلن فعلی
                </span>
              )}

              <div className="mb-4 flex items-start justify-between gap-3">
                <div className="text-blue-600 dark:text-blue-400">
                  <PlanIcon durationMonths={Number(plan.durationMonths)} />
                </div>
                <div className="text-left">
                  <div className="text-xs text-gray-500 dark:text-gray-400">پلن اشتراک</div>
                  <h4 className="mt-1 text-lg font-bold">{plan.name}</h4>
                </div>
              </div>

              <div className="rounded-xl bg-gray-50 p-4 dark:bg-white/5">
                <div className="text-xs text-gray-500 dark:text-gray-400">مدت اشتراک</div>
                <div className="mt-1 text-base font-semibold">{formatDuration(plan.durationMonths)}</div>
                <div className="mt-3 border-t border-gray-200 pt-3 dark:border-white/10">
                  <div className="text-xs text-gray-500 dark:text-gray-400">قیمت</div>
                  <div className="mt-1 text-xl font-extrabold tracking-tight">
                    {formatPrice(plan.price, plan.currency)}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-xs text-gray-500 dark:text-gray-400">دسترسی کامل امکانات</span>
                <button
                  type="button"
                  disabled={payingPlanId !== null}
                  onClick={() => void handleRenew(plan)}
                  className="rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white transition hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500/40 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {isPaying ? 'در حال اتصال به درگاه...' : isCurrent ? 'تمدید اشتراک' : 'انتخاب و پرداخت'}
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
};

export default SubscriptionPlans;
