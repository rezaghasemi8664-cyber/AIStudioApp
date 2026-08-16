const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

function parseStoredValue(value) {
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

function emitIfAvailable(req, eventName, payload) {
  const io = req.app.get('io');
  if (io) {
    io.emit(eventName, payload);
  }
}

function stringifyValue(value) {
  return typeof value === 'string' ? value : JSON.stringify(value);
}

async function findSettingByKeyAndCategory(category, key) {
  const setting = await prisma.globalSetting.findUnique({
    where: { key }
  });

  if (!setting || setting.category !== category) {
    return null;
  }

  return setting;
}

/**
 * GET /api/settings/global
 * دریافت تمام تنظیمات سراسری
 */
exports.getAllGlobalSettings = async (req, res) => {
  try {
    const settings = await prisma.globalSetting.findMany({
      orderBy: [{ category: 'asc' }, { key: 'asc' }]
    });

    const grouped = {};
    for (const setting of settings) {
      if (!grouped[setting.category]) {
        grouped[setting.category] = {};
      }
      grouped[setting.category][setting.key] = parseStoredValue(setting.value);
    }

    res.json({ success: true, data: grouped });
  } catch (error) {
    console.error('[GlobalSettings] Get all error:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت تنظیمات سراسری',
      error: error.message
    });
  }
};

/**
 * GET /api/settings/global/:category
 * دریافت تنظیمات یک دسته خاص
 */
exports.getGlobalSettingsByCategory = async (req, res) => {
  try {
    const { category } = req.params;

    const settings = await prisma.globalSetting.findMany({
      where: { category },
      orderBy: { key: 'asc' }
    });

    const result = {};
    for (const setting of settings) {
      result[setting.key] = parseStoredValue(setting.value);
    }

    res.json({ success: true, data: result, category });
  } catch (error) {
    console.error('[GlobalSettings] Get by category error:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت تنظیمات',
      error: error.message
    });
  }
};

/**
 * GET /api/settings/global/:category/:key
 * دریافت یک تنظیم خاص
 */
exports.getGlobalSetting = async (req, res) => {
  try {
    const { category, key } = req.params;

    const setting = await findSettingByKeyAndCategory(category, key);

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: 'تنظیم یافت نشد'
      });
    }

    res.json({
      success: true,
      data: {
        ...setting,
        parsedValue: parseStoredValue(setting.value)
      }
    });
  } catch (error) {
    console.error('[GlobalSettings] Get single error:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در دریافت تنظیم',
      error: error.message
    });
  }
};

/**
 * PUT /api/settings/global/:category/:key
 * ذخیره/بروزرسانی یک تنظیم خاص
 */
exports.upsertGlobalSetting = async (req, res) => {
  try {
    const { category, key } = req.params;
    const { value } = req.body;
    const adminId = req.user?.id || null;

    if (value === undefined || value === null) {
      return res.status(400).json({
        success: false,
        message: 'Value is required'
      });
    }

    const stringValue = stringifyValue(value);
    const existing = await prisma.globalSetting.findUnique({
      where: { key }
    });

    if (existing && existing.category !== category) {
      return res.status(409).json({
        success: false,
        message: 'این key در دسته دیگری ثبت شده است و با schema فعلی باید در کل سیستم یکتا باشد',
        data: {
          key,
          existingCategory: existing.category,
          requestedCategory: category
        }
      });
    }

    const setting = await prisma.globalSetting.upsert({
      where: { key },
      update: {
        value: stringValue,
        updatedBy: adminId,
        updatedAt: new Date()
      },
      create: {
        category,
        key,
        value: stringValue,
        updatedBy: adminId
      }
    });

    emitIfAvailable(req, 'global-settings:updated', {
      category,
      key,
      value,
      updatedBy: adminId,
      updatedAt: setting.updatedAt || new Date()
    });

    console.log(`[GlobalSettings] Upserted: ${category}/${key} by user ${adminId}`);

    res.json({
      success: true,
      data: {
        ...setting,
        parsedValue: parseStoredValue(setting.value)
      }
    });
  } catch (error) {
    console.error('[GlobalSettings] Upsert error:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در ذخیره تنظیم',
      error: error.message
    });
  }
};

/**
 * PUT /api/settings/global
 * ذخیره/بروزرسانی دسته‌ای تنظیمات
 * Body: { category: { key: value, key2: value2 }, category2: { ... } }
 */
exports.bulkUpsertGlobalSettings = async (req, res) => {
  try {
    const settings = req.body;
    const adminId = req.user?.id || null;

    if (!settings || typeof settings !== 'object' || Array.isArray(settings)) {
      return res.status(400).json({
        success: false,
        message: 'داده‌های ورودی نامعتبر است'
      });
    }

    const entries = [];
    for (const category of Object.keys(settings)) {
      const categorySettings = settings[category];
      if (!categorySettings || typeof categorySettings !== 'object' || Array.isArray(categorySettings)) {
        continue;
      }

      for (const key of Object.keys(categorySettings)) {
        const value = categorySettings[key];
        if (value === undefined || value === null) {
          continue;
        }

        entries.push({
          category,
          key,
          value,
          stringValue: stringifyValue(value)
        });
      }
    }

    if (entries.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'هیچ تنظیم معتبری برای ذخیره ارسال نشده است'
      });
    }

    const uniqueKeys = [...new Set(entries.map((item) => item.key))];

    const existingSettings = await prisma.globalSetting.findMany({
      where: {
        key: {
          in: uniqueKeys
        }
      },
      select: {
        key: true,
        category: true
      }
    });

    const existingMap = new Map(existingSettings.map((item) => [item.key, item.category]));
    const conflicts = entries
      .filter((item) => existingMap.has(item.key) && existingMap.get(item.key) !== item.category)
      .map((item) => ({
        key: item.key,
        existingCategory: existingMap.get(item.key),
        requestedCategory: item.category
      }));

    if (conflicts.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'بعضی key ها در دسته‌های دیگری ثبت شده‌اند و با schema فعلی قابل جابه‌جایی نیستند',
        conflicts
      });
    }

    const operations = entries.map((item) =>
      prisma.globalSetting.upsert({
        where: { key: item.key },
        update: {
          value: item.stringValue,
          updatedBy: adminId,
          updatedAt: new Date()
        },
        create: {
          category: item.category,
          key: item.key,
          value: item.stringValue,
          updatedBy: adminId
        }
      })
    );

    await prisma.$transaction(operations);

    emitIfAvailable(req, 'global-settings:bulk-updated', {
      data: entries.map((item) => ({
        category: item.category,
        key: item.key,
        value: item.value
      })),
      updatedBy: adminId,
      updatedAt: new Date()
    });

    console.log(`[GlobalSettings] Bulk upsert: ${entries.length} settings by user ${adminId}`);

    res.json({
      success: true,
      message: `${entries.length} تنظیم با موفقیت ذخیره شد`
    });
  } catch (error) {
    console.error('[GlobalSettings] Bulk upsert error:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در ذخیره دسته‌ای تنظیمات',
      error: error.message
    });
  }
};

/**
 * DELETE /api/settings/global/:category/:key
 * حذف یک تنظیم
 */
exports.deleteGlobalSetting = async (req, res) => {
  try {
    const { category, key } = req.params;
    const adminId = req.user?.id || null;

    const setting = await findSettingByKeyAndCategory(category, key);

    if (!setting) {
      return res.status(404).json({
        success: false,
        message: 'تنظیم یافت نشد'
      });
    }

    await prisma.globalSetting.delete({
      where: { key }
    });

    emitIfAvailable(req, 'global-settings:deleted', {
      category,
      key,
      deletedBy: adminId,
      deletedAt: new Date()
    });

    console.log(`[GlobalSettings] Deleted: ${category}/${key} by user ${adminId}`);

    res.json({
      success: true,
      message: 'تنظیم حذف شد'
    });
  } catch (error) {
    console.error('[GlobalSettings] Delete error:', error);
    res.status(500).json({
      success: false,
      message: 'خطا در حذف تنظیم',
      error: error.message
    });
  }
};
