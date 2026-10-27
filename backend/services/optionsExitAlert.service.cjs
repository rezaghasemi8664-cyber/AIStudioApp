'use strict';
const prisma = require('../config/prisma.cjs');
const BID_KEYS = ['bestBidPrice','pd1','pMeDem','bestBid','bidPrice','buyPrice'];
function number(value){if(typeof value==='number')return Number.isFinite(value)?value:null;if(typeof value!=='string')return null;const s=value.replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d))).replace(/[,٬\s]/g,'').trim();if(!s)return null;const n=Number(s);return Number.isFinite(n)?n:null;}
function first(row,keys){for(const key of keys){if(row&&row[key]!==undefined&&row[key]!==null&&row[key]!=='')return row[key];}return null;}
async function evaluateOptionExitAlerts(contracts){
 if(!Array.isArray(contracts)||!contracts.length)return {checked:0,triggered:0};
 const prefs=await prisma.userPreference.findMany({where:{key:'optionsPortfolio'},select:{id:true,userId:true,value:true}});
 const bySymbol=new Map();
 for(const contract of contracts){const symbol=String(first(contract,['l18','L18','symbol','Symbol','contractSymbol','ContractSymbol'])||'').trim().toUpperCase();const bid=number(first(contract,BID_KEYS));if(symbol&&bid>0)bySymbol.set(symbol,bid);}
 let checked=0,triggered=0;
 for(const pref of prefs){
  let items;try{items=JSON.parse(pref.value);}catch{continue;}if(!Array.isArray(items))continue;
  let changed=false;
  for(const item of items){
   if(!item||!item.exitAlertEnabled||item.exitAlertTriggered||!(Number(item.targetExitPrice)>0))continue;
   checked++;const bid=bySymbol.get(String(item.symbol||'').trim().toUpperCase());if(!(bid>=Number(item.targetExitPrice)))continue;
   await prisma.notification.create({data:{userId:pref.userId,title:'هشدار خروج آپشن: '+item.symbol,message:'بهترین قیمت تقاضا برای نماد '+item.symbol+' به '+bid.toLocaleString('en-US')+' رسیده و با قیمت هدف خروج '+Number(item.targetExitPrice).toLocaleString('en-US')+' برابر یا بالاتر است.',type:'option-exit-alert',isRead:false}});
   item.exitAlertTriggered=true;item.exitAlertTriggeredAt=new Date().toISOString();changed=true;triggered++;
  }
  if(changed)await prisma.userPreference.update({where:{id:pref.id},data:{value:JSON.stringify(items),updatedAt:new Date()}});
 }
 if(triggered)console.log('[OPTIONS EXIT ALERT] Triggered',triggered,'alerts');
 return {checked,triggered};
}
module.exports={evaluateOptionExitAlerts};
