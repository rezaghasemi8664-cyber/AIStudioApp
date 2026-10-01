export interface JalaliDate { year:number; month:number; day:number; }

const PERSIAN_FORMATTER = new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric',timeZone:'UTC'});
const PERSIAN_PARTS_CACHE = new Map<number, JalaliDate>();
function parts(date:Date):JalaliDate{
  const key=Math.trunc(date.getTime()/86400000);
  const cached=PERSIAN_PARTS_CACHE.get(key);
  if(cached)return cached;
  const raw=PERSIAN_FORMATTER.formatToParts(date);
  const get=(type:string)=>Number(raw.find(x=>x.type===type)?.value||0);
  const result={year:get('year'),month:get('month'),day:get('day')};
  PERSIAN_PARTS_CACHE.set(key,result);
  return result;
}

export function gregorianToJalali(date:Date|string|null|undefined):JalaliDate|null{
  if(!date)return null;
  const d=new Date(date);
  if(Number.isNaN(d.getTime()))return null;
  return parts(d);
}

export function jalaliToGregorian(value:JalaliDate|null):Date|null{
  if(!value)return null;
  const target={year:Number(value.year),month:Number(value.month),day:Number(value.day)};
  if(!target.year||target.month<1||target.month>12||target.day<1||target.day>31)return null;
  const approxMs=Date.UTC(target.year+621,2,21,12,0,0);
  let lo=approxMs-370*86400000, hi=approxMs+370*86400000;
  while(lo<=hi){
    const mid=lo+Math.floor((hi-lo)/(2*86400000))*86400000;
    const d=new Date(mid), p=parts(d);
    const cmp=p.year!==target.year?p.year-target.year:p.month!==target.month?p.month-target.month:p.day-target.day;
    if(cmp===0)return d;
    if(cmp<0)lo=mid+86400000; else hi=mid-86400000;
  }
  return null;
}

export function jalaliToIso(value:JalaliDate|null):string|null{
  const d=jalaliToGregorian(value);
  return d?d.toISOString().slice(0,10):null;
}

export function isoToJalali(value:string|null|undefined):JalaliDate|null{
  return gregorianToJalali(value);
}
