'use strict';

let prisma;
try {
  prisma = require('../config/prisma.cjs');
} catch (e) {
  console.warn('[UICONFIG CTRL] Prisma not available');
}

const uiConfigService = require('../services/uiConfig.service.cjs');

function safeJsonParse(value, fallback) {
  try {
    return JSON.parse(value);
  } catch (e) {
    return fallback;
  }
}

function normalizeFontsConfig(record) {
  if (!record) return [];

  if (record.valueJson) {
    const parsed = typeof record.valueJson === 'string'
      ? safeJsonParse(record.valueJson, {})
      : record.valueJson;

    if (Array.isArray(parsed)) return parsed;
    if (Array.isArray(parsed.fonts)) return parsed.fonts;
    return [];
  }

  if (record.value !== undefined) {
    if (Array.isArray(record.value)) return record.value;
    if (record.value && Array.isArray(record.value.fonts)) return record.value.fonts;
  }

  return [];
}

function normalizeSelectedFonts(record) {
  const defaults = {
    persian: 'B Nazanin',
    latin: 'Roboto'
  };

  if (!record) return defaults;

  if (record.valueJson) {
    const parsed = typeof record.valueJson === 'string'
      ? safeJsonParse(record.valueJson, defaults)
      : record.valueJson;

    return {
      persian: parsed?.persian || defaults.persian,
      latin: parsed?.latin || defaults.latin
    };
  }

  if (record.value) {
    return {
      persian: record.value.persian || defaults.persian,
      latin: record.value.latin || defaults.latin
    };
  }

  return defaults;
}

function normalizeTseLinks(record) {
  const defaults = {};

  if (!record) return defaults;

  if (record.valueJson) {
    const parsed = typeof record.valueJson === 'string'
      ? safeJsonParse(record.valueJson, defaults)
      : record.valueJson;

    return parsed && typeof parsed === 'object' ? parsed : defaults;
  }

  if (record.value && typeof record.value === 'object') {
    return record.value;
  }

  return defaults;
}

function normalizeFeatures(record) {
  const defaults = {};

  if (!record) return defaults;

  if (record.valueJson) {
    const parsed = typeof record.valueJson === 'string'
      ? safeJsonParse(record.valueJson, defaults)
      : record.valueJson;

    return parsed && typeof parsed === 'object' ? parsed : defaults;
  }

  if (record.value && typeof record.value === 'object') {
    return record.value;
  }

  return defaults;
}

async function getConfig(req, res) {
  try {
    if (!prisma) {
      return res.json({ success: true, data: {} });
    }

    const userId = parseInt(req.user.id, 10);
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { uiConfig: true }
    });

    let config = {};
    if (user && user.uiConfig) {
      config = typeof user.uiConfig === 'string'
        ? safeJsonParse(user.uiConfig, {})
        : user.uiConfig;
    }

    return res.json({
      success: true,
      data: config
    });
  } catch (err) {
    console.error('Error fetching user UI config:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function saveConfig(req, res) {
  try {
    if (!prisma) {
      return res.json({ success: true, data: req.body });
    }

    const userId = parseInt(req.user.id, 10);
    const configStr =
      typeof req.body === 'string' ? req.body : JSON.stringify(req.body);

    await prisma.user.update({
      where: { id: userId },
      data: { uiConfig: configStr }
    });

    return res.json({
      success: true,
      data: req.body
    });
  } catch (err) {
    console.error('Error saving user UI config:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

/**
 * GET /ui-config/tse-links
 */
async function getTseLinks(req, res) {
  try {
    const tseLinksConfig = await uiConfigService.getConfig('tseLinks');
    const tseLinks = normalizeTseLinks(tseLinksConfig);

    return res.json({
      success: true,
      data: tseLinks
    });
  } catch (err) {
    console.error('Error fetching TSE links:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

/**
 * POST|PUT /ui-config/tse-links
 */
async function saveTseLinks(req, res) {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};

    await uiConfigService.setConfig('tseLinks', payload);

    return res.json({
      success: true,
      message: 'لینک‌های TSE با موفقیت ذخیره شد',
      data: payload
    });
  } catch (err) {
    console.error('Error saving TSE links:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

/**
 * GET /ui-config/features
 */
async function getFeatures(req, res) {
  try {
    const featuresConfig = await uiConfigService.getConfig('uiFeatures');
    const features = normalizeFeatures(featuresConfig);

    return res.json({
      success: true,
      data: features
    });
  } catch (err) {
    console.error('Error fetching UI features:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

/**
 * POST|PUT /ui-config/features
 */
async function saveFeatures(req, res) {
  try {
    const payload = req.body && typeof req.body === 'object' ? req.body : {};

    await uiConfigService.setConfig('uiFeatures', payload);

    return res.json({
      success: true,
      message: 'تنظیمات featureها با موفقیت ذخیره شد',
      data: payload
    });
  } catch (err) {
    console.error('Error saving UI features:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

/**
 * GET /ui-config/fonts
 * خروجی هماهنگ با frontend:
 * {
 *   success: true,
 *   data: {
 *     fonts: [],
 *     selected: { persian, latin }
 *   }
 * }
 */
async function getAppFonts(req, res) {
  try {
    const fontsConfig = await uiConfigService.getConfig('appFonts');
    const selectedFontsConfig = await uiConfigService.getConfig('selectedAppFonts');

    const fonts = normalizeFontsConfig(fontsConfig);
    const selected = normalizeSelectedFonts(selectedFontsConfig);

    return res.json({
      success: true,
      data: {
        fonts,
        selected
      }
    });
  } catch (err) {
    console.error('Error fetching app fonts:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

/**
 * GET /ui-config/fonts/active
 */
async function getActiveAppFonts(req, res) {
  try {
    const fontsConfig = await uiConfigService.getConfig('appFonts');
    const selectedFontsConfig = await uiConfigService.getConfig('selectedAppFonts');

    const fonts = normalizeFontsConfig(fontsConfig);
    const selected = normalizeSelectedFonts(selectedFontsConfig);

    return res.json({
      success: true,
      data: {
        fonts,
        selected
      }
    });
  } catch (err) {
    console.error('Error fetching active app fonts:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function addFont(req, res) {
  try {
    const { name, type, url } = req.body;

    if (!name || !type || !url) {
      return res.status(400).json({
        success: false,
        message: 'name, type, url الزامی هستند'
      });
    }

    if (!['persian', 'latin'].includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'type باید persian یا latin باشد'
      });
    }

    const fontsConfig = await uiConfigService.getConfig('appFonts');
    const selectedFontsConfig = await uiConfigService.getConfig('selectedAppFonts');

    const fonts = normalizeFontsConfig(fontsConfig);
    const selected = normalizeSelectedFonts(selectedFontsConfig);

    const exists = fonts.some((f) => f.name === name && f.type === type);

    if (exists) {
      return res.status(409).json({
        success: false,
        message: 'فونت تکراری است'
      });
    }

    const newFont = { name, type, url };
    fonts.push(newFont);

    await uiConfigService.setConfig('appFonts', { fonts });

    return res.json({
      success: true,
      message: 'فونت با موفقیت اضافه شد',
      data: {
        fonts,
        selected
      }
    });
  } catch (err) {
    console.error('Error adding font:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

async function setSelectedFont(req, res) {
  try {
    const { type, fontName, selected, persian, latin } = req.body;

    let nextSelected = normalizeSelectedFonts(
      await uiConfigService.getConfig('selectedAppFonts')
    );

    if (selected && typeof selected === 'object') {
      nextSelected = {
        persian: selected.persian || nextSelected.persian,
        latin: selected.latin || nextSelected.latin
      };
    } else if (persian || latin) {
      nextSelected = {
        persian: persian || nextSelected.persian,
        latin: latin || nextSelected.latin
      };
    } else if (type && fontName) {
      if (!['persian', 'latin'].includes(type)) {
        return res.status(400).json({
          success: false,
          message: 'type باید persian یا latin باشد'
        });
      }

      nextSelected[type] = fontName;
    } else {
      return res.status(400).json({
        success: false,
        message: 'داده نامعتبر برای انتخاب فونت'
      });
    }

    await uiConfigService.setConfig('selectedAppFonts', nextSelected);

    return res.json({
      success: true,
      message: 'فونت انتخابی با موفقیت ذخیره شد',
      data: {
        selected: nextSelected
      }
    });
  } catch (err) {
    console.error('Error setting selected font:', err);
    return res.status(500).json({
      success: false,
      message: err.message
    });
  }
}

module.exports = {
  getConfig,
  saveConfig,
  getTseLinks,
  saveTseLinks,
  getFeatures,
  saveFeatures,
  getAppFonts,
  getActiveAppFonts,
  addFont,
  setSelectedFont
};
