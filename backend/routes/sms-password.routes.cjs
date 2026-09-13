'use strict';

const express = require('express');
const bcrypt = require('bcryptjs');
const router = express.Router();
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const smsService = require('../services/sms/sms.service.cjs');
const { encryptPassword } = require('../services/passwordVault.service.cjs');

router.post('/reset', async (req, res) => {
  try {
    const mobile = String(req.body?.mobile || '').trim();
    const code = String(req.body?.code || '').trim();
    const newPassword = String(req.body?.newPassword || '');

    if (!mobile || !code || !/^\d{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'شماره موبایل و کد تأیید ۶ رقمی الزامی است',
      });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: 'رمز جدید باید حداقل ۶ کاراکتر باشد',
      });
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ mobile }, { phone: mobile }], isDeleted: false },
      select: { id: true, isActive: true },
    });

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'کاربری با این شماره موبایل یافت نشد',
      });
    }

    if (!user.isActive) {
      return res.status(403).json({
        success: false,
        message: 'حساب کاربری غیرفعال است',
      });
    }

    const otpResult = await smsService.verifyOtp({
      mobile,
      code,
      purpose: 'reset-password',
    });

    if (!otpResult?.verified) {
      const reasonMessages = {
        expired: 'کد تأیید منقضی شده است',
        max_attempts: 'تعداد دفعات مجاز ورود کد به پایان رسیده است',
        invalid_code: 'کد تأیید اشتباه است',
      };

      const message = reasonMessages[otpResult?.reason] || 'کد تأیید نامعتبر است';
      return res.status(400).json({
        success: false,
        message,
        reason: otpResult?.reason || 'invalid_code',
      });
    }

    const passwordHash = await bcrypt.hash(newPassword, 12);

    await prisma.user.update({
      where: { id: user.id },
      data: {
        passwordHash,
        passwordEncrypted: encryptPassword(newPassword),
        passwordChangedAt: new Date(),
      },
    });

    await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});

    return res.json({
      success: true,
      message: 'کلمه عبور با موفقیت تغییر کرد',
    });
  } catch (error) {
    return res.status(400).json({
      success: false,
      message: error?.message || 'تغییر کلمه عبور ناموفق بود',
    });
  }
});

module.exports = router;
