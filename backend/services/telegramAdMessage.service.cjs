'use strict';

const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule;
const { sendTelegramPhoto, sendTelegramMessage } = require('./telegramBotApi.service.cjs');
const { recordTelegramPublisherMessage, tehranParts, tehranDateKey } = require('./telegramPublisherSettings.service.cjs');

const SETTINGS_KEYS = Object.freeze({ ad: 'telegram.publisher.custom-ad.v1', membership: 'telegram.publisher.membership-message.v1', channel: 'telegram.publisher.channel-message.v1' });
const DEFAULT_TITLES = Object.freeze({ ad: 'پیام تبلیغات در کانال تلگرام رونیا', membership: 'پیام عضویت در کانال تلگرام رونیا', channel: 'ارسال پیام در کانال تلگرام رونیا' });
const MESSAGE_HISTORY_TYPES = Object.freeze({ ad: 'custom-ad', membership: 'membership-message', channel: 'channel-message' });
const STATE_KEYS = Object.freeze({ ad: 'telegram.publisher.custom-ad-state.v1', membership: 'telegram.publisher.membership-message-state.v1', channel: 'telegram.publisher.channel-message-state.v1' });
const TIMEZONE = 'Asia/Tehran';
const DAYS = ['Sat', 'Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function defaultSettings(type = 'ad') {
  return { title: DEFAULT_TITLES[type] || DEFAULT_TITLES.ad, enabled: false, text: '', imageDataUrl: '', days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'], times: ['10:00'], timezone: TIMEZONE };
}

function normalize(value, type = 'ad') {
  const src = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  const days = Array.isArray(src.days) ? [...new Set(src.days.map(String).filter(d => DAYS.includes(d)))] : defaultSettings().days;
  const times = Array.isArray(src.times) ? [...new Set(src.times.map(String).filter(t => /^([01]\d|2[0-3]):[0-5]\d$/.test(t)))].sort() : ['10:00'];
  const text = String(src.text || '').trim();
  const imageDataUrl = String(src.imageDataUrl || '');
  return { title: String(src.title || DEFAULT_TITLES[type] || DEFAULT_TITLES.ad).trim().slice(0, 100), enabled: src.enabled === true, text, imageDataUrl, days, times, timezone: TIMEZONE };
}

function validate(value, type = 'ad') {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('اطلاعات پیام تبلیغاتی نامعتبر است.');
  const data = normalize(value, type);
  if (!data.title) throw new Error('عنوان بخش را وارد کنید.');
  if (!data.text) throw new Error('متن پیام را وارد کنید.');
  if (data.text.length > (data.imageDataUrl ? 1024 : 4096)) throw new Error(data.imageDataUrl ? 'متن پیام همراه عکس حداکثر باید ۱۰۲۴ نویسه باشد.' : 'متن پیام بدون عکس حداکثر باید ۴۰۹۶ نویسه باشد.');
  if (data.imageDataUrl) {
    const match = data.imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
    if (!match) throw new Error('فرمت عکس معتبر نیست؛ فقط JPG، PNG یا WEBP مجاز است.');
    const bytes = Buffer.from(match[2], 'base64');
    if (!bytes.length || bytes.length > MAX_IMAGE_BYTES) throw new Error('حجم عکس باید حداکثر ۵ مگابایت باشد.');
  }
  if (value.enabled === true && (!data.days.length || !data.times.length)) throw new Error('برای زمان‌بندی انتشار، حداقل یک روز و یک ساعت انتخاب کنید.');
  if (Array.isArray(value.times) && value.times.some(t => !/^([01]\d|2[0-3]):[0-5]\d$/.test(String(t)))) throw new Error('یکی از ساعت‌های انتشار نامعتبر است.');
  if (Array.isArray(value.days) && value.days.some(d => !DAYS.includes(String(d)))) throw new Error('یکی از روزهای انتشار نامعتبر است.');
  return data;
}

async function readConfig(key, fallback) {
  const row = await prisma.appConfig.findUnique({ where: { key } });
  try { const parsed = JSON.parse(row?.value || 'null'); return parsed && typeof parsed === 'object' ? parsed : fallback; }
  catch (_) { return fallback; }
}
async function writeConfig(key, value) {
  const serialized = JSON.stringify(value);
  await prisma.appConfig.upsert({
    where: { key },
    create: { key, value: serialized },
    update: { value: serialized, updatedAt: new Date() }
  });
}
function resolveType(type = 'ad') {
  if (!Object.prototype.hasOwnProperty.call(SETTINGS_KEYS, type)) throw new Error('نوع پیام تلگرام نامعتبر است.');
  return type;
}
async function getSettings(type = 'ad') {
  const resolved = resolveType(type);
  return normalize(await readConfig(SETTINGS_KEYS[resolved], defaultSettings(resolved)), resolved);
}
async function saveSettings(value, type = 'ad') {
  const resolved = resolveType(type);
  const settings = validate(value, resolved);
  await writeConfig(SETTINGS_KEYS[resolved], settings);
  return settings;
}

function persianError(error) {
  const raw = String(error?.message || error || '');
  if (/TELEGRAM_NOT_CONFIGURED/.test(raw)) return 'اتصال ربات تلگرام تنظیم نشده است؛ توکن ربات و شناسه کانال را بررسی کنید.';
  if (/chat not found/i.test(raw)) return 'کانال تلگرام پیدا نشد؛ شناسه کانال را بررسی کنید و مطمئن شوید ربات عضو کانال است.';
  if (/not enough rights|have no rights|administrator rights/i.test(raw)) return 'ربات اجازه ارسال پیام در کانال را ندارد؛ ربات را مدیر کانال کنید و مجوز ارسال پیام را بدهید.';
  if (/bot was blocked|bot is not a member|user is deactivated/i.test(raw)) return 'ربات به کانال دسترسی ندارد یا از کانال حذف شده است.';
  if (/file is too big|file too large/i.test(raw)) return 'حجم عکس برای تلگرام بیش از حد مجاز است؛ عکس کوچک‌تری انتخاب کنید.';
  if (/caption is too long/i.test(raw)) return 'متن تبلیغاتی طولانی‌تر از محدودیت تلگرام برای کپشن عکس است.';
  if (/ETIMEDOUT|timeout|AbortError/i.test(raw)) return 'ارتباط با تلگرام بیش از حد طول کشید؛ اتصال سرور را بررسی و دوباره تلاش کنید.';
  if (/fetch failed|ECONNRESET|ENOTFOUND|EAI_AGAIN/i.test(raw)) return 'ارتباط سرور با تلگرام برقرار نشد؛ دسترسی اینترنت سرور به api.telegram.org را بررسی کنید.';
  if (/IMAGE_REQUIRED/.test(raw)) return 'لطفاً عکس تبلیغ را پیوست کنید.';
  return 'انتشار در تلگرام ناموفق بود. جزئیات فنی: ' + raw.replace(/^TELEGRAM_SEND_FAILED:\s*/, '').slice(0, 250);
}

async function publish(value, now = new Date(), source = 'manual', type = 'ad') {
  const resolved = resolveType(type);
  const settings = validate(value, resolved);
  const title = settings.text.split('\n')[0].slice(0, 180) || settings.title;
  try {
    let result;
    if (settings.imageDataUrl) {
      const match = settings.imageDataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/);
      result = await sendTelegramPhoto(Buffer.from(match[2], 'base64'), match[1], settings.text);
    } else {
      result = await sendTelegramMessage(settings.text);
    }
    try { await recordTelegramPublisherMessage(MESSAGE_HISTORY_TYPES[resolved], 'success', { messageTitle: title + (source === 'scheduled' ? ' (زمان‌بندی‌شده)' : '') }, now); } catch (_) {}
    return { success: true, message: 'پیام با موفقیت در کانال تلگرام رونیا منتشر شد.', messageId: result?.message_id || null };
  } catch (error) {
    const reason = persianError(error);
    try { await recordTelegramPublisherMessage(MESSAGE_HISTORY_TYPES[resolved], 'failure', { messageTitle: title, error: reason }, now); } catch (_) {}
    const wrapped = new Error(reason);
    wrapped.code = error?.code || 'TELEGRAM_AD_PUBLISH_FAILED';
    throw wrapped;
  }
}

async function publishScheduledIfDue(now = new Date(), type = 'ad') {
  const resolved = resolveType(type);
  const settings = await getSettings(resolved);
  const parts = tehranParts(now);
  if (!settings.enabled) return { skipped: true, reason: 'DISABLED_BY_ADMIN' };
  if (!settings.text) return { skipped: true, reason: 'AD_TEXT_MISSING' };
  if (!settings.days.includes(parts.weekday)) return { skipped: true, reason: 'WEEKDAY_NOT_ENABLED' };

  // Recover a scheduled ad if a tick/restart/database delay missed the exact
  // minute. Use the original scheduled time as the idempotency key.
  const currentMinutes = Number(parts.hour === '24' ? '0' : parts.hour) * 60 + Number(parts.minute);
  const dueTimes = settings.times
    .map(time => ({ time, minutes: Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5)) }))
    .filter(item => currentMinutes >= item.minutes && currentMinutes - item.minutes <= 5)
    .sort((a, b) => a.minutes - b.minutes);

  if (!dueTimes.length) return { skipped: true, reason: 'NO_SCHEDULED_AD_DUE' };
  const state = await readConfig(STATE_KEYS[resolved], { attempted: [] });
  const attempted = Array.isArray(state.attempted) ? state.attempted : [];
  const due = dueTimes.find(item => !attempted.includes(tehranDateKey(now) + '@' + item.time));
  if (!due) return { skipped: true, reason: 'ALREADY_ATTEMPTED' };

  const runKey = tehranDateKey(now) + '@' + due.time;
  try {
    const result = await publish(settings, now, 'scheduled', resolved);
    await writeConfig(STATE_KEYS[resolved], { attempted: [...attempted, runKey].slice(-1000) });
    return { ...result, scheduledTime: due.time, recoveredLateTick: due.time !== ((parts.hour === '24' ? '00' : parts.hour) + ':' + parts.minute) };
  } catch (error) {
    // Do not mark a failed attempt as complete; retry during the five-minute
    // grace window and preserve the failure in publication history.
    console.error('[TelegramPublisher][CustomAd] Scheduled send failed:', error.message);
    return { success: false, error: error.message, scheduledTime: due.time };
  }
}

module.exports = { SETTINGS_KEYS, STATE_KEYS, DEFAULT_TITLES, MESSAGE_HISTORY_TYPES, TIMEZONE, MAX_IMAGE_BYTES, defaultSettings, normalize, validate, getSettings, saveSettings, persianError, publish, publishScheduledIfDue };
