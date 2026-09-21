export interface JalaliDate { year:number; month:number; day:number; }

function parts(date:Date):JalaliDate{
  const raw=new Intl.DateTimeFormat('en-US-u-ca-persian',{year:'numeric',month:'numeric',day:'numeric'}).formatToParts(date);
  const get=(type:string)=>Number(raw.find(x=>x.type===type)?.value||0);
  return {year:get('year'),month:get('month'),day:get('day')};
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
  const approx=new Date(target.year+621,2,21,12,0,0);
  for(let offset=-370;offset<=370;offset++){
    const d=new Date(approx);
    d.setDate(approx.getDate()+offset);
    const p=parts(d);
    if(p.year===target.year&&p.month===target.month&&p.day===target.day)return d;
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
