'use strict';

const { defaultSettings, normalize, validate, persianError, DEFAULT_TITLES } = require('../services/telegramAdMessage.service.cjs');

describe('Telegram ad message settings', () => {
  const image = 'data:image/png;base64,' + Buffer.from('sample-image').toString('base64');

  test('defaults to disabled with Tehran weekday and time schedule', () => {
    expect(defaultSettings()).toMatchObject({
      enabled: false, timezone: 'Asia/Tehran', title: DEFAULT_TITLES.ad,
      days: ['Sat', 'Sun', 'Mon', 'Tue', 'Wed'], times: ['10:00']
    });
  });

  test('normalizes unique valid days and multiple Tehran times', () => {
    const result = normalize({ days: ['Sat', 'Sat', 'Fri', 'bad'], times: ['15:30', '09:00', '15:30', '25:00'] });
    expect(result.days).toEqual(['Sat', 'Fri']);
    expect(result.times).toEqual(['09:00', '15:30']);
  });

  test('allows text-only publication and keeps image optional', () => {
    expect(validate({ text: 'آگهی' }).imageDataUrl).toBe('');
    expect(validate({ text: 'آگهی', imageDataUrl: image }).text).toBe('آگهی');
    expect(validate({ enabled: true, text: 'آگهی', days: ['Sat'], times: ['10:00'] }).enabled).toBe(true);
  });

  test('supports independent defaults and editable names for all message sections', () => {
    expect(defaultSettings('membership').title).toBe('پیام عضویت در کانال تلگرام رونیا');
    expect(defaultSettings('channel').title).toBe('ارسال پیام در کانال تلگرام رونیا');
    expect(validate({ title: 'عنوان جدید', text: 'پیام' }, 'channel').title).toBe('عنوان جدید');
  });

  test('uses Telegram text limits according to whether an image is attached', () => {
    expect(() => validate({ text: 'ا'.repeat(4097) })).toThrow('۴۰۹۶');
    expect(() => validate({ text: 'ا'.repeat(1025), imageDataUrl: image })).toThrow('۱۰۲۴');
    expect(validate({ text: 'ا'.repeat(4096) }).text).toHaveLength(4096);
  });

  test('rejects invalid image formats, oversized images and invalid schedules', () => {
    expect(() => validate({ text: 'آگهی', imageDataUrl: 'data:text/plain;base64,QQ==' })).toThrow('فرمت عکس');
    const large = 'data:image/png;base64,' + Buffer.alloc(5 * 1024 * 1024 + 1).toString('base64');
    expect(() => validate({ text: 'آگهی', imageDataUrl: large })).toThrow('۵ مگابایت');
    expect(() => validate({ enabled: true, text: 'آگهی', imageDataUrl: image, days: [], times: [] })).toThrow('حداقل یک روز');
  });

  test('returns actionable Persian Telegram error messages', () => {
    expect(persianError(new Error('TELEGRAM_NOT_CONFIGURED'))).toContain('توکن ربات');
    expect(persianError(new Error('TELEGRAM_SEND_FAILED: not enough rights to send photos'))).toContain('مدیر کانال');
    expect(persianError(new Error('TELEGRAM_SEND_FAILED: chat not found'))).toContain('شناسه کانال');
  });
});
