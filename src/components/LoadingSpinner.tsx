import React from 'react';

const LoadingSpinner: React.FC = () => (
  <div
    className="roniya-loading-spinner flex min-h-[240px] w-full flex-col items-center justify-center gap-5 px-4 py-10 text-center"
    role="status"
    aria-live="polite"
    aria-label="در حال بارگذاری"
  >
    <div className="relative flex h-16 w-16 items-center justify-center">
      <div className="absolute inset-0 rounded-full border-4 border-cyan-100 dark:border-cyan-950" />
      <div className="absolute inset-0 animate-spin rounded-full border-4 border-transparent border-t-cyan-500 border-l-sky-400" />
      <div className="h-7 w-7 animate-pulse rounded-full bg-gradient-to-br from-cyan-400 to-blue-600 shadow-lg shadow-cyan-500/25" />
    </div>
    <div className="space-y-2">
      <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">در حال آماده‌سازی بخش</p>
      <p className="text-xs text-slate-500 dark:text-slate-400">لطفاً تا تکمیل بارگذاری کمی صبر کنید</p>
    </div>
    <div className="h-1.5 w-44 max-w-[70vw] overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
      <div className="h-full w-2/5 animate-[roniya-loading-progress_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-500 via-sky-400 to-blue-500" />
    </div>
    <style>{`
      @keyframes roniya-loading-progress {
        0% { transform: translateX(250%); }
        100% { transform: translateX(-350%); }
      }
    `}</style>
  </div>
);

export default LoadingSpinner;
