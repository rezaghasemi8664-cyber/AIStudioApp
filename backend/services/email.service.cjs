'use strict';

const dns = require('dns').promises;
const nodemailer = require('nodemailer');

const FROM_NAME = process.env.SMTP_FROM_NAME || 'تحلیلگر هوشمند بورس رونیا';
const FROM_EMAIL = process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER;

let transporter = null;

function getTransporter() {
  if (transporter) return transporter;
  if (!process.env.SMTP_HOST || !process.env.SMTP_PORT || !process.env.SMTP_USER || !process.env.SMTP_PASS) {
    throw new Error('SMTP configuration is incomplete');
  }
  transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: String(process.env.SMTP_SECURE).toLowerCase() === 'true' || Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: Number(process.env.SMTP_CONNECTION_TIMEOUT || 10000),
    greetingTimeout: Number(process.env.SMTP_GREETING_TIMEOUT || 10000),
    socketTimeout: Number(process.env.SMTP_SOCKET_TIMEOUT || 15000),
  });
  return transporter;
}

function normalizeEmail(value) {
  return String(value || '').trim().toLowerCase();
}

function isValidEmailSyntax(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/i.test(email);
}

async function validateEmail(email) {
  const normalized = normalizeEmail(email);
  if (!isValidEmailSyntax(normalized)) return { valid: false, reason: 'invalid_syntax' };
  const domain = normalized.split('@')[1];
  try {
    const records = await dns.resolveMx(domain);
    if (!records || records.length === 0) return { valid: false, reason: 'no_mx' };
    records.sort((a, b) => a.priority - b.priority);
    return { valid: true, domain };
  } catch (error) {
    return { valid: false, reason: 'domain_unreachable', error: error.message };
  }
}

async function verifySmtp() {
  await getTransporter().verify();
  return true;
}

async function sendPasswordEmail(to, password, subject = 'اطلاعات ورود به تحلیلگر هوشمند بورس رونیا') {
  const email = normalizeEmail(to);
  const transport = getTransporter();
  return transport.sendMail({
    from: { name: FROM_NAME, address: FROM_EMAIL },
    to: email,
    subject,
    text: `کاربر گرامی،\n\nنام کاربری: ${email}\nکلمه عبور: ${password}\n\nلطفاً این اطلاعات را محرمانه نگه دارید.\n\nتحلیلگر هوشمند بورس رونیا`,
    html: `<!doctype html><html lang="fa" dir="rtl"><body style="font-family:Tahoma,Arial,sans-serif;line-height:2"><h2>${FROM_NAME}</h2><p>کاربر گرامی،</p><p>اطلاعات ورود شما:</p><p><strong>نام کاربری:</strong> ${email}</p><p><strong>کلمه عبور:</strong> <span style="font-family:monospace;font-size:18px">${password}</span></p><p>لطفاً این اطلاعات را محرمانه نگه دارید.</p><p>${FROM_NAME}</p></body></html>`,
  });
}

module.exports = { validateEmail, verifySmtp, sendPasswordEmail, normalizeEmail };
