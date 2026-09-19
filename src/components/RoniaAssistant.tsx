import React, { useState } from 'react';
import { appApiFetch } from '../services/apiConfigService';

interface RoniaAssistantProps { isOnline: boolean; onNavigate?: (tab: string) => void; }
interface AssistantAction { label: string; tab: string; symbol?: string; }
interface AssistantRow {
  symbol: string; currentPrice: number | null; closingPrice: number | null; priceChangePercent: number | null;
  technicalScore: number | null; fundamentalScore: number | null; totalScore: number | null;
  trend: string; riskLevel: string; pe: number | null; eps: number | null;
  tradedVolume: number | null; tradedValue: number | null; netMoneyFlow: number | null;
  realMoneyFlow: number | null; legalMoneyFlow: number | null; monthlyReturnPercent?: number | null; qualityText?: string;
}
interface AssistantResult { title?: string; answer: string; type?: string; actions?: AssistantAction[]; rows?: AssistantRow[]; row?: AssistantRow; failed?: any[]; }

const n = (v: any, digits = 0) => v == null || !Number.isFinite(Number(v)) ? '—' : Number(v).toLocaleString('fa-IR', { maximumFractionDigits: digits });
const p = (v: any) => v == null || !Number.isFinite(Number(v)) ? '—' : `${n(v, 2)}٪`;

const RoniaAssistant: React.FC<RoniaAssistantProps> = ({ isOnline, onNavigate }) => {
  const [message, setMessage] = useState('');
  const [history, setHistory] = useState<Array<{ role: 'user' | 'assistant'; text: string }>>([]);
  const [lastResult, setLastResult] = useState<AssistantResult | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (event?: React.FormEvent) => {
    event?.preventDefault();
    const text = message.trim();
    if (!text || !isOnline || loading) return;
    setHistory(items => [...items, { role: 'user', text }]);
    setMessage(''); setLoading(true);
    try {
      const response = await appApiFetch<any>('/ronia-assistant/query', { method: 'POST', body: JSON.stringify({ message: text }) });
      const result: AssistantResult = response?.data?.data ?? response?.data ?? response;
      setLastResult(result);
      setHistory(items => [...items, { role: 'assistant', text: result?.answer || 'پاسخی برای درخواست پیدا نشد.' }]);
    } catch (error: any) {
      setLastResult(null);
      setHistory(items => [...items, { role: 'assistant', text: error?.message || 'دریافت پاسخ ناموفق بود.' }]);
    } finally { setLoading(false); }
  };

  const examples = ['قیمت فملی چیست؟', 'امتیاز فملی', 'جریان پول فولاد', 'ریسک شپنا', 'بازده یک ماه فملی', 'کیفیت داده فملی', 'فملی و فولاد را مقایسه کن'];

  return (
    <div className="roniya-assistant-workstation max-w-6xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h2 className="text-2xl font-black text-cyan-600 dark:text-cyan-400">دستیار رونیا</h2>
        <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">دستیار قطعی و داده‌محور؛ بدون Gemini، بدون AI و بدون داده ساختگی.</p>
      </div>
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/60 p-5 shadow-sm">
        <div className="flex flex-wrap gap-2 mb-5">{examples.map(example => <button key={example} type="button" onClick={() => setMessage(example)} className="px-3 py-2 rounded-full border border-slate-200 dark:border-slate-700 text-xs hover:bg-slate-100 dark:hover:bg-slate-800">{example}</button>)}</div>
        <form onSubmit={submit} className="flex gap-2"><input value={message} onChange={e => setMessage(e.target.value)} placeholder="سؤال خود را درباره یک یا چند نماد وارد کنید..." className="flex-1 rounded-xl border border-slate-300 dark:border-slate-600 bg-transparent px-4 py-3 outline-none focus:ring-2 focus:ring-cyan-500" /><button disabled={!isOnline || loading || !message.trim()} className="rounded-xl bg-cyan-600 text-white px-5 font-bold disabled:opacity-50">{loading ? '...' : 'پرسش'}</button></form>

        <div className="mt-5 space-y-3 min-h-32">
          {!history.length && <div className="text-center text-sm text-slate-400 py-10">نمونه سؤال را انتخاب کنید یا نام نماد را بنویسید.</div>}
          {history.map((item, index) => <div key={index} className={item.role === 'user' ? 'mr-8 rounded-xl bg-cyan-50 dark:bg-cyan-950/30 p-4' : 'ml-8 rounded-xl bg-slate-50 dark:bg-slate-800/60 p-4'}><div className="text-xs text-slate-500 mb-1">{item.role === 'user' ? 'شما' : 'دستیار رونیا'}</div><div className="text-sm leading-7">{item.text}</div></div>)}
        </div>

        {lastResult?.row && <div className="mt-5 grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            ['قیمت پایانی', n(lastResult.row.closingPrice)], ['تغییر روزانه', p(lastResult.row.priceChangePercent)],
            ['امتیاز کل', n(lastResult.row.totalScore)], ['P/E', n(lastResult.row.pe, 2)],
            ['جریان پول', n(lastResult.row.netMoneyFlow)], ['بازده یک‌ماهه', p(lastResult.row.monthlyReturnPercent)],
            ['ریسک', lastResult.row.riskLevel || '—'], ['روند', lastResult.row.trend || '—'],
          ].map(([label, value]) => <div key={label} className="rounded-xl border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900/40"><div className="text-xs text-slate-500">{label}</div><div className="font-black mt-1">{value}</div></div>)}
          <div className="col-span-2 md:col-span-4 text-xs text-slate-500">{lastResult.row.qualityText}</div>
        </div>}

        {lastResult?.rows && lastResult.rows.length > 1 && <div className="mt-5 overflow-x-auto rounded-xl border border-slate-200 dark:border-slate-700">
          <table className="w-full text-sm"><thead><tr className="bg-slate-100 dark:bg-slate-800"><th className="p-2">نماد</th><th className="p-2">قیمت پایانی</th><th className="p-2">تغییر</th><th className="p-2">امتیاز کل</th><th className="p-2">P/E</th><th className="p-2">جریان پول</th><th className="p-2">بازده ماه</th><th className="p-2">ریسک</th></tr></thead><tbody>{lastResult.rows.map(row => <tr key={row.symbol} className="border-t border-slate-100 dark:border-slate-800"><td className="p-2 font-bold">{row.symbol}</td><td className="p-2">{n(row.closingPrice)}</td><td className="p-2">{p(row.priceChangePercent)}</td><td className="p-2">{n(row.totalScore)}</td><td className="p-2">{n(row.pe, 2)}</td><td className="p-2">{n(row.netMoneyFlow)}</td><td className="p-2">{p(row.monthlyReturnPercent)}</td><td className="p-2">{row.riskLevel || '—'}</td></tr>)}</tbody></table>
        </div>}

        {lastResult?.failed?.length ? <div className="mt-4 text-xs text-amber-600">برخی نمادها قابل پردازش نبودند: {lastResult.failed.map(item => item.symbol || item).join('، ')}</div> : null}
        {lastResult?.actions?.length ? <div className="mt-5 pt-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap gap-2">{lastResult.actions.map((action, index) => <button key={index} type="button" onClick={() => onNavigate?.(action.tab)} className="px-3 py-2 rounded-lg border text-xs font-bold hover:bg-slate-100 dark:hover:bg-slate-800">{action.label}</button>)}</div> : null}
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3 text-xs text-slate-500"><div className="rounded-xl border p-3">بدون Gemini / AI</div><div className="rounded-xl border p-3">بدون داده ساختگی</div><div className="rounded-xl border p-3">محاسبات و قوانین قابل ردیابی</div></div>
    </div>
  );
};

export default RoniaAssistant;
