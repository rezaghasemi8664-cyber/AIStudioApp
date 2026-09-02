'use strict';

const express = require('express');
const router = express.Router();

let authMiddleware = (req, res, next) => next();
try {
  const authModule = require('../middlewares/auth.middleware.cjs');
  authMiddleware = authModule.authenticate || authModule.authMiddleware || authModule.verifyToken || authMiddleware;
} catch (error) {
  console.warn('[ANALYZE-ROUTES] Auth middleware load warning:', error.message);
}

let ctrl = {};
try {
  ctrl = require('../controllers/analyze.controller.cjs');
} catch (error) {
  console.error('[ANALYZE-ROUTES] Controller load failed:', error.message);
}

let aiService = null;
try {
  aiService = require('../services/ai.service.cjs');
} catch (error) {
  console.error('[ANALYZE-ROUTES] AI service load failed:', error.message);
}

const PERSIAN_COMPARE_CRITERIA = [
  'خروجی مقایسه باید از ابتدا و در تمام فیلدهای متنی فقط به زبان فارسی تولید شود.',
  'تمام عنوان‌ها، خلاصه‌ها، تحلیل‌های تکنیکال و بنیادی، دلایل، نتیجه‌گیری‌ها، سطح ریسک و توصیه نهایی باید فارسی باشند.',
  'هیچ واژه یا جمله انگلیسی در متن خروجی مجاز نیست.',
  'مقادیر recommendation فقط «خرید قوی»، «خرید»، «نگهداری»، «فروش»، «فروش قوی» یا «خنثی» باشند.',
  'نام نمادهای بورسی، EPS، P/E و اعداد مالی شناسه یا اصطلاح استاندارد هستند و نباید ترجمه شوند.',
  'کلیدهای JSON داخلی را مطابق قرارداد API نگه دار، اما تمام مقادیر متنی را فارسی تولید کن.',
].join('\n');

const normalizeCompareResponse = (raw, symbols) => {
  const source = raw?.data && typeof raw.data === 'object' ? raw.data : raw || {};
  if (source.symbol1_analysis || source.symbol2_analysis) return source;

  const symbol1 = symbols[0] || '';
  const symbol2 = symbols[1] || '';
  const winner = String(source.winner || '').trim();
  const reason = String(source.reason || '').trim();
  const details = typeof source.details === 'string' ? source.details : JSON.stringify(source.details || {}, null, 2);
  const scores = source.scores && typeof source.scores === 'object' ? source.scores : {};

  const buildAnalysis = (symbol) => {
    const isWinner = winner && symbol === winner;
    const score = scores[symbol];
    return {
      recommendation: isWinner ? 'خرید' : 'نگهداری',
      summary: isWinner
        ? `${symbol} به عنوان گزینه برتر مقایسه انتخاب شده است. ${reason}`.trim()
        : `${symbol} در این مقایسه به عنوان گزینه برتر انتخاب نشده است. ${reason}`.trim(),
      technicalAnalysis: score !== undefined ? `امتیاز مقایسه: ${score}` : 'تحلیل تکنیکال تفصیلی در پاسخ فعلی سرویس ارائه نشده است.',
      fundamentalAnalysis: details || 'تحلیل بنیادی تفصیلی در پاسخ فعلی سرویس ارائه نشده است.',
    };
  };

  return {
    symbol1_analysis: buildAnalysis(symbol1),
    symbol2_analysis: buildAnalysis(symbol2),
    comparison_summary: details || reason || `نتیجه مقایسه ${symbol1} و ${symbol2} دریافت شد.`,
    final_recommendation: winner
      ? `برنده مقایسه: ${winner}${reason ? ` — ${reason}` : ''}`
      : 'سرویس مقایسه برنده مشخصی اعلام نکرده است.',
  };
};

router.post('/', authMiddleware, function (req, res) {
  if (typeof ctrl.analyze === 'function') return ctrl.analyze(req, res);
  if (typeof ctrl.analyzeStock === 'function') return ctrl.analyzeStock(req, res);
  return res.status(503).json({ success: false, message: 'سرویس تحلیل در دسترس نیست.', code: 'ANALYZE_SERVICE_UNAVAILABLE', requestId: req.requestId });
});

router.post('/stock', authMiddleware, function (req, res) {
  if (typeof ctrl.analyzeStock === 'function') return ctrl.analyzeStock(req, res);
  if (typeof ctrl.analyze === 'function') return ctrl.analyze(req, res);
  return res.status(503).json({ success: false, message: 'سرویس تحلیل سهم در دسترس نیست.', code: 'STOCK_ANALYSIS_UNAVAILABLE', requestId: req.requestId });
});

router.post('/compare', authMiddleware, async function (req, res) {
  try {
    const body = req.body || {};
    const rawSymbols = Array.isArray(body.symbols) ? body.symbols : (Array.isArray(body.stocks) ? body.stocks : []);
    const symbols = rawSymbols.map((s) => String(s || '').trim()).filter(Boolean);

    if (symbols.length < 2) {
      return res.status(400).json({ success: false, message: 'حداقل دو نماد برای مقایسه لازم است' });
    }

    if (aiService && typeof aiService.compareStocks === 'function' && aiService.isAvailable) {
      const result = await aiService.compareStocks({
        symbols,
        criteria: PERSIAN_COMPARE_CRITERIA,
        data: body.data || null,
        model: body.model,
        maxTokens: body.maxTokens,
        temperature: body.temperature,
      });

      return res.json({
        success: true,
        data: normalizeCompareResponse(result?.data, symbols),
        content: result?.content || '',
        model: result?.model,
        usage: result?.usage || null,
      });
    }

    if (typeof ctrl.compareStocks === 'function') return ctrl.compareStocks(req, res);
    if (typeof ctrl.compare === 'function') return ctrl.compare(req, res);

    return res.status(503).json({
      success: false,
      message: 'سرویس مقایسه در دسترس نیست.',
      code: 'COMPARE_SERVICE_UNAVAILABLE',
      requestId: req.requestId,
    });
  } catch (error) {
    console.error('[ANALYZE-ROUTES] Compare error:', error.message);
    return res.status(Number(error.statusCode) >= 400 ? Number(error.statusCode) : 500).json({
      success: false,
      message: error.message || 'خطا در سرویس مقایسه',
      code: 'COMPARE_SERVICE_ERROR',
      requestId: req.requestId,
    });
  }
});

router.post('/chat', authMiddleware, function (req, res) {
  if (typeof ctrl.chat === 'function') return ctrl.chat(req, res);
  return res.status(503).json({ success: false, message: 'سرویس چت در دسترس نیست.', code: 'CHAT_SERVICE_UNAVAILABLE' });
});

router.post('/ask', authMiddleware, function (req, res) {
  if (typeof ctrl.ask === 'function') return ctrl.ask(req, res);
  if (typeof ctrl.chat === 'function') return ctrl.chat(req, res);
  return res.status(503).json({ success: false, message: 'سرویس پرسش در دسترس نیست.', code: 'ASK_SERVICE_UNAVAILABLE' });
});

router.get('/models', function (_req, res) {
  if (typeof ctrl.getModels === 'function') return ctrl.getModels(_req, res);
  return res.json({ success: true, data: [{ id: 'gpt-4o-mini', name: 'GPT-4o Mini' }, { id: 'gpt-4o', name: 'GPT-4o' }] });
});

router.get('/history', authMiddleware, function (req, res) {
  if (typeof ctrl.getAnalysisHistory === 'function') return ctrl.getAnalysisHistory(req, res);
  return res.json({ success: true, data: [] });
});

router.get('/status', function (_req, res) {
  const hasKey = !!(process.env.GAPGPT_API_KEY || process.env.AI_API_KEY || process.env.OPENAI_API_KEY);
  return res.json({ success: true, data: { available: hasKey, provider: hasKey ? 'GapGPT' : 'none', timestamp: new Date().toISOString() } });
});

module.exports = router;
console.log('[ANALYZE-ROUTES] Loaded successfully');