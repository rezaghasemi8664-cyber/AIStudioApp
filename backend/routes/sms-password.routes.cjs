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
    if (!mobile || !code || newPassword.length < 6) {
      return res.status(400).json({ success: false, message: 'شماره موبایل، کد تأیید و رمز جدید حداقل ۶ کاراکتری الزامی است' });
    }

    const user = await prisma.user.findFirst({
      where: { OR: [{ mobile }, { phone: mobile }], isDeleted: false },
      select: { id: true, isActive: true },
    });
    if (!user) return res.status(404).json({ success: false, message: 'کاربری با این شماره موبایل یافت نشد' });
    if (!user.isActive) return res.status(403).json({ success: false, message: 'حساب کاربری غیرفعال است' });

    await smsService.verifyOtp(mobile, code, 'reset-password');
    const passwordHash = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({
      where: { id: user.id },
      data: { passwordHash, passwordEncrypted: encryptPassword(newPassword), passwordChangedAt: new Date() },
    });
    await prisma.session.deleteMany({ where: { userId: user.id } }).catch(() => {});

    return res.json({ success: true, message: 'کلمه عبور با موفقیت تغییر کرد' });
  } catch (error) {
    return res.status(400).json({ success: false, message: error?.message || 'تغییر کلمه عبور ناموفق بود' });
  }
});

module.exports = router;
