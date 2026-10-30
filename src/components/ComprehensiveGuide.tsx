import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { GUIDE_PAGES, type GuidePage } from '../data/comprehensiveGuide';
import { loadGuidePages } from '../services/comprehensiveGuideService';

const ComprehensiveGuide: React.FC = () => {
  const [pages, setPages] = useState<GuidePage[]>(GUIDE_PAGES);
  const [selectedId, setSelectedId] = useState(GUIDE_PAGES[0]?.id || 'dashboard');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  const selected = useMemo(() => pages.find(page => page.id === selectedId) || pages[0], [pages, selectedId]);
  const visiblePages = useMemo(() => {
    const query = search.trim().toLocaleLowerCase('fa');
    if (!query) return pages;
    return pages.filter(page => page.title.toLocaleLowerCase('fa').includes(query) ||
      page.sections.some(section => section.title.toLocaleLowerCase('fa').includes(query)));
  }, [pages, search]);
  const refresh = useCallback(async () => {
    setLoading(true);
    try { setPages(await loadGuidePages()); setError(''); }
    catch (e) { setError(e instanceof Error ? e.message : 'دریافت راهنما ناموفق بود.'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { void refresh(); }, [refresh]);

  if (!selected) return <div className="p-8 text-center text-gray-500">محتوای راهنما در دسترس نیست.</div>;
  return <div className="space-y-5" dir="rtl">
    <header className="rounded-3xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 sm:p-7">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><div className="text-xs font-bold tracking-wide text-cyan-600">RONIYA · USER GUIDE</div><h1 className="mt-2 text-2xl font-black">راهنمای جامع نرم‌افزار</h1><p className="mt-2 max-w-3xl text-sm leading-7 text-gray-500">راهنمای استفاده از امکانات، خواندن شاخص‌ها و تفسیر نمودارها. برای مشاهده راهنمای یک بخش، صفحه مربوط به آن را انتخاب کنید.</p></div>
        <button onClick={() => void refresh()} disabled={loading} className="rounded-xl border border-[var(--card-border-color)] px-4 py-2 text-sm font-semibold disabled:opacity-50">{loading ? 'در حال بروزرسانی…' : 'بروزرسانی راهنما'}</button>
      </div>
      <div className="mt-4"><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="جست‌وجوی نام تب یا کارت…" className="w-full rounded-xl border border-[var(--card-border-color)] bg-transparent px-4 py-3 text-sm outline-none focus:border-cyan-500"/></div>
    </header>
    {error && <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">{error} · محتوای پیش‌فرض نمایش داده می‌شود.</div>}
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[260px_minmax(0,1fr)]">
      <aside className="h-fit rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-3">
        <h2 className="px-3 py-2 text-sm font-black">صفحات راهنما</h2>
        <div className="max-h-[70vh] space-y-1 overflow-y-auto">{visiblePages.map(page=><button key={page.id} onClick={()=>setSelectedId(page.id)} className={`w-full rounded-xl px-3 py-3 text-right text-sm transition ${selectedId===page.id?'bg-cyan-50 font-bold text-cyan-800 dark:bg-cyan-950/40 dark:text-cyan-200':'hover:bg-gray-100 dark:hover:bg-gray-800'}`}><span className="block">{page.title}</span><span className="mt-1 block text-xs font-normal text-gray-500">{page.sections.length} بخش راهنما</span></button>)}
          {visiblePages.length===0 && <p className="p-3 text-sm text-gray-500">موردی پیدا نشد.</p>}
        </div>
      </aside>
      <article className="min-w-0 space-y-4">
        <div className="rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 sm:p-7">
          <div className="text-xs font-bold text-cyan-600">راهنمای بخش</div><h2 className="mt-2 text-2xl font-black">{selected.title}</h2><p className="mt-3 leading-8 text-gray-600 dark:text-gray-300">{selected.summary}</p>
          <div className="mt-5 flex flex-wrap gap-2">{selected.sections.map((section,index)=><a key={section.title} href={`#guide-section-${index}`} className="rounded-full border border-[var(--card-border-color)] px-3 py-1.5 text-xs hover:border-cyan-500">{section.title}</a>)}</div>
        </div>
        {selected.sections.map((section,index)=><section id={`guide-section-${index}`} key={section.title} className="scroll-mt-5 rounded-2xl border border-[var(--card-border-color)] bg-[var(--card-bg)] p-5 sm:p-6">
          <div className="flex items-start gap-3"><span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-cyan-50 font-black text-cyan-700 dark:bg-cyan-950/40 dark:text-cyan-300">{(index+1).toLocaleString('fa-IR')}</span><div className="min-w-0"><h3 className="text-lg font-black">{section.title}</h3><p className="mt-1 text-xs text-gray-500">راهنمای استفاده و تفسیر</p></div></div>
          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <GuideBlock title="کاربرد این بخش" text={section.purpose}/>
            <GuideBlock title="روش استفاده" text={section.usage}/>
            <GuideBlock title="تفسیر اطلاعات و ارقام" text={section.interpretation}/>
            <GuideBlock title="نکات و محدودیت‌ها" text={section.cautions} warning/>
          </div>
        </section>)}
        <p className="px-2 text-xs leading-6 text-gray-500">راهنما برای توضیح قابلیت‌هاست. اعداد و نتایج هر ماژول را همیشه همراه با منبع، تاریخ و وضعیت کفایت داده تفسیر کنید.</p>
      </article>
    </div>
  </div>;
};
const GuideBlock: React.FC<{title:string;text:string;warning?:boolean}> = ({title,text,warning}) => <div className={`rounded-xl p-4 ${warning?'bg-amber-50/80 dark:bg-amber-950/20':'bg-gray-50 dark:bg-gray-800/50'}`}><h4 className={`text-sm font-extrabold ${warning?'text-amber-800 dark:text-amber-300':'text-gray-800 dark:text-gray-100'}`}>{title}</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-7 text-gray-600 dark:text-gray-300">{text}</p></div>;
export default ComprehensiveGuide;
