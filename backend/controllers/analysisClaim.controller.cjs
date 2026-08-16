const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const DAY_MS = 24 * 60 * 60 * 1000;

const claimAnalysisHandler = async (req, res, next) => {
  try {
    const authUser = req.user;
    if (!authUser?.id) {
      return res.status(401).json({
        success: false,
        message: 'احراز هویت انجام نشده است.',
      });
    }

    const userId = Number(authUser.id);
    const now = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          analysisLimit: true,      // interval minutes (قرارداد فعلی)
          analysisLimit24h: true,
          analysisUsed24h: true,
          lastAnalysisReset: true,
          roleId: true,
        },
      });

      if (!user) {
        return { ok: false, code: 404, message: 'کاربر یافت نشد.' };
      }

      // قرارداد پیش‌فرض
      const intervalMinutes = Number(user.analysisLimit ?? 5);     // اگر 0 => بدون فاصله
      const limit24h = Number(user.analysisLimit24h ?? 20);
      let used24h = Number(user.analysisUsed24h ?? 0);
      let lastReset = user.lastAnalysisReset ? new Date(user.lastAnalysisReset) : null;

      // ریست پنجره 24 ساعته
      if (!lastReset || now.getTime() - lastReset.getTime() >= DAY_MS) {
        used24h = 0;
        lastReset = now;
        await tx.user.update({
          where: { id: userId },
          data: {
            analysisUsed24h: 0,
            lastAnalysisReset: now,
          },
        });
      }

      // چک limit 24h
      if (limit24h > 0 && used24h >= limit24h) {
        return {
          ok: false,
          code: 429,
          message: `سقف مجاز تحلیل در 24 ساعت (${limit24h}) تکمیل شده است.`,
        };
      }

      // برای interval نیاز به زمان آخرین تحلیل داریم:
      // چون فیلد مستقل نداری، از آخرین رکورد AnalysisHistory استفاده می‌کنیم.
      if (intervalMinutes > 0) {
        const lastAnalysis = await tx.analysisHistory.findFirst({
          where: { userId },
          orderBy: { createdAt: 'desc' },
          select: { createdAt: true },
        });

        if (lastAnalysis?.createdAt) {
          const mins = (now.getTime() - new Date(lastAnalysis.createdAt).getTime()) / 60000;
          if (mins < intervalMinutes) {
            const remainingMinutes = Math.ceil(intervalMinutes - mins);
            return {
              ok: false,
              code: 429,
              message: `شما هر ${intervalMinutes} دقیقه یک تحلیل مجاز دارید. ${remainingMinutes} دقیقه دیگر تلاش کنید.`,
              remainingMinutes,
            };
          }
        }
      }

      // Claim اتمیک: مصرف را همینجا ثبت کن
      const updated = await tx.user.update({
        where: { id: userId },
        data: {
          analysisUsed24h: { increment: 1 },
          lastAnalysisReset: lastReset,
        },
        select: { analysisUsed24h: true },
      });

      return {
        ok: true,
        code: 200,
        remainingCount24h: Math.max(0, limit24h - updated.analysisUsed24h),
      };
    });

    if (!result.ok) {
      return res.status(result.code || 429).json({
        success: false,
        message: result.message || 'امکان ارسال تحلیل وجود ندارد.',
        data: {
          allowed: false,
          remainingMinutes: result.remainingMinutes ?? null,
        },
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        allowed: true,
        remainingCount24h: result.remainingCount24h,
      },
    });
  } catch (err) {
    return next(err);
  }
};

module.exports = { claimAnalysisHandler };
