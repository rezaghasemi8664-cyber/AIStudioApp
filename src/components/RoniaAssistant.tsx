import React, { useState } from 'react';
import { appApiFetch } from '../services/apiConfigService';

interface RoniaAssistantProps {
  isOnline: boolean;
  onNavigate?: (tab: string) => void;
}

interface AssistantResult {
  title?: string;
  answer: string;
  type?: string;
  actions?: Array<{ label: string; tab: string; symbol?: string }>;
  rows?: Array<any>;
  row?: any;
  failed?: Array<any>;
}

const n = (v: any, digits = 0) =>
  v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('fa-IR', { maximumFractionDigits: digits });

const RoniaAssistant: React.FC<RoniaAssistantProps> = ({ isOnline, onNavigate }) => {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [loading, setLoading] = useState(false);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = message.trim();
    if (!text || !isOnline || loading) return;
    setHistory(items => [...items, { role: 'user', text }]);
    setMessage('');
    setLoading(true);
    try {
      const response = await appApiFetch<any>('/ronia-assistant/query', {
        method: 'POST',
        body: JSON.stringify({ message: text }),
      });
      const result: AssistantResult = response?.data?.data ?? response?.data ?? response;
      setHistory(items => [...items, { role: 'assistant', text: result?.answer || 'پاسخی برای درخواست پیدا نشد.' }]);
    } catch (error: any) {
      setHistory(items => [...items, { role: 'assistant', text: error?.message || 'دریافت پاسخ ناموفق بود.' }]);
    } finally {
      setLoading(false);
    }
  };

  const examples = ['قیمت فملی چیست؟', 'امتیاز فملی', 'جریان پول فولاد', 'ریسک شپنا', 'فملی و فولاد را مقایسه کن'];

  return (
    <div className="max-w-5xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-cyan-600 dark:text-cyan-400">دستیار رونیا</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">دستیار داده‌محور و قطعی؛ پاسخ‌ها فقط از داده‌های واقعی و قوانین داخلی نرم‌افزار ساخته می‌شوند و وابستگی به Gemini یا AI ندارند.</p>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-5 shadow-sm">
        <div className="flex flex-wrap gap-2 mb-5">
          {examples.map(example => <button key={example} type="button" onClick={() => setMessage(example)} className="px-3 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-100 dark:hover:bg-slate-800">{example}</button>)}
        </div>

        <form onSubmit={submit} className="flex gap-2">
          <input value={message} onChange={e => setMessage(e.target.value)} placeholder="سؤال خود را درباره یک یا چند نماد وارد کنید..." className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-500" />
          <button disabled={!isOnline || loading || !message.trim()} className="rounded-xl bg-cyan-600 text-white px-5 font-bold disabled:opacity-50">{loading ? '...' : 'پرسش'}</button>
        </form>

        <div className="mt-5 space-y-3 min-h-32">
          {!history.length && <div className="text-center text-sm text-slate-400 py-10">نمونه سؤال را انتخاب کنید یا نام نماد را بنویسید.</div>}
          {history.map((item, index) => (
            <div key={index} className={item.role === 'user' ? 'mr-8 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 p-4' : 'ml-8 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4'}>
              <div className="text-xs text-slate-500 mb-1">{item.role === 'user' ? 'شما' : 'دستیار رونیا'}</div>
              <div className="text-sm leading-7">{item.text}</div>
            </div>
          ))}
        </div>

        {history.length > 0 && <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2">
          <button type="button" onClick={() => onNavigate?.('comparison')} className="px-3 py-2 rounded-lg bg-slate-900 text-white dark:bg-white dark:text-slate-900 text-xs font-bold">باز کردن مقایسه</button>
          <button type="button" onClick={() => onNavigate?.('marketRadar')} className="px-3 py-2 rounded-lg border text-xs font-bold">رادار بازار</button>
        </div>}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-500">
        <div className="rounded-xl border p-3">بدون Gemini / AI</div>
        <div className="rounded-xl border p-3">بدون داده ساختگی</div>
        <div className="rounded-xl border p-3">محاسبات و قوانین قابل ردیابی</div>
      </div>
    </div>
  );
};

export default RoniaAssistant;
