'use strict';

const express = require('express');
const router = express.Router();
const brs = require('../services/brs.service.cjs');

function num(v){ const n=Number(v); return Number.isFinite(n)?n:null; }
function sma(rows, end, period){
  if(end + 1 < period) return null;
  let sum=0; for(let i=end-period+1;i<=end;i+=1){ const n=num(rows[i].close); if(n===null)return null; sum+=n; }
  return sum/period;
}
function runBacktest(rows, opts){
  const shortPeriod=Math.max(2, Math.floor(num(opts.shortPeriod)||10));
  const longPeriod=Math.max(shortPeriod+1, Math.floor(num(opts.longPeriod)||30));
  const initialCapital=Math.max(0, num(opts.initialCapital)||0);
  const feeRate=Math.max(0, num(opts.feePercent)||0);
  let cash=initialCapital, qty=0, entryPrice=null, entryDate=null, trades=[], closedTrades=[], equityCurve=[];
  for(let i=0;i<rows.length;i+=1){
    const close=num(rows[i].close); if(close===null) continue;
    const s=sma(rows,i,shortPeriod), l=sma(rows,i,longPeriod);
    const prevS=i>0?sma(rows,i-1,shortPeriod):null, prevL=i>0?sma(rows,i-1,longPeriod):null;
    const date=String(rows[i].date||rows[i].timestamp||'');
    if(qty===0 && s!==null&&l!==null&&prevS!==null&&prevL!==null&&prevS<=prevL&&s>l){
      const buyQty=Math.floor(cash/(close*(1+feeRate)));
      if(buyQty>0){const value=buyQty*close,fee=value*feeRate;cash-=value+fee;qty=buyQty;entryPrice=close;entryDate=date;trades.push({date,side:'BUY',price:close,quantity:buyQty,value,fee,reason:'SMA_GOLDEN_CROSS'});}
    } else if(qty>0&&s!==null&&l!==null&&prevS!==null&&prevL!==null&&prevS>=prevL&&s<l){
      const value=qty*close,fee=value*feeRate,net=(close-(entryPrice||close))*qty-fee-(entryPrice||close)*qty*feeRate;
      cash+=value-fee;closedTrades.push({entryDate,exitDate:date,quantity:qty,entryPrice,exitPrice:close,grossPnl:(close-(entryPrice||close))*qty,fees:fee+(entryPrice||close)*qty*feeRate,netPnl:net,returnPercent:entryPrice?((close-entryPrice)/entryPrice)*100:null});trades.push({date,side:'SELL',price:close,quantity:qty,value,fee,reason:'SMA_DEATH_CROSS'});qty=0;entryPrice=null;entryDate=null;
    }
    equityCurve.push({date,close,shortSma:s,longSma:l,equity:cash+qty*close});
  }
  const last=rows[rows.length-1], lastClose=last?num(last.close):null, finalValue=lastClose===null?cash:cash+qty*lastClose;
  const firstClose=rows.length?num(rows[0].close):null, lastReturn=firstClose&&lastClose?((lastClose/firstClose)-1)*100:null, ret=initialCapital?((finalValue/initialCapital)-1)*100:null;
  let peak=initialCapital,maxDrawdown=0; for(const p of equityCurve){peak=Math.max(peak,p.equity);if(peak>0)maxDrawdown=Math.min(maxDrawdown,((p.equity/peak)-1)*100);}
  const wins=closedTrades.filter(t=>t.netPnl>0), losses=closedTrades.filter(t=>t.netPnl<0); const grossWin=wins.reduce((s,t)=>s+t.netPnl,0),grossLoss=Math.abs(losses.reduce((s,t)=>s+t.netPnl,0));
  const returns=[]; for(let i=1;i<equityCurve.length;i+=1){const a=equityCurve[i-1].equity,b=equityCurve[i].equity;if(a>0)returns.push(b/a-1);}
  const mean=returns.length?returns.reduce((a,b)=>a+b,0)/returns.length:0; const variance=returns.length?returns.reduce((a,b)=>a+(b-mean)**2,0)/returns.length:0; const sharpe=variance>0?(mean/Math.sqrt(variance))*Math.sqrt(252):null;
  return {symbol:opts.symbol,strategy:{name:'SMA Crossover',shortPeriod,longPeriod,feePercent:feeRate*100},initialCapital,finalValue,returnPercent:ret,buyHoldReturnPercent:lastReturn,excessReturnPercent:ret!==null&&lastReturn!==null?ret-lastReturn:null,maxDrawdown,tradeCount:trades.length,closedTradeCount:closedTrades.length,winRate:closedTrades.length?wins.length/closedTrades.length*100:null,profitFactor:grossLoss?grossWin/grossLoss:null,averageClosedTradePnl:closedTrades.length?closedTrades.reduce((s,t)=>s+t.netPnl,0)/closedTrades.length:null,sharpe,openQuantity:qty,cash,closedTrades,trades,equityCurve,dataStatus:'LIVE',source:'BRS History API'};
}
router.post('/backtest',async(req,res,next)=>{try{const symbol=String(req.body?.symbol||'').trim();if(!symbol)return res.status(400).json({success:false,message:'symbol is required'});const limit=Math.min(1000,Math.max(60,Number(req.body?.historyCount)||180));const raw=await brs.getSymbolHistory(symbol,limit);const rows=Array.isArray(raw?.data)?raw.data:[];if(rows.length<35)return res.status(503).json({success:false,message:'داده تاریخی واقعی کافی برای بک‌تست در دسترس نیست.',dataStatus:'UNAVAILABLE'});const data=runBacktest(rows.slice().reverse(),{...req.body,symbol});return res.json({success:true,deterministic:true,data,meta:{status:'LIVE',source:'BRS History API',fetchedAt:raw?._meta?.fetchedAt||new Date().toISOString(),stale:false}});}catch(e){next(e);}});
router.post('/optimize',async(req,res,next)=>{try{const symbol=String(req.body?.symbol||'').trim();if(!symbol)return res.status(400).json({success:false,message:'symbol is required'});const raw=await brs.getSymbolHistory(symbol,300);const rows=Array.isArray(raw?.data)?raw.data.slice().reverse():[];if(rows.length<70)return res.status(503).json({success:false,message:'داده تاریخی واقعی کافی برای بهینه‌سازی در دسترس نیست.',dataStatus:'UNAVAILABLE'});const ranking=[];for(const s of (req.body?.shortPeriods||[5,10,15,20]))for(const l of (req.body?.longPeriods||[30,50,70]))if(Number(s)<Number(l))ranking.push(runBacktest(rows,{...req.body,symbol,shortPeriod:s,longPeriod:l}));ranking.sort((a,b)=>(b.sharpe??-Infinity)-(a.sharpe??-Infinity)||(b.returnPercent??-Infinity)-(a.returnPercent??-Infinity));return res.json({success:true,deterministic:true,data:{ranking:ranking.slice(0,20),note:'پارامترها فقط بر اساس داده تاریخی واقعی همین نماد بررسی شده‌اند.',dataStatus:'LIVE',source:'BRS History API'},meta:{status:'LIVE',source:'BRS History API',fetchedAt:raw?._meta?.fetchedAt||new Date().toISOString(),stale:false}});}catch(e){next(e);}});
module.exports=router;