'use strict';
const zlib = require('zlib');
const DEFAULT_TIMEOUT_MS = 20000;
const DEFAULT_MAX_BYTES = 8 * 1024 * 1024;
function envNumber(name,fallback,min,max){const v=Number(process.env[name]);return Number.isFinite(v)?Math.min(max,Math.max(min,v)):fallback;}
function normalizeDigits(v){return String(v??'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));}
function normalizeText(v){return normalizeDigits(v).replace(/[\u200c\u200f\u200e]/g,' ').replace(/[يى]/g,'ی').replace(/ك/g,'ک').replace(/ة/g,'ه').replace(/\s+/g,' ').trim();}
function normalizeMetricLabel(v){return normalizeText(v).toLowerCase().replace(/[()\[\]{}،,؛:٫٬–—-]/g,' ').replace(/\s+/g,' ').trim();}
function parseNumber(v){if(typeof v==='number'&&Number.isFinite(v))return v;const t=normalizeDigits(v).replace(/[٬،,]/g,'').replace(/\s+/g,'').replace(/[٪%]/g,'').trim();if(!t||t==='-'||t==='—')return null;const neg=/^\(.*\)$/.test(t)||t.startsWith('-');const c=t.replace(/[()]/g,'').replace(/[^0-9.+-]/g,'');if(!c||c==='-'||c==='.')return null;const n=Number(c);return Number.isFinite(n)?(neg?-Math.abs(n):n):null;}
function getAllowedHosts(){return String(process.env.CODAL_DOCUMENT_ALLOWED_HOSTS||'').split(',').map(x=>x.trim().toLowerCase()).filter(Boolean);}
function validateDocumentUrl(raw){if(!raw)return{ok:false,reason:'empty-url'};let url;try{url=new URL(raw,'https://www.codal.ir/');}catch{return{ok:false,reason:'invalid-url'};}if(url.username||url.password)return{ok:false,reason:'credentials-not-allowed'};if(url.protocol!=='https:')return{ok:false,reason:'https-required'};const allowed=getAllowedHosts();if(allowed.length&&!allowed.includes(url.hostname.toLowerCase()))return{ok:false,reason:'host-not-allowed'};return{ok:true,url};}
async function downloadDocument(raw){const validation=validateDocumentUrl(raw);if(!validation.ok)throw new Error(`CODAL document URL rejected: ${validation.reason}`);const timeoutMs=envNumber('CODAL_DOCUMENT_TIMEOUT_MS',DEFAULT_TIMEOUT_MS,3000,60000),maxBytes=envNumber('CODAL_DOCUMENT_MAX_BYTES',DEFAULT_MAX_BYTES,256*1024,32*1024*1024),controller=new AbortController(),timer=setTimeout(()=>controller.abort(),timeoutMs);try{const relayBase=String(process.env.CODAL_DOCUMENT_RELAY_URL||'').trim();let requestUrl=validation.url.toString();if(relayBase){const relayUrl=new URL(relayBase);relayUrl.searchParams.set('url',validation.url.toString());requestUrl=relayUrl.toString();}const response=await fetch(requestUrl,{method:'GET',redirect:'follow',signal:controller.signal,headers:{Accept:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/octet-stream;q=0.8,*/*;q=0.1','User-Agent':'RoniyaAnalyzer/5.2.1'}});if(!response.ok)throw new Error(`CODAL document HTTP ${response.status}`);const length=Number(response.headers.get('content-length'));if(Number.isFinite(length)&&length>maxBytes)throw new Error(`CODAL document exceeds ${maxBytes} bytes`);const chunks=[];let total=0;for await(const chunk of response.body){total+=chunk.length;if(total>maxBytes)throw new Error(`CODAL document exceeds ${maxBytes} bytes`);chunks.push(Buffer.from(chunk));}const buffer=Buffer.concat(chunks);return{buffer,contentType:String(response.headers.get('content-type')||'').toLowerCase(),finalUrl:response.url,bytes:buffer.length};}finally{clearTimeout(timer);}}
function looksLikeExcel(contentType,url,buffer){const type=String(contentType||'').toLowerCase();const target=String(url||'');const head=buffer&&Buffer.isBuffer(buffer)?buffer.slice(0,512).toString('utf8').replace(/^\uFEFF/,'').trimStart():'';return /spreadsheet|excel|vnd\.ms-excel|officedocument\.spreadsheet|application\/octet-stream|text\/html/.test(type)||/\.(xlsx|xls)(?:$|[?#])/i.test(target)||head.startsWith('<html')||head.includes('<table')||head.startsWith('<!doctype');}
function findEndOfCentralDirectory(buffer){const start=Math.max(0,buffer.length-65557);for(let o=buffer.length-22;o>=start;o--)if(buffer.readUInt32LE(o)===0x06054b50)return o;throw new Error('Invalid XLSX ZIP: end of central directory not found');}
function extractZipEntries(buffer){const e=findEndOfCentralDirectory(buffer),count=buffer.readUInt16LE(e+10),size=buffer.readUInt32LE(e+12),offset=buffer.readUInt32LE(e+16),entries=new Map();let cursor=offset;const end=offset+size;for(let i=0;i<count&&cursor<end;i++){if(buffer.readUInt32LE(cursor)!==0x02014b50)throw new Error('Invalid XLSX ZIP: central directory entry not found');const method=buffer.readUInt16LE(cursor+10),cs=buffer.readUInt32LE(cursor+20),us=buffer.readUInt32LE(cursor+24),nl=buffer.readUInt16LE(cursor+28),el=buffer.readUInt16LE(cursor+30),cl=buffer.readUInt16LE(cursor+32),lo=buffer.readUInt32LE(cursor+42),name=buffer.slice(cursor+46,cursor+46+nl).toString('utf8');if(cs>32*1024*1024||us>64*1024*1024)throw new Error('XLSX entry exceeds safety limits');const lnl=buffer.readUInt16LE(lo+26),lel=buffer.readUInt16LE(lo+28),dataStart=lo+30+lnl+lel,compressed=buffer.slice(dataStart,dataStart+cs);let content;if(method===0)content=compressed;else if(method===8)content=zlib.inflateRawSync(compressed);else throw new Error(`Unsupported XLSX compression method: ${method}`);if(content.length!==us)throw new Error(`Invalid XLSX entry size for ${name}`);entries.set(name,content);cursor+=46+nl+el+cl;}return entries;}
function decodeXml(v){return String(v||'').replace(/&#(x[0-9a-f]+|[0-9]+);/gi,(_,c)=>{const n=c.toLowerCase().startsWith('x')?parseInt(c.slice(1),16):parseInt(c,10);return Number.isFinite(n)?String.fromCodePoint(n):'';}).replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");}
function attr(tag,name){const m=String(tag||'').match(new RegExp(`${name}=["']([^"']*)["']`,'i'));return m?decodeXml(m[1]):null;}
function parseSharedStrings(xml){if(!xml)return[];return[...xml.matchAll(/<si\b[\s\S]*?<\/si>/g)].map(m=>[...m[0].matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map(x=>decodeXml(x[1])).join(''));}
function columnIndex(column){let r=0;for(const ch of String(column||'').toUpperCase()){if(ch<'A'||ch>'Z')continue;r=r*26+ch.charCodeAt(0)-64;}return Math.max(0,r-1);}
function parseWorksheet(xml,shared){const rows=[];for(const rm of String(xml||'').matchAll(/<row\b([^>]*)>([\s\S]*?)<\/row>/g)){const rn=Number(attr(rm[1],'r'))||rows.length+1,row=[];for(const cm of rm[2].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)){const a=cm[1],body=cm[2],ref=attr(a,'r')||'',idx=columnIndex(ref.replace(/[0-9]/g,'')),type=attr(a,'t'),vm=body.match(/<v\b[^>]*>([\s\S]*?)<\/v>/),im=body.match(/<is\b[\s\S]*?<t\b[^>]*>([\s\S]*?)<\/t>[\s\S]*?<\/is>/);let value=vm?decodeXml(vm[1]):null;if(type==='s'&&value!==null){const si=Number(value);value=Number.isInteger(si)?(shared[si]||''):'';}else if(type==='inlineStr')value=im?decodeXml(im[1]):'';else if(value!==null){const n=parseNumber(value);if(n!==null)value=n;}row[idx]=value;}rows[rn-1]=row;}return rows.filter(Array.isArray);}
function stripHtml(v){return decodeXml(String(v||'').replace(/<!--[\s\S]*?-->/g,' ').replace(/<script\b[\s\S]*?<\/script>/gi,' ').replace(/<style\b[\s\S]*?<\/style>/gi,' ').replace(/<br\s*\/?>/gi,' ').replace(/<[^>]+>/g,' '));}
function parseHtmlWorkbook(buffer){
  let html=buffer.toString('utf8').replace(/^\uFEFF/,'');
  html=html.replace(/\\u003c/gi,'<').replace(/\\u003e/gi,'>').replace(/\\u0022/gi,'"').replace(/\\u0027/gi,"'").replace(/\\\//g,'/');
  html=decodeXml(html);
  if(!/<(?:html|table|tr|td|th)\b/i.test(html))throw new Error('Unsupported CODAL HTML/Excel document format');
  const rows=[];
  for(const rm of html.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
    const cells=[...rm[1].matchAll(/<(?:td|th)\b[^>]*>([\s\S]*?)<\/(?:td|th)>/gi)].map(x=>normalizeText(stripHtml(x[1])));
    if(cells.length)rows.push(cells);
  }
  if(!rows.length){
    const text=normalizeText(stripHtml(html));
    if(text)rows.push(text.split(/\s{2,}/).filter(Boolean));
  }
  if(!rows.length)throw new Error('CODAL document contains no readable financial rows');
  return[{name:'codal-html-workbook',rows:rows.slice(0,10000)}];
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
  for(let i=start+step, distance=1;i>=0&&i<cells.length&&distance<=10;i+=step,distance++){
    const value=parseNumber(cells[i]);
    if(value!==null)out.push({value,distance});
  }
  return out;
}
function embeddedNumber(label){
  const text=normalizeText(label);
  const match=text.match(/(?:^|\s)([-+]?\(?\s*[۰-۹٠-٩0-9][۰-۹٠-٩0-9٬،,.]*\s*\)?)(?:\s*(?:ریال|میلیون|هزار|درصد|%))?\s*$/);
  return match?parseNumber(match[1]):null;
}
function findMetricValues(sheets){
  const best={};
  for(const sheet of sheets){
    for(const rawRow of sheet.rows||[]){
      const cells=(rawRow||[]).map(normalizeText);
      const normalizedCells=cells.map(normalizeMetricLabel);
      for(let i=0;i<cells.length;i++){
        const label=cells[i], normalizedLabel=normalizedCells[i];
        if(!normalizedLabel)continue;
        for(const [metric,patterns] of Object.entries(METRIC_PATTERNS)){
          if(!patterns.some(p=>{
            const pNorm=normalizeMetricLabel(p);
            return normalizedLabel===pNorm || normalizedLabel.includes(pNorm);
          }))continue;
          let candidates=numericCandidates(cells,i,1);
          if(!candidates.length)candidates=numericCandidates(cells,i,-1);
          if(!candidates.length){
            const embedded=embeddedNumber(label);
            if(embedded!==null)candidates=[{value:embedded,distance:0}];
          }
          if(!candidates.length)continue;
          const candidate={value:candidates[0].value,sheet:sheet.name,label,priority:metricPriority(metric,label),distance:candidates[0].distance};
          if(!best[metric]||candidate.priority>best[metric].priority||(candidate.priority===best[metric].priority&&candidate.distance<best[metric].distance))best[metric]=candidate;
        }
      }
    }
  }
  return Object.fromEntries(Object.entries(best).map(([k,v])=>[k,{value:v.value,sheet:v.sheet,label:v.label}]));
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
        return {
          available:true,
          sourceType:isHtml?'codal-html-report':'excel',
          url:downloaded.finalUrl,
          bytes:downloaded.bytes,
          sheetCount:sheets.length,
          metrics,
          reason:candidate.type==='excel'?'استخراج مستقیم از فایل مالی CODAL انجام شد.':'استخراج از سند مالی CODAL انجام شد.'
        };
      }
      failures.push('استخراج '+candidate.type+' انجام شد اما شاخص عددی پیدا نشد.');
    }catch(error){
      failures.push('استخراج '+candidate.type+': '+error.message);
    }
  }

  return {
    available:false,
    sourceType:candidates[0]?.type||null,
    reason:failures.join(' ')||'هیچ سند مالی قابل دریافت از CODAL در دسترس نیست.',
    metrics:{}
  };
}
module.exports={normalizeDigits,normalizeText,normalizeMetricLabel,parseNumber,validateDocumentUrl,downloadDocument,extractZipEntries,extractExcelRows,findMetricValues,extractFinancialDataFromExcel,extractFinancialDataFromAnnouncement};
