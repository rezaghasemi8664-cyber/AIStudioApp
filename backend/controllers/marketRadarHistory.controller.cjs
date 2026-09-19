'use strict';

const service = require('../services/marketRadarHistory.service.cjs');

function sanitize(value) {
  if (typeof value === 'bigint') return value.toString();
  if (Array.isArray(value)) return value.map(sanitize);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitize(item)]));
  return value;
}

exports.getHistory = async (req, res) => {
  try {
    const data = await service.getHistory(req.query?.range || '1d');
    return res.status(200).json({ success: true, data: sanitize(data), meta: { sourceType: 'db_market_summary', ai: false } });
  } catch (error) {
    const status = Number(error?.statusCode) === 400 ? 400 : 500;
    return res.status(status).json({ success: false, message: status === 400 ? 'بازه زمانی نامعتبر است.' : 'خطا در دریافت تاریخچه رادار بازار', error: error.message });
  }
};
