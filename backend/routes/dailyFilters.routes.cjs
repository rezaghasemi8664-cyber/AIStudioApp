'use strict';
const express=require('express');
const router=express.Router();
const service=require('../services/dailyFilters.service.cjs');
router.get('/',async function(req,res){try{const force=String(req.query.force||'')==='1';res.json(await service.getFilters(force));}catch(e){console.error('[DAILY-FILTERS]',e);res.status(503).json({success:false,message:e.message||'سرویس فیلترهای روزانه در دسترس نیست.'});}});
module.exports=router;
