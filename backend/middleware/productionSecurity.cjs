'use strict';
module.exports=function productionSecurity(req,res,next){
res.setHeader('X-Content-Type-Options','nosniff');
res.setHeader('X-Frame-Options','SAMEORIGIN');
res.setHeader('Referrer-Policy','strict-origin-when-cross-origin');
res.setHeader('Permissions-Policy','camera=(), microphone=(), geolocation=()');
if(req.path.startsWith('/api/'))res.setHeader('Cache-Control','no-store');
next();
};