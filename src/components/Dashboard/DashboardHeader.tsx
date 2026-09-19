import React from 'react';

interface DashboardHeaderProps { isMarketOpen: boolean; onRefresh: () => void; }

const DashboardHeader: React.FC<DashboardHeaderProps> = ({ isMarketOpen, onRefresh }) => (
  <header dir="rtl" className="dashboard-header workstation-header flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
    <div>
      <h1 className="text-2xl font-black text-[var(--color-text-primary)]">داشبورد بازار</h1>
      <p className="mt-1 text-sm text-slate-500">نمای کلی بازار، شاخص‌ها و وضعیت معاملات</p>
    </div>
    <div className="flex items-center gap-2">
      <span className="rounded-full bg-black/5 px-3 py-1 text-xs font-bold text-slate-500 dark:bg-white/5">{isMarketOpen ? 'بازار باز است' : 'بازار بسته است'}</span>
      <button type="button" onClick={onRefresh} className="rounded-xl border border-[var(--color-border)] px-3 py-2 text-sm font-bold text-[var(--color-text-primary)] hover:bg-black/5 dark:hover:bg-white/5">به‌روزرسانی</button>
    </div>
  </header>
);

export default DashboardHeader;
