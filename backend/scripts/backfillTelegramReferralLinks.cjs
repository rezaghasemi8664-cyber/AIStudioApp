'use strict';

// Dry-run by default. Pass --apply to call Telegram and write missing/revoked links.
const prismaModule = require('../config/prisma.cjs');
const prisma = prismaModule.prisma || prismaModule.default || prismaModule;
const telegramBotApi = require('../services/telegramBotApi.service.cjs');
const { ensureTelegramReferralLink } = require('../services/telegramReferralLinks.service.cjs');

const APPLY = process.argv.includes('--apply');
const DELAY_MS = Math.max(250, Number(process.env.TELEGRAM_REFERRAL_BACKFILL_DELAY_MS) || 500);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const config = telegramBotApi.getTelegramConfig();
  if (!config.token || !config.chatId) {
    throw new Error('TELEGRAM_NOT_CONFIGURED');
  }

  // Include active and inactive accounts. Soft-deleted accounts are excluded.
  const users = await prisma.user.findMany({
    where: { isDeleted: false },
    orderBy: { id: 'asc' },
    select: { id: true, isActive: true },
  });

  const links = await prisma.telegramReferralLink.findMany({
    where: { channelId: config.chatId },
    select: { inviterId: true, isActive: true, revokedAt: true },
  });
  const byUser = new Map(links.map((link) => [link.inviterId, link]));
  const missing = users.filter((user) => {
    const link = byUser.get(user.id);
    return !link || !link.isActive || Boolean(link.revokedAt);
  });

  const activeCount = users.filter((user) => user.isActive).length;
  const inactiveCount = users.length - activeCount;
  console.log(JSON.stringify({
    mode: APPLY ? 'APPLY' : 'DRY_RUN',
    channelId: config.chatId,
    eligibleUsers: users.length,
    activeUsers: activeCount,
    inactiveUsers: inactiveCount,
    usersWithUsableLinks: users.length - missing.length,
    usersNeedingLinkProvisioning: missing.length,
    note: 'Soft-deleted users are excluded. Existing usable links are preserved.',
  }, null, 2));

  if (!APPLY) {
    console.log('No changes made. Run again with --apply to provision missing/revoked links.');
    return;
  }

  let createdOrReactivated = 0;
  let failed = 0;
  for (let index = 0; index < missing.length; index += 1) {
    const user = missing[index];
    try {
      await ensureTelegramReferralLink(user.id);
      createdOrReactivated += 1;
      console.log('OK userId=' + user.id + ' activeAccount=' + user.isActive);
    } catch (error) {
      failed += 1;
      console.error('FAILED userId=' + user.id + ' code=' + String(error?.code || 'UNKNOWN').slice(0, 80));
    }
    if (index < missing.length - 1) await sleep(DELAY_MS);
  }

  console.log(JSON.stringify({
    completed: true,
    processed: missing.length,
    createdOrReactivated,
    failed,
    retrySafe: true,
  }, null, 2));
  if (failed > 0) process.exitCode = 1;
}

main()
  .catch((error) => {
    console.error('[TELEGRAM_REFERRAL_BACKFILL] failed:', String(error?.code || error?.message || 'UNKNOWN').slice(0, 160));
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect().catch(() => {});
  });
