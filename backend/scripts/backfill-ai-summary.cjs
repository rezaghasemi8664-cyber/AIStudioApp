'use strict';

/**
 * Backfill AI summaries for MarketSummary rows with missing/unavailable content
 * Run: node scripts/backfill-ai-summary.cjs
 */

const prismaMod = require('../config/prisma.cjs');
const axios = require('axios');
const env = require('../config/env.cjs');

function resolvePrismaClient(mod) {
  return mod?.prisma || mod?.db || mod?.client || mod?.default || mod;
}
const prisma = resolvePrismaClient(prismaMod);

const AI_UNAVAILABLE_PATTERNS = [
  'تحلیل هوشمند در دسترس نیست',
  'در حال تولید تحلیل',
  'analysis pending',
  'pending'
];

function toDateOnly(d) {
  return new Date(d).toISOString().slice(0, 10);
}

function safeParseJson(v) {
  if (!v) return null;
  if (typeof v === 'object') return v;
  try { return JSON.parse(v); } catch { return null; }
}

function extractAiText(raw) {
  if (!raw) return '';
  const text =
    raw.aiAnalysis ||
    raw.analysis ||
    raw.summary ||
    raw.content ||
    '';
  return String(text || '').trim();
}

function isMissingAi(text) {
  if (!text) return true;
  const t = text.toLowerCase();
  return AI_UNAVAILABLE_PATTERNS.some(p => t.includes(p.toLowerCase()));
}

async function generateAiText(marketData) {
  const apiKey = String(env.GAPGPT_API_KEY || '').trim();
  if (!apiKey) throw new Error('GAPGPT_API_KEY is missing');

  const baseUrl = String(env.GAPGPT_API_URL || 'https://api.gapgpt.app/v1').replace(/\/+$/, '');
  const model = String(env.GAPGPT_MODEL || 'gpt-4o-mini');

  const prompt = `
بر اساس داده‌های بازار ایران، یک تحلیل کوتاه و کاربردی (۳ تا ۵ جمله) بنویس:
- وضعیت شاخص کل و هم‌وزن
- تعادل نمادهای مثبت/منفی
- ارزش و حجم معاملات
- جمع‌بندی کوتاه از جو بازار

داده:
${JSON.stringify(marketData)}
`;

  const res = await axios.post(
    `${baseUrl}/chat/completions`,
    {
      model,
      messages: [
        { role: 'system', content: 'You are a professional TSE market analyst. پاسخ فارسی و دقیق.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    },
    {
      headers: { Authorization: `Bearer ${apiKey}` },
      timeout: 60000
    }
  );

  return res?.data?.choices?.[0]?.message?.content?.trim() || '';
}

async function findMarketDataForDate(summaryDate) {
  const MarketHistory = prisma.MarketHistory || prisma.marketHistory;
  if (!MarketHistory) return null;

  const start = new Date(summaryDate);
  start.setUTCHours(0, 0, 0, 0);
  const end = new Date(summaryDate);
  end.setUTCHours(23, 59, 59, 999);

  const row = await MarketHistory.findFirst({
    where: { createdAt: { gte: start, lte: end } },
    orderBy: { createdAt: 'desc' }
  });

  if (!row) return null;

  const payload = safeParseJson(row.jsonData) || safeParseJson(row.rawJson) || row;
  return payload?.data || payload?.marketData || payload;
}

async function main() {
  if (!prisma) throw new Error('Prisma client not found');

  const MarketSummary = prisma.MarketSummary || prisma.marketSummary;
  if (!MarketSummary) throw new Error('MarketSummary model not found');

  const rows = await MarketSummary.findMany({
    orderBy: { summaryDate: 'desc' }
  });

  let checked = 0;
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const row of rows) {
    checked++;

    const raw = safeParseJson(row.rawJson) || {};
    const aiText = extractAiText(raw);

    if (!isMissingAi(aiText)) {
      skipped++;
      continue;
    }

    const dateStr = toDateOnly(row.summaryDate);
    console.log(`\n[Backfill] processing ${dateStr} (id=${row.id})`);

    try {
      const marketData = raw?.data || (await findMarketDataForDate(row.summaryDate));
      if (!marketData) {
        console.log(`[Backfill] no marketData for ${dateStr} -> skipped`);
        skipped++;
        continue;
      }

      const generated = await generateAiText(marketData);
      if (!generated) {
        console.log(`[Backfill] empty AI response for ${dateStr}`);
        failed++;
        continue;
      }

      const nextRaw = { ...raw, aiAnalysis: generated, backfilledAt: new Date().toISOString() };

      await MarketSummary.update({
        where: { id: row.id },
        data: { rawJson: JSON.stringify(nextRaw) }
      });

      console.log(`[Backfill] updated ${dateStr}`);
      updated++;

      await new Promise(r => setTimeout(r, 1500)); // rate limit safe
    } catch (e) {
      console.error(`[Backfill] failed ${dateStr}:`, e.message);
      failed++;
    }
  }

  console.log('\n=== Backfill Result ===');
  console.log({ checked, updated, skipped, failed });
  process.exit(0);
}

main().catch(err => {
  console.error('[Backfill] fatal:', err);
  process.exit(1);
});
