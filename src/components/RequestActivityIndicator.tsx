import { useEffect, useState } from 'react';

/**
 * App-wide feedback for API requests initiated by any tab.
 * A short delay avoids flicker for fast requests and the counter supports
 * overlapping requests without hiding the indicator prematurely.
 */
export default function RequestActivityIndicator() {
  const [pending, setPending] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const start = () => setPending((value) => value + 1);
    const finish = () => setPending((value) => Math.max(0, value - 1));
    window.addEventListener('roniya:request-start', start);
    window.addEventListener('roniya:request-finish', finish);
    return () => {
      window.removeEventListener('roniya:request-start', start);
      window.removeEventListener('roniya:request-finish', finish);
    };
  }, []);

  useEffect(() => {
    if (pending === 0) {
      const hideTimer = window.setTimeout(() => setVisible(false), 180);
      return () => window.clearTimeout(hideTimer);
    }
    const showTimer = window.setTimeout(() => setVisible(true), 220);
    return () => window.clearTimeout(showTimer);
  }, [pending]);

  if (!visible) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 top-0 z-[10000] px-3 pt-2 sm:px-5"
      role="status"
      aria-live="polite"
      aria-label="در حال دریافت یا به‌روزرسانی اطلاعات"
    >
      <div className="mx-auto flex max-w-sm items-center gap-3 rounded-full border border-cyan-200/80 bg-white/95 px-4 py-2 shadow-lg shadow-cyan-900/10 backdrop-blur-md dark:border-cyan-800/70 dark:bg-slate-900/95">
        <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
          <span className="absolute h-5 w-5 animate-ping rounded-full bg-cyan-400/25" />
          <span className="h-3 w-3 animate-spin rounded-full border-2 border-cyan-500 border-t-transparent" />
        </span>
        <span className="text-xs font-medium text-slate-700 dark:text-slate-200">در حال دریافت و به‌روزرسانی اطلاعات…</span>
        <span className="ml-auto flex gap-1">
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-cyan-500 [animation-delay:-0.2s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-sky-500 [animation-delay:-0.1s]" />
          <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-blue-500" />
        </span>
      </div>
    </div>
  );
}
