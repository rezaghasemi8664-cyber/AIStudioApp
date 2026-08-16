// controllers/fontConfig.controller.cjs
const fontConfigService = require('../services/fontConfig.service.cjs');

async function getFonts(req, res) {
  try {
    const userId = req.user.id;

    const [fonts, selected] = await Promise.all([
      fontConfigService.getGlobalFontsList(),
      fontConfigService.getUserSelectedFonts(userId),
    ]);

    return res.json({
      success: true,
      data: {
        fonts,
        selected,
      },
    });
  } catch (error) {
    console.error('Error getting fonts:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت تنظیمات فونت',
      error: error.message,
    });
  }
}

async function getActiveFonts(req, res) {
  try {
    const userId = req.user.id;
    const selected = await fontConfigService.getUserSelectedFonts(userId);

    return res.json({
      success: true,
      data: selected,
    });
  } catch (error) {
    console.error('Error getting active fonts:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در دریافت فونت‌های فعال',
      error: error.message,
    });
  }
}

async function addFont(req, res) {
  try {
    const { name, type, url } = req.body || {};

    if (!name || !type || !url) {
      return res.status(400).json({
        success: false,
        message: 'فیلدهای name، type و url الزامی هستند',
      });
    }

    if (!['persian', 'latin'].includes(String(type).toLowerCase())) {
      return res.status(400).json({
        success: false,
        message: 'type باید یکی از persian یا latin باشد',
      });
    }

    const result = await fontConfigService.addGlobalFont({ name, type, url });

    return res.status(201).json({
      success: true,
      message: 'فونت با موفقیت اضافه شد',
      data: result,
    });
  } catch (error) {
    const statusCode =
      error.message === 'Font already exists' || error.message === 'Invalid font payload'
        ? 400
        : 500;

    console.error('Error adding font:', error);
    return res.status(statusCode).json({
      success: false,
      message:
        error.message === 'Font already exists'
          ? 'این فونت قبلاً ثبت شده است'
          : error.message === 'Invalid font payload'
            ? 'اطلاعات فونت نامعتبر است'
            : 'خطا در افزودن فونت',
      error: error.message,
    });
  }
}

async function setSelectedFont(req, res) {
  try {
    const userId = req.user.id;
    const { persian, latin } = req.body || {};

    if (!persian && !latin) {
      return res.status(400).json({
        success: false,
        message: 'حداقل یکی از فیلدهای persian یا latin باید ارسال شود',
      });
    }

    const fonts = await fontConfigService.getGlobalFontsList();

    if (persian) {
      const hasPersian = fonts.some(
        (item) => item.type === 'persian' && item.name === persian
      );

      if (!hasPersian) {
        return res.status(400).json({
          success: false,
          message: 'فونت فارسی انتخاب‌شده در لیست فونت‌ها وجود ندارد',
        });
      }
    }

    if (latin) {
      const hasLatin = fonts.some(
        (item) => item.type === 'latin' && item.name === latin
      );

      if (!hasLatin) {
        return res.status(400).json({
          success: false,
          message: 'فونت لاتین انتخاب‌شده در لیست فونت‌ها وجود ندارد',
        });
      }
    }

    const selected = await fontConfigService.saveUserSelectedFonts(userId, {
      persian,
      latin,
    });

    return res.json({
      success: true,
      message: 'فونت‌های انتخاب‌شده با موفقیت ذخیره شدند',
      data: selected,
    });
  } catch (error) {
    console.error('Error setting selected fonts:', error);
    return res.status(500).json({
      success: false,
      message: 'خطا در ذخیره فونت‌های انتخاب‌شده',
      error: error.message,
    });
  }
}

module.exports = {
  getFonts,
  getActiveFonts,
  addFont,
  setSelectedFont,
};
