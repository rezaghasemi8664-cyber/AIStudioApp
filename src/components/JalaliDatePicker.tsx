import React, { useMemo, useState } from 'react';
import { JalaliDate, jalaliToGregorian } from '../utils/jalaliDate';

type Props = {
  value: JalaliDate | null;
  onChange: (value: JalaliDate) => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
};

const monthNames = ['فروردین','اردیبهشت','خرداد','تیر','مرداد','شهریور','مهر','آبان','آذر','دی','بهمن','اسفند'];
const weekDays = ['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنجشنبه','جمعه'];

function daysInMonth(year: number, month: number) {
  if (month <= 6) return 31;
  if (month <= 11) return 30;
  const firstNext = month === 12 ? jalaliToGregorian({ year: year + 1, month: 1, day: 1 }) : jalaliToGregorian({ year, month: month + 1, day: 1 });
  const first = jalaliToGregorian({ year, month, day: 1 });
  if (!first || !firstNext) return 29;
  return Math.round((firstNext.getTime() - first.getTime()) / 86400000);
}

function toPersianNumber(value: string | number) {
  return String(value).replace(/\d/g, d => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]);
}

function isSame(a: JalaliDate | null, b: JalaliDate) {
  return !!a && a.year === b.year && a.month === b.month && a.day === b.day;
}

export default function JalaliDatePicker({ value, onChange, placeholder = 'انتخاب تاریخ', disabled = false, className = '' }: Props) {
  const today = useMemo(() => {
    const raw = new Intl.DateTimeFormat('en-US-u-ca-persian', { year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(new Date());
    const get = (type: string) => Number(raw.find(x => x.type === type)?.value || 0);
    return { year: get('year'), month: get('month'), day: get('day') };
  }, []);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<JalaliDate>(value || today);

  const days = useMemo(() => {
    const count = daysInMonth(view.year, view.month);
    const first = jalaliToGregorian({ year: view.year, month: view.month, day: 1 });
    const jsDay = first?.getDay() ?? 6;
    const offset = (jsDay + 1) % 7;
    return { count, offset };
  }, [view]);

  const selectedText = value ? `${toPersianNumber(value.year)}/${toPersianNumber(String(value.month).padStart(2, '0'))}/${toPersianNumber(String(value.day).padStart(2, '0'))}` : '';

  const moveMonth = (delta: number) => {
    let year = view.year;
    let month = view.month + delta;
    if (month < 1) { month = 12; year -= 1; }
    if (month > 12) { month = 1; year += 1; }
    setView({ year, month, day: 1 });
  };

  const choose = (day: number) => {
    const next = { year: view.year, month: view.month, day };
    onChange(next);
    setOpen(false);
  };

  return (
    <div className="relative w-full" dir="rtl">
      <button type="button" disabled={disabled} onClick={() => { if (!open && value) setView(value); setOpen(v => !v); }} className={`w-full text-right border rounded px-3 py-2 bg-white dark:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer ${className}`}>
        {selectedText || placeholder}
      </button>
      {open && !disabled && (
        <div className="absolute z-[100] mt-2 w-[320px] max-w-[90vw] rounded-xl border border-gray-200 bg-white p-3 shadow-2xl dark:border-gray-700 dark:bg-gray-800">
          <div className="flex items-center justify-between mb-3">
            <button type="button" onClick={() => moveMonth(1)} className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="ماه بعد">‹</button>
            <strong>{monthNames[view.month - 1]} {toPersianNumber(view.year)}</strong>
            <button type="button" onClick={() => moveMonth(-1)} className="px-2 py-1 rounded hover:bg-gray-100 dark:hover:bg-gray-700" aria-label="ماه قبل">›</button>
          </div>
          <div className="grid grid-cols-7 gap-1 text-center text-xs text-gray-500 mb-1">
            {weekDays.map(day => <span key={day}>{day.slice(0, 1)}</span>)}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {Array.from({ length: days.offset }).map((_, i) => <span key={`e-${i}`} />)}
            {Array.from({ length: days.count }, (_, i) => i + 1).map(day => {
              const date = { year: view.year, month: view.month, day };
              const selected = isSame(value, date);
              const current = isSame(today, date);
              return <button key={day} type="button" onClick={() => choose(day)} className={`h-9 rounded-lg text-sm hover:bg-cyan-100 dark:hover:bg-cyan-900/40 ${selected ? 'bg-cyan-600 text-white hover:bg-cyan-600' : current ? 'ring-1 ring-cyan-500 font-bold' : ''}`}>{toPersianNumber(day)}</button>;
            })}
          </div>
          <button type="button" onClick={() => { onChange(today); setView(today); setOpen(false); }} className="mt-3 w-full rounded-lg py-1.5 text-sm text-cyan-700 hover:bg-cyan-50 dark:text-cyan-300 dark:hover:bg-cyan-900/30">امروز</button>
        </div>
      )}
    </div>
  );
}
