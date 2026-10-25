import React, { useMemo, useState } from 'react';

type Candle = { date:string; time?:string; open:number|null; high:number|null; low:number|null; close:number|null; volume:number|null };

interface Props { data:Candle[]; }
const fmt=(v:number|null)=>v==null?'—':v.toLocaleString('fa-IR',{maximumFractionDigits:2});

const StockProfileCandles:React.FC<Props>=({data})=>{
 const valid=useMemo(()=>data.filter(c=>c.open!=null&&c.high!=null&&c.low!=null&&c.close!=null),[data]);
 if(valid.length<2)return <div className="stock-candles-chart rounded-2xl border border-dashed border-[var(--color-border)] p-8 text-center text-gray-500">داده کندلی معتبر کافی برای این بازه موجود نیست.</div>;
 const visible=valid.slice(-90), [selectedIndex,setSelectedIndex]=useState(-1), width=1000,height=360,left=56,right=18,top=20,bottom=48;
 const prices=visible.flatMap(c=>[c.high as number,c.low as number]);
 const min=Math.min(...prices),max=Math.max(...prices),range=max-min||1;
 const xStep=(width-left-right)/Math.max(visible.length-1,1), bodyWidth=Math.max(3,Math.min(10,xStep*.55));
 const y=(price:number)=>top+((max-price)/range)*(height-top-bottom), selected=visible[selectedIndex<0?visible.length-1:Math.min(selectedIndex,visible.length-1)];
 return <div className="stock-candles-chart rounded-2xl border border-[var(--color-border)] bg-white/80 dark:bg-gray-900/60 p-4">
  <div className="flex items-center justify-between mb-3"><div className="font-black">نمودار کندلی</div><div className="text-xs text-gray-500">{visible.length} کندل واقعی</div></div>
  <div className="overflow-x-auto"><svg viewBox={`0 0 ${width} ${height}`} className="w-full min-w-[720px] h-[360px]" role="img" aria-label="نمودار کندلی واقعی">
   {[0,1,2,3,4].map(i=>{const py=top+(i/4)*(height-top-bottom);const pv=max-(i/4)*range;return <g key={i}><line x1={left} x2={width-right} y1={py} y2={py} stroke="currentColor" opacity=".08"/><text x={left-8} y={py+4} textAnchor="end" fontSize="11" fill="currentColor" opacity=".55">{fmt(pv)}</text></g>})}
   {visible.map((c,i)=>{const cx=left+i*xStep, open=c.open as number,close=c.close as number,high=c.high as number,low=c.low as number;const up=close>=open,bodyY=y(Math.max(open,close)),bodyH=Math.max(2,Math.abs(y(open)-y(close)));return <g key={`${c.date}-${i}`} onClick={()=>setSelectedIndex(i)} role="button" tabIndex={0} aria-label={`${c.date} قیمت پایانی ${fmt(c.close)}`} style={{cursor:'pointer'}} onKeyDown={event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();setSelectedIndex(i)}}}><line x1={cx} x2={cx} y1={y(high)} y2={y(low)} stroke="currentColor" strokeWidth="1.5"/><rect x={cx-bodyWidth/2} y={bodyY} width={bodyWidth} height={bodyH} fill="currentColor" opacity={i===(selectedIndex<0?visible.length-1:selectedIndex)?1:up?.8:.35} rx="1"/></g>})}
   <line x1={left} x2={width-right} y1={height-bottom} y2={height-bottom} stroke="currentColor" opacity=".15"/>
   <text x={left} y={height-18} fontSize="11" fill="currentColor" opacity=".55">{visible[0].date||'—'}</text><text x={width-right} y={height-18} textAnchor="end" fontSize="11" fill="currentColor" opacity=".55">{visible[visible.length-1].date||'—'}</text>
  </svg></div>
  <div className="mt-3 rounded-xl border border-cyan-200 dark:border-cyan-900 bg-cyan-50 dark:bg-cyan-950/30 p-3" aria-live="polite"><div className="text-xs text-gray-500 mb-2">نقطه انتخاب‌شده — برای نمایش اطلاعات هر کندل روی آن کلیک یا لمس کنید.</div><div className="grid grid-cols-2 md:grid-cols-5 gap-2 text-xs"><span>تاریخ: <b>{selected.date||'—'}</b></span><span>باز: <b>{fmt(selected.open)}</b></span><span>بیشینه: <b>{fmt(selected.high)}</b></span><span>کمینه: <b>{fmt(selected.low)}</b></span><span>پایانی: <b>{fmt(selected.close)}</b></span></div></div>
 </div>;
};
export default StockProfileCandles;
