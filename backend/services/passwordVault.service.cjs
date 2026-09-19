'use strict';
const crypto = require('crypto');
function getKey(){
  const raw=process.env.PASSWORD_VAULT_KEY || process.env.JWT_SECRET;
  if(!raw) throw new Error('PASSWORD_VAULT_KEY is not configured');
  return crypto.createHash('sha256').update(raw).digest();
}
function encryptPassword(password){
  const iv=crypto.randomBytes(12); const cipher=crypto.createCipheriv('aes-256-gcm',getKey(),iv);
  const encrypted=Buffer.concat([cipher.update(String(password),'utf8'),cipher.final()]);
  return [iv.toString('base64'),cipher.getAuthTag().toString('base64'),encrypted.toString('base64')].join('.');
}
function decryptPassword(value){
  if(!value) return null;
  const [ivB64,tagB64,dataB64]=String(value).split('.');
  if(!ivB64||!tagB64||!dataB64) return null;
  const decipher=crypto.createDecipheriv('aes-256-gcm',getKey(),Buffer.from(ivB64,'base64'));
  decipher.setAuthTag(Buffer.from(tagB64,'base64'));
  return Buffer.concat([decipher.update(Buffer.from(dataB64,'base64')),decipher.final()]).toString('utf8');
}
module.exports={encryptPassword,decryptPassword};
