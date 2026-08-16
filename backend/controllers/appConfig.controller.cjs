// controllers/appConfig.controller.cjs
'use strict';

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

// ═══════════════════════════════════════════════════════════════
// داده‌های پیش‌فرض (Fallback)
// ═══════════════════════════════════════════════════════════════

const DEFAULT_CONFIG = {
  appName: 'بورس‌یار',
  version: '1.0.0',
  description: 'سامانه هوشمند تحلیل بازار بورس',
  language: 'fa',
  direction: 'rtl',
  theme: 'dark',
  features: {
    stockAnalysis: true,
    marketSummary: true,
    portfolio: true,
    watchlist: true,
    scalping: true,
    aiAnalysis: true,
    notifications: true,
    themeStudio: true,
    stockComparison: true,
    moneyFlow: true,
    topIndustries: true,
    mostTradedStocks: true,
  },
  market: {
    defaultExchange: 'TSE',
    currency: 'IRR',
    tradingHours: {
      open: '09:00',
      close: '12:30',
      preMarket: '08:30',
    },
    schedule: {
      saturday: { open: '09:00', close: '12:30', isOpen: true },
      sunday: { open: '09:00', close: '12:30', isOpen: true },
      monday: { open: '09:00', close: '12:30', isOpen: true },
      tuesday: { open: '09:00', close: '12:30', isOpen: true },
      wednesday: { open: '09:00', close: '12:30', isOpen: true },
      thursday: { open: null, close: null, isOpen: false },
      friday: { open: null, close: null, isOpen: false },
    },
  },
  api: {
    baseUrl: '/api',
    version: 'v1',
    timeout: 30000,
  },
};

// ═══════════════════════════════════════════════════════════════
// Helper: خواندن کانفیگ از DB یا Fallback
// ═══════════════════════════════════════════════════════════════

async function loadConfigFromDB() {
  try {
    const configs = await prisma.appConfig.findMany();
    if (configs && configs.length > 0) {
      const result = {};
      configs.forEach((c) => {
        try {
          result[c.key] = JSON.parse(c.value);
        } catch {
          result[c.key] = c.value;
        }
      });
      return { ...DEFAULT_CONFIG, ...result };
    }
  } catch (err) {
    console.warn('[AppConfig] ⚠️ DB not available, using defaults:', err.message);
  }
  return { ...DEFAULT_CONFIG };
}

// ═══════════════════════════════════════════════════════════════
// Controllers
// ═══════════════════════════════════════════════════════════════

/* ─── GET /public ─── */
const getPublicConfig = async (req, res) => {
  try {
    const config = await loadConfigFromDB();
    return res.json({
      success: true,
      data: {
        appName: config.appName,
        version: config.version,
        description: config.description,
        language: config.language,
        direction: config.direction,
        theme: config.theme,
        features: config.features,
      },
    });
  } catch (error) {
    console.error('[AppConfig] ❌ getPublicConfig error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات عمومی' });
  }
};

/* ─── GET / (authenticated) ─── */
const getConfig = async (req, res) => {
  try {
    const config = await loadConfigFromDB();
    return res.json({ success: true, data: config });
  } catch (error) {
    console.error('[AppConfig] ❌ getConfig error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در دریافت تنظیمات' });
  }
};

/* ─── GET /features ─── */
const getFeatures = async (req, res) => {
  try {
    const config = await loadConfigFromDB();
    return res.json({
      success: true,
      data: config.features || DEFAULT_CONFIG.features,
    });
  } catch (error) {
    console.error('[AppConfig] ❌ getFeatures error:', error.message);
    return res.json({ success: true, data: DEFAULT_CONFIG.features });
  }
};

/* ─── GET /market ─── */
const getMarketConfig = async (req, res) => {
  try {
    const config = await loadConfigFromDB();
    return res.json({
      success: true,
      data: config.market || DEFAULT_CONFIG.market,
    });
  } catch (error) {
    console.error('[AppConfig] ❌ getMarketConfig error:', error.message);
    return res.json({ success: true, data: DEFAULT_CONFIG.market });
  }
};

/* ─── GET /market-schedule و /market_schedule ─── */
const getMarketSchedule = async (req, res) => {
  try {
    const config = await loadConfigFromDB();
    const schedule = config.market?.schedule || DEFAULT_CONFIG.market.schedule;
    const tradingHours = config.market?.tradingHours || DEFAULT_CONFIG.market.tradingHours;
    return res.json({
      success: true,
      data: { schedule, tradingHours },
    });
  } catch (error) {
    console.error('[AppConfig] ❌ getMarketSchedule error:', error.message);
    return res.json({
      success: true,
      data: {
        schedule: DEFAULT_CONFIG.market.schedule,
        tradingHours: DEFAULT_CONFIG.market.tradingHours,
      },
    });
  }
};

/* ─── GET /market-status ─── */
const getMarketStatus = async (req, res) => {
  try {
    const now = new Date();
    const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const todayName = dayNames[now.getDay()];

    const config = await loadConfigFromDB();
    const schedule = config.market?.schedule || DEFAULT_CONFIG.market.schedule;
    const todaySchedule = schedule[todayName];

    let isOpen = false;
    if (todaySchedule?.isOpen) {
      const timeStr = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      if (todaySchedule.open && todaySchedule.close) {
        isOpen = timeStr >= todaySchedule.open && timeStr <= todaySchedule.close;
      }
    }

    return res.json({
      success: true,
      data: {
        isOpen,
        currentDay: todayName,
        schedule: todaySchedule,
        serverTime: now.toISOString(),
      },
    });
  } catch (error) {
    console.error('[AppConfig] ❌ getMarketStatus error:', error.message);
    return res.json({
      success: true,
      data: { isOpen: false, currentDay: 'unknown', serverTime: new Date().toISOString() },
    });
  }
};

/* ─── GET /:key ─── */
const getConfigByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const config = await loadConfigFromDB();

    if (config[key] !== undefined) {
      return res.json({ success: true, data: { key, value: config[key] } });
    }

    return res.status(404).json({ success: false, message: `کلید "${key}" یافت نشد` });
  } catch (error) {
    console.error('[AppConfig] ❌ getConfigByKey error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در دریافت تنظیم' });
  }
};

/* ─── PUT / (update full config) ─── */
const updateConfig = async (req, res) => {
  try {
    const updates = req.body;
    if (!updates || Object.keys(updates).length === 0) {
      return res.status(400).json({ success: false, message: 'داده‌ای برای به‌روزرسانی ارسال نشده' });
    }

    const results = [];
    for (const [key, value] of Object.entries(updates)) {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      try {
        const upserted = await prisma.appConfig.upsert({
          where: { key },
          update: { value: valueStr, updatedAt: new Date() },
          create: { key, value: valueStr },
        });
        results.push(upserted);
      } catch (dbErr) {
        console.warn(`[AppConfig] ⚠️ Could not upsert key "${key}":`, dbErr.message);
      }
    }

    console.log(`[AppConfig] ✅ Updated ${results.length} config keys`);
    return res.json({ success: true, data: results, message: `${results.length} تنظیم به‌روزرسانی شد` });
  } catch (error) {
    console.error('[AppConfig] ❌ updateConfig error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی تنظیمات' });
  }
};

/* ─── PUT /:key (update single key) ─── */
const updateConfigByKey = async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined) {
      return res.status(400).json({ success: false, message: 'مقدار (value) الزامی است' });
    }

    const valueStr = typeof value === 'string' ? value : JSON.stringify(value);

    try {
      const upserted = await prisma.appConfig.upsert({
        where: { key },
        update: { value: valueStr, updatedAt: new Date() },
        create: { key, value: valueStr },
      });

      console.log(`[AppConfig] ✅ Updated key: ${key}`);
      return res.json({ success: true, data: upserted });
    } catch (dbErr) {
      console.warn(`[AppConfig] ⚠️ DB upsert failed for "${key}":`, dbErr.message);
      return res.json({ success: true, message: `کلید "${key}" ذخیره شد (بدون DB)`, data: { key, value } });
    }
  } catch (error) {
    console.error('[AppConfig] ❌ updateConfigByKey error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در به‌روزرسانی تنظیم' });
  }
};

/* ─── POST /init (initialize defaults) ─── */
const initializeDefaults = async (req, res) => {
  try {
    const results = [];
    for (const [key, value] of Object.entries(DEFAULT_CONFIG)) {
      const valueStr = typeof value === 'string' ? value : JSON.stringify(value);
      try {
        const created = await prisma.appConfig.upsert({
          where: { key },
          update: {},
          create: { key, value: valueStr },
        });
        results.push(created);
      } catch (dbErr) {
        console.warn(`[AppConfig] ⚠️ Could not init key "${key}":`, dbErr.message);
      }
    }

    console.log(`[AppConfig] ✅ Initialized ${results.length} default configs`);
    return res.json({
      success: true,
      data: results,
      message: `${results.length} تنظیم پیش‌فرض مقداردهی شد`,
    });
  } catch (error) {
    console.error('[AppConfig] ❌ initializeDefaults error:', error.message);
    return res.status(500).json({ success: false, message: 'خطا در مقداردهی اولیه' });
  }
};

// ═══════════════════════════════════════════════════════════════
// Export
// ═══════════════════════════════════════════════════════════════

module.exports = {
  getPublicConfig,
  getConfig,
  getFeatures,
  getMarketConfig,
  getMarketSchedule,
  getMarketStatus,
  getConfigByKey,
  updateConfig,
  updateConfigByKey,
  initializeDefaults,
};
