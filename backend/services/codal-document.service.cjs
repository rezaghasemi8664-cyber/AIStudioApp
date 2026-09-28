'use strict';
const zlib = require('zlib');
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
function envNumber(name,fallback,min,max){const v=Number(process.env[name]);return Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;}
function normalizeDigits(v){return String(v??'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));}
function normalizeText(v){return normalizeDigits(v).replace(/[\u200c\u200f\u200e]/g,' ').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();}
function normalizeMetricLabel(v){return normalizeText(v).toLowerCase().replace(/[()\[\]{}،,؛:٫٬–—-]/g,' ').replace(/\s+/g,' ').trim();}
function parseNumber(v){
  if(typeof v==='number'&&Number.isFinite(v))return v;
  const t=normalizeDigits(v).replace(/\s+/g,'').replace(/[٪%]/g,'').replace(/[−–—]/g,'-').trim();
  if(!t||t==='-'||t==='—')return null;
  if(/^[-+]?\(?\d{1,4}[\\/.-]\d{1,2}[\\/.-]\d{1,4}\)?$/.test(t))return null;
  if(/^[-+]?\(?\d{1,4}:\d{1,2}(?::\d{1,2})?\)?$/.test(t))return null;
  // CODAL may use the Arabic decimal separator (٫). Preserve it instead
  // of stripping it as punctuation; thousands separators are still removed.
  const decimalNormalized=t.replace(/٫/g,'.');
  const compact=decimalNormalized.replace(/[٬،,]/g,'');
  const neg=/^\(.*\)$/.test(compact)||compact.startsWith('-');
  const c=compact.replace(/[()]/g,'').replace(/[^0-9.+-]/g,'');
  if(!c||c==='-'||c==='.')return null;
  const n=Number(c);
  return Number.isFinite(n)?(neg?-Math.abs(n):n):null;
}
function extractExcelRows(buffer){if(buffer.slice(0,4).toString('hex')!=='504b0304')return parseHtmlWorkbook(buffer);const entries=extractZipEntries(buffer),shared=parseSharedStrings(entries.has('xl/sharedStrings.xml')?entries.get('xl/sharedStrings.xml').toString('utf8'):''),sheets=[];for(const [name,content] of entries){if(!/^xl\/worksheets\/sheet\d+\.xml$/i.test(name))continue;sheets.push({name,rows:parseWorksheet(content.toString('utf8'),shared).slice(0,2000)});}return sheets.sort((a,b)=>a.name.localeCompare(b.name));}
const METRIC_PATTERNS={
  revenue:['جمع درآمدهای عملیاتی','جمع درآمد عملیاتی','درآمدهای عملیاتی','درآمد عملیاتی','درآمد حاصل از فروش','درآمد فروش','فروش خالص','فروش','درآمد','operating revenue','revenue','sales'],
  operatingProfit:['سود (زیان) عملیاتی','سود زیان عملیاتی','سود و زیان عملیاتی','سود عملیاتی','سود عملیات','operating profit','operating income'],
  netProfit:['سود (زیان) خالص','سود زیان خالص','سود و زیان خالص','سود (زیان) خالص عملیات در حال تداوم','سود زیان خالص عملیات در حال تداوم','سود خالص سال','سود خالص','سود (زیان) دوره','net profit','net income'],
  assets:['جمع دارایی ها','جمع داراییها','جمع دارایی','دارایی های کل','داراییهای کل','جمع دارایی‌های غیرجاری و جاری','دارایی','total assets','assets'],
  liabilities:['جمع بدهی ها','جمع بدهیها','جمع بدهی','بدهی های کل','بدهیهای کل','جمع بدهی‌ها','بدهی','total liabilities','liabilities'],
  equity:['جمع حقوق مالکانه','حقوق صاحبان سهام','حقوق مالکانه','جمع حقوق صاحبان سهام','حقوق صاحبان سرمایه','حقوق مالکانه و بدهی','total equity','equity','shareholders equity'],
  cash:['موجودی نقد','وجه نقد','نقد و معادل نقد','موجودی نقد و بانک','cash and cash equivalents'],
  eps:['سود (زیان) خالص هر سهم','سود زیان خالص هر سهم','سود و زیان خالص هر سهم','سود پایه هر سهم','سود هر سهم','سود (زیان) هر سهم','eps','earnings per share']
};
const METRIC_PRIORITY={
  assets:['جمع دارایی ها','جمع داراییها','جمع دارایی','دارایی های کل','داراییهای کل','total assets','assets'],
  liabilities:['جمع بدهی ها','جمع بدهیها','جمع بدهی','بدهی های کل','بدهیهای کل','جمع بدهی‌ها','total liabilities','liabilities'],
  equity:['جمع حقوق مالکانه','حقوق صاحبان سهام','حقوق مالکانه','جمع حقوق صاحبان سهام','حقوق صاحبان سرمایه','total equity','equity'],
  revenue:['درآمدهای عملیاتی','درآمد عملیاتی','درآمد حاصل از فروش','درآمد فروش','فروش','درآمد','operating revenue','revenue','sales'],
  operatingProfit:['سود زیان عملیاتی','سود و زیان عملیاتی','سود عملیاتی','سود عملیات','operating profit','operating income'],
  netProfit:['سود زیان خالص','سود و زیان خالص','سود خالص','سود (زیان) دوره','net profit','net income'],
  eps:['سود پایه هر سهم','سود زیان خالص هر سهم','سود و زیان خالص هر سهم','سود هر سهم','eps','earnings per share'],
  cash:['موجودی نقد','وجه نقد','نقد و معادل نقد','موجودی نقد و بانک','cash and cash equivalents']
};
function metricPriority(metric,label){
  const normalized=normalizeMetricLabel(label);
  const patterns=METRIC_PRIORITY[metric]||[];
  const index=patterns.findIndex(p=>normalized===normalizeMetricLabel(p));
  if(index>=0)return 100-index;
  return patterns.some(p=>normalized.includes(normalizeMetricLabel(p)))?50:10;
}
function numericCandidates(cells,start,direction){
  const out=[];
  const step=direction>0?1:-1;
  for(let i=start+step,distance=1;i>=0&&i<cells.length&&distance<=10;i+=step,distance++){
    const raw=normalizeText(cells[i]);
    const value=parseNumber(raw);
    if(value===null)continue;
    const compact=normalizeDigits(raw).replace(/[٬،,\s]/g,'');
    const isYear=/^[-+]?(?:1[0-5]\d{2}|19\d{2}|20\d{2}|21\d{2})$/.test(compact);
    const isSmallPeriod=/^[-+]?\d{1,2}$/.test(compact)&&Math.abs(value)<=12;
    let score=100-distance*8;
    if(isYear)score-=80;
    if(isSmallPeriod)score-=30;
    if(/[.]/.test(compact))score+=4;
    if(/ریال|میلیون|هزار|درصد|%/i.test(raw))score+=12;
    out.push({value,distance,score,isYear,isSmallPeriod,raw,index:i});
  }
  return out.sort((a,b)=>b.score-a.score);
}
function embeddedNumber(label){
  const text=normalizeText(label);
  const match=text.match(/(?:^|\s)([-+]?\(?\s*[۰-۹٠-٩0-9][۰-۹٠-٩0-9٬،,.]*\s*\)?)(?:\s*(?:ریال|میلیون|هزار|درصد|%))?\s*$/);
  return match?parseNumber(match[1]):null;
}
function findMetricValues(sheets){
  const best={};
  const currentPeriodHints=['دوره جاری','سال مالی جاری','جاری','current period','current year'];
  const comparisonPeriodHints=['دوره مشابه','سال مالی مشابه','دوره قبل','سال قبل','سال مالی قبل','comparative','prior period','previous year'];

  const columnHintScore=(rows,rowIndex,columnIndex)=>{
    let score=0;
    // Inspect the same column as the candidate, not the whole header row.
    // This prevents a "current period" label in one column from boosting
    // every numeric value in the row equally.
    for(let r=Math.max(0,rowIndex-6);r<rowIndex;r++){
      const row=rows[r]||[];
      const text=normalizeText(row[columnIndex]||'');
      if(!text)continue;
      const normalized=normalizeMetricLabel(text);
      if(currentPeriodHints.some(h=>normalized.includes(normalizeMetricLabel(h))))score+=32;
      if(comparisonPeriodHints.some(h=>normalized.includes(normalizeMetricLabel(h))))score-=30;
    }
    return score;
  };

  for(const sheet of sheets){
    const rows=sheet.rows||[];
    for(let rowIndex=0;rowIndex<rows.length;rowIndex++){
      const rawRow=rows[rowIndex];
      const cells=(rawRow||[]).map(normalizeText);
      const normalizedCells=cells.map(normalizeMetricLabel);
      for(let i=0;i<cells.length;i++){
        const label=cells[i],normalizedLabel=normalizedCells[i];
        if(!normalizedLabel)continue;
        for(const [metric,patterns] of Object.entries(METRIC_PATTERNS)){
          if(!patterns.some(p=>{const pNorm=normalizeMetricLabel(p);return normalizedLabel===pNorm||normalizedLabel.includes(pNorm);}))continue;
          let candidates=numericCandidates(cells,i,1);
          if(!candidates.length)candidates=numericCandidates(cells,i,-1);
          // A standalone year/date is never itself a financial value. Small period
          // numbers are strongly penalized, while header-aware scoring below
          // selects the intended current-period column when several numeric
          // periods are present.
          candidates=candidates.filter(candidate=>!candidate.isYear);
          candidates=candidates.map(candidate=>({
            ...candidate,
            score:candidate.score+columnHintScore(rows,rowIndex,candidate.index)
          })).sort((a,b)=>b.score-a.score);
          if(!candidates.length){
            const embedded=embeddedNumber(label);
            if(embedded!==null)candidates=[{value:embedded,distance:0,score:72,isYear:false,isSmallPeriod:false,index:i}];
          }
          if(!candidates.length)continue;
          const chosen=candidates[0];
          const priority=metricPriority(metric,label);
          const confidence=Math.max(0,Math.min(100,chosen.score+(priority-50)*0.35));
          const candidate={value:chosen.value,sheet:sheet.name,label,priority,distance:chosen.distance,confidence,isYear:Boolean(chosen.isYear),isSmallPeriod:Boolean(chosen.isSmallPeriod)};
          if(!best[metric]||candidate.confidence>best[metric].confidence)best[metric]=candidate;
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(best).map(([k,v])=>[k,{value:v.value,sheet:v.sheet,label:v.label,confidence:v.confidence,priority:v.priority,distance:v.distance}]));
}
async function extractFinancialDataFromExcel(rawUrl){const downloaded=await downloadDocument(rawUrl);if(!looksLikeExcel(downloaded.contentType,downloaded.finalUrl,downloaded.buffer))throw new Error('CODAL attachment is not recognized as an Excel document');const sheets=extractExcelRows(downloaded.buffer);return{sourceType:'excel',url:downloaded.finalUrl,bytes:downloaded.bytes,sheetCount:sheets.length,metrics:findMetricValues(sheets)};}
async function extractFinancialDataFromAnnouncement(announcement){
  const candidates=[];
  const addCandidate=(url,type)=>{const value=String(url||'').trim();if(value&&!candidates.some(x=>x.url===value))candidates.push({url:value,type});};
  addCandidate(announcement&&(announcement.link_excel||announcement.linkExcel),'excel');
  addCandidate(announcement&&(announcement.linkAttachment||announcement.link_attachment),'attachment');
  addCandidate(announcement&&(announcement.link||announcement.url||announcement.link_report||announcement.linkReport),'report');
  addCandidate(announcement&&(announcement.linkPdf||announcement.link_pdf),'report');
  const failures=[];
  const extracted=[];

  for(const candidate of candidates){
    try{
      const downloaded=await downloadDocument(candidate.url);
      const head=downloaded.buffer.slice(0,4096).toString('utf8');
      const isHtml=/text\/html|application\/html/i.test(downloaded.contentType)||/<(?:html|table|tr|td|th)\b/i.test(head);
      if(candidate.type==='report'&&!isHtml&&!looksLikeExcel(downloaded.contentType,downloaded.finalUrl,downloaded.buffer)){
        throw new Error('CODAL report response is not a readable HTML/Excel document');
      }
      const sheets=extractExcelRows(downloaded.buffer);
      const metrics=findMetricValues(sheets);
      if(Object.keys(metrics).length>0){
        extracted.push({
          sourceType:isHtml?'codal-html-report':'excel',
          url:downloaded.finalUrl,
          bytes:downloaded.bytes,
          sheetCount:sheets.length,
          metrics,
          reason:candidate.type==='excel'?'استخراج مستقیم از فایل مالی CODAL انجام شد.':'استخراج از سند مالی CODAL انجام شد.'
        });
      } else {
        failures.push('استخراج '+candidate.type+' انجام شد اما شاخص عددی پیدا نشد.');
      }
    }catch(error){
      failures.push('استخراج '+candidate.type+': '+error.message);
    }
  }

  if(extracted.length){
    // Keep all successful sources so the caller can merge complementary
    // metrics from Excel and HTML instead of stopping at the first hit.
    const merged={};
    extracted.forEach((item, sourceIndex)=>{
      for(const [metric,value] of Object.entries(item.metrics||{})){
        if(!value||!Number.isFinite(Number(value.value)))continue;
        const confidence=Number(value.confidence);
        const rank=(Number.isFinite(confidence)?confidence:0)+Math.max(0,10-sourceIndex);
        const current=merged[metric];
        if(current&&Number(current.selectionRank)>=rank)continue;
        merged[metric]={
          ...value,
          sourceUrl:item.url,
          sourceType:item.sourceType,
          sourceIndex,
          selectionRank:rank
        };
      }
    });
    return {
      available:true,
      sourceType:extracted.length===1?extracted[0].sourceType:'codal-financial-merged',
      url:extracted[0].url,
      bytes:extracted.reduce((sum,item)=>sum+(Number(item.bytes)||0),0),
      sheetCount:extracted.reduce((sum,item)=>sum+(Number(item.sheetCount)||0),0),
      metrics:merged,
      reason:'استخراج و تجمیع داده‌های معتبر از اسناد مالی CODAL انجام شد.'
    };
  }

  return {
    available:false,
    sourceType:candidates[0]?.type||null,
    reason:failures.join(' ')||'هیچ سند مالی قابل دریافت از CODAL در دسترس نیست.',
    metrics:{}
  };
}
module.exports={normalizeDigits,normalizeText,normalizeMetricLabel,parseNumber,validateDocumentUrl,downloadDocument,extractZipEntries,extractExcelRows,findMetricValues,extractFinancialDataFromExcel,extractFinancialDataFromAnnouncement};
