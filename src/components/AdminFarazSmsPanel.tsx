import React, { useState } from 'react';

const FARAZ_ADMIN_URL = '/faraz-sms/wp-admin/';

const AdminFarazSmsPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  const reloadPanel = () => {
    setError(false);
    setLoading(true);
    setReloadKey((value) => value + 1);
  };

  return (
    <section
      className="flex h-full min-h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] shadow-sm"
      dir="rtl"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[var(--card-border-color)] px-4 py-3">
        <div>
          <h2 className="font-bold">مدیریت پیامک فراز اس‌ام‌اس</h2>
          <p className="mt-1 text-xs text-gray-500">پنل اصلی WordPress و افزونه Faraz SMS</p>
        </div>
        <button
          type="button"
          onClick={reloadPanel}
          className="rounded-xl border border-[var(--card-border-color)] px-4 py-2 text-sm font-semibold transition hover:bg-gray-50 dark:hover:bg-gray-800/60"
        >
          بازنشانی پنل
        </button>
      </div>

      {error && (
        <div className="shrink-0 border-b border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-300">
          بارگذاری پنل اصلی فراز اس‌ام‌اس با مشکل مواجه شد. لطفاً پنل را دوباره بارگذاری کنید.
        </div>
      )}

      <div className="relative min-h-0 flex-1 bg-white dark:bg-gray-950">
        {loading && (
          <div className="absolute inset-0 z-10 flex items-center justify-center bg-[var(--card-bg)]/95 backdrop-blur-sm">
            <div className="text-center">
              <div className="mx-auto h-8 w-8 animate-spin rounded-full border-2 border-cyan-600 border-t-transparent" />
              <p className="mt-3 text-sm text-gray-500">در حال بارگذاری پنل اصلی فراز اس‌ام‌اس…</p>
            </div>
          </div>
        )}

        <iframe
          key={reloadKey}
          title="پنل اصلی Faraz SMS"
          src={FARAZ_ADMIN_URL}
          className="block h-full min-h-[calc(100vh-12rem)] w-full border-0 bg-white"
          loading="eager"
          referrerPolicy="same-origin"
          onLoad={() => {
            setLoading(false);
            setError(false);
          }}
          onError={() => {
            setLoading(false);
            setError(true);
          }}
        />
      </div>
    </section>
  );
};

export default AdminFarazSmsPanel;
