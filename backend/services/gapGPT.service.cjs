'use strict';

const axios = require('axios');
const env = require('../config/env.cjs');
const logger = require('./logger.service.cjs');
const ontology = require('../config/ontology.cjs');
const systemPromptModule = require('./prompts/brs.system.prompt.cjs');
const aiValidatorModule = require('./aiValidator.service.cjs');

const systemPrompt =
  typeof systemPromptModule === 'string'
    ? systemPromptModule
    : systemPromptModule && typeof systemPromptModule.default === 'string'
      ? systemPromptModule.default
      : 'You are a professional Tehran Stock Exchange analyst. Provide valid JSON responses.';

const validateAIOutput =
  typeof aiValidatorModule === 'function'
    ? aiValidatorModule
    : aiValidatorModule && typeof aiValidatorModule.validateAIOutput === 'function'
      ? aiValidatorModule.validateAIOutput
      : function passthrough(data) {
          return data;
        };

function normalizeBaseUrl(url) {
  if (typeof url !== 'string' || !url.trim()) {
    return 'https://api.gapapi.com/v1';
  }
  return url.trim().replace(/\/+$/, '');
}

const GAPGPT_BASE_URL = normalizeBaseUrl(
  env.GAPGPT_API_URL || env.GAPGPT_BASE_URL || 'https://api.gapapi.com/v1'
);

const FETCH_TIMEOUT_MS = Number(env.FETCH_TIMEOUT_MS || 120000);
const FETCH_RETRIES = Number(env.FETCH_RETRIES || 2);
const RATE_LIMIT_WINDOW_MS = Number(env.RATE_LIMIT_WINDOW || 60000);
const RATE_LIMIT_MAX = Number(env.RATE_LIMIT_MAX || 10);
const DEFAULT_ONTOLOGY_VERSION = env.ONTOLOGY_VERSION || 'IRAN_V1.1';

const client = axios.create({
  baseURL: GAPGPT_BASE_URL,
  timeout: FETCH_TIMEOUT_MS,
  headers: { 'Content-Type': 'application/json' },
  validateStatus: function validateStatus(status) {
    return status >= 200 && status < 300;
  }
});

const analysisQueue = new Map();

function asPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value;
}

function resolveOntologyVersion(input) {
  const source = asPlainObject(input);
  const options = source && asPlainObject(source.options) ? source.options : null;

  const candidate =
    (options && typeof options.ontologyVersion === 'string' && options.ontologyVersion.trim()
      ? options.ontologyVersion.trim()
      : null) ||
    (ontology &&
    typeof ontology.AI_MARKET_SUMMARY_ONTOLOGY_VERSION === 'string' &&
    ontology.AI_MARKET_SUMMARY_ONTOLOGY_VERSION.trim()
      ? ontology.AI_MARKET_SUMMARY_ONTOLOGY_VERSION.trim()
      : null) ||
    (ontology && typeof ontology.version === 'string' && ontology.version.trim()
      ? ontology.version.trim()
      : null) ||
    (typeof env.ONTOLOGY_VERSION === 'string' && env.ONTOLOGY_VERSION.trim()
      ? env.ONTOLOGY_VERSION.trim()
      : null) ||
    DEFAULT_ONTOLOGY_VERSION;

  return candidate || null;
}

function getOntologySchema(version) {
  const base = asPlainObject(ontology) || {};
  const schema = Object.assign({}, base);

  if (!schema.version) schema.version = version;
  if (!schema.AI_MARKET_SUMMARY_ONTOLOGY_VERSION) {
    schema.AI_MARKET_SUMMARY_ONTOLOGY_VERSION = version;
  }
  return schema;
}

function extractAnalysisDataQuality(input) {
  const source = asPlainObject(input);
  if (!source) return null;

  if (asPlainObject(source.analysisDataQuality)) return source.analysisDataQuality;
  if (asPlainObject(source._meta) && asPlainObject(source._meta.analysisDataQuality)) {
    return source._meta.analysisDataQuality;
  }
  if (asPlainObject(source.meta) && asPlainObject(source.meta.analysisDataQuality)) {
    return source.meta.analysisDataQuality;
  }
  return null;
}

function buildPromptContext(input) {
  const dataQuality = extractAnalysisDataQuality(input);

  const strictContract = {
    type: 'STRICT_OUTPUT_REQUIREMENTS',
    instructions: [
      'Return ONLY valid JSON object. No markdown. No code fences. No extra text.',
      'Required top-level fields: summary, signals, confidence, risk_level, recommendation, ontology_version, marketData, meta.',
      'summary must be Persian text with at least 40 characters.',
      'signals must be an array (can be empty only when dataInsufficient=true).',
      'marketData must include: closingPrice, tradedVolume, moneyFlow, dailyCandles, weeklyCandles.',
      'If data is insufficient, set meta.dataInsufficient=true and meta.lowQuality=true and explain in meta.lowQualityReason.',
      'Never omit required fields; use explicit null/0/[] when truly unknown.',
      'ontology_version must match provided semantic contract version.'
    ]
  };

  if (!dataQuality) return [strictContract];

  return [
    strictContract,
    {
      type: 'ANALYSIS_DATA_QUALITY',
      instructions: [
        'Use freshness and fallback metadata when deciding confidence.',
        'Reduce confidence when market/index/symbol/history data is stale or fallback-based.',
        'Do not treat stale fallback market data as fully reliable live context.'
      ],
      dataQuality: dataQuality
    }
  ];
}

function extractJsonCandidateFromFence(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const match = text.match(/\x60\x60\x60(?:json)?\s*([\s\S]*?)\s*\x60\x60\x60/i);
  return match ? match[1].trim() : null;
}

function extractBalancedJsonObject(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      inString = !inString;
      continue;
    }
    if (inString) continue;

    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function safeJsonParse(raw) {
  if (typeof raw !== 'string') throw new Error('AI_RESPONSE_NOT_STRING');
  if (!raw.trim()) throw new Error('AI_RESPONSE_EMPTY');

  const cleaned = raw.trim();
  const candidates = [cleaned];

  const fenced = extractJsonCandidateFromFence(cleaned);
  if (fenced) candidates.push(fenced);

  const balanced = extractBalancedJsonObject(cleaned);
  if (balanced) candidates.push(balanced);

  for (let i = 0; i < candidates.length; i += 1) {
    try {
      const parsed = JSON.parse(candidates[i]);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) continue;
      return parsed;
    } catch (_e) {}
  }

  throw new Error('AI_RESPONSE_JSON_PARSE_FAILED');
}

function parseAIResponse(raw) {
  try {
    return { data: safeJsonParse(raw), parsedSuccessfully: true };
  } catch (parseError) {
    logger.warn('[GapGPT] JSON parse failed, using fallback payload', {
      error: parseError.message,
      preview: typeof raw === 'string' ? raw.slice(0, 300) : null
    });

    return {
      data: {
        error: 'PARSE_FAILED',
        rawResponse: typeof raw === 'string' ? raw.slice(0, 1000) : '',
        fallback: true,
        meta: {
          dataInsufficient: true,
          lowQuality: true,
          lowQualityReason: 'PARSE_FAILED'
        }
      },
      parsedSuccessfully: false
    };
  }
}

function pruneRateLimitEntries(userId) {
  const now = Date.now();
  const userRequests = analysisQueue.get(userId) || [];
  const validRequests = userRequests.filter(function filterRecent(time) {
    return now - time < RATE_LIMIT_WINDOW_MS;
  });
  analysisQueue.set(userId, validRequests);
  return validRequests;
}

function checkRateLimit(userId) {
  if (!userId) return;
  const validRequests = pruneRateLimitEntries(userId);

  if (validRequests.length >= RATE_LIMIT_MAX) {
    const now = Date.now();
    const remainingMs = RATE_LIMIT_WINDOW_MS - (now - validRequests[0]);
    throw new Error('RATE_LIMIT_EXCEEDED. ' + Math.ceil(Math.max(remainingMs, 0) / 1000) + 's remaining');
  }
}

function pushRateLimitEntry(userId) {
  if (!userId) return;
  const userRequests = pruneRateLimitEntries(userId);
  userRequests.push(Date.now());
  analysisQueue.set(userId, userRequests);
}

function isRetryableError(error) {
  if (!error) return false;
  if (!error.response) return true;
  const status = error.response.status;
  return status === 429 || status >= 500;
}

async function executeWithRetry(fn, maxRetries) {
  const retries = Number(maxRetries == null ? FETCH_RETRIES : maxRetries);
  let lastError;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (attempt === retries || !isRetryableError(error)) break;

      const delay = Math.min(1000 * Math.pow(2, attempt), 5000);
      logger.warn('[GapGPT] Retry ' + (attempt + 1) + '/' + (retries + 1) + ' after ' + delay + 'ms', {
        error: error.message,
        status: error.response ? error.response.status : undefined
      });

      await new Promise(function wait(resolve) {
        setTimeout(resolve, delay);
      });
    }
  }

  throw lastError;
}

function buildMessages(input, ontologyVersion) {
  const ontologySchema = getOntologySchema(ontologyVersion);
  const messages = [
    { role: 'system', content: systemPrompt },
    {
      role: 'system',
      content: JSON.stringify({
        type: 'SEMANTIC_CONTRACT',
        contract: 'BRS_MARKET_ONTOLOGY',
        version: ontologyVersion,
        rules: [
          'PERSIAN_NUMBERS_OK',
          'FIELDS_OUTSIDE_SCHEMA_FORBIDDEN',
          'JSON_ONLY_RESPONSE',
          'NO_Markdown',
          'STRUCTURED_OUTPUT_REQUIRED'
        ],
        schema: ontologySchema
      })
    }
  ];

  const promptContexts = buildPromptContext(input);
  for (let i = 0; i < promptContexts.length; i += 1) {
    messages.push({ role: 'system', content: JSON.stringify(promptContexts[i]) });
  }

  messages.push({
    role: 'user',
    content: typeof input === 'string' ? input : JSON.stringify(input, null, 2)
  });

  return messages;
}

function extractContentFromMessage(message) {
  if (!message) return null;

  if (typeof message.content === 'string') return message.content;

  if (Array.isArray(message.content)) {
    const textParts = message.content
      .map(function mapPart(part) {
        if (!part || typeof part !== 'object') return '';
        if (typeof part.text === 'string') return part.text;
        if (part.type === 'text' && typeof part.content === 'string') return part.content;
        return '';
      })
      .filter(Boolean);

    if (textParts.length > 0) return textParts.join('\n');
  }

  return null;
}

function extractMessageContent(response) {
  const choices = response && response.data && Array.isArray(response.data.choices) ? response.data.choices : [];
  if (choices.length === 0) throw new Error('EMPTY_OR_INVALID_AI_RESPONSE');

  const firstChoice = choices[0];
  const messageContent = extractContentFromMessage(firstChoice.message);

  if (typeof messageContent === 'string' && messageContent.trim()) return messageContent;
  if (typeof firstChoice.text === 'string' && firstChoice.text.trim()) return firstChoice.text;

  throw new Error('EMPTY_OR_INVALID_AI_RESPONSE');
}

function buildFallbackResult(traceId, message, extras) {
  const finalExtras = extras && typeof extras === 'object' ? extras : {};
  return Object.assign(
    {
      error: 'ANALYSIS_FAILED',
      message: message,
      fallback: true,
      recommendation: 'HOLD',
      confidence: 0,
      score: 0,
      reason: 'AI analysis unavailable',
      summary: 'Analysis temporarily unavailable. Please try again later.',
      signals: [],
      risk_level: 'MEDIUM',
      ontology_version: DEFAULT_ONTOLOGY_VERSION,
      marketData: {
        closingPrice: 0,
        tradedVolume: 0,
        moneyFlow: 0,
        dailyCandles: [],
        weeklyCandles: []
      },
      meta: {
        traceId: traceId,
        timestamp: new Date().toISOString(),
        model: env.GAPGPT_MODEL || 'gpt-4o-mini',
        dataInsufficient: true,
        lowQuality: true,
        lowQualityReason: 'FALLBACK_RESULT'
      }
    },
    finalExtras
  );
}

function buildRequestHeaders() {
  return {
    Authorization: 'Bearer ' + env.GAPGPT_API_KEY,
    'Content-Type': 'application/json'
  };
}

function isLowQualityOutput(result) {
  const r = asPlainObject(result) || {};
  const summary = typeof r.summary === 'string' ? r.summary.trim() : '';
  const signals = Array.isArray(r.signals) ? r.signals : [];
  const md = asPlainObject(r.marketData) || {};
  const closingPrice = Number(md.closingPrice || 0);
  const tradedVolume = Number(md.tradedVolume || 0);
  const dailyCandles = Array.isArray(md.dailyCandles) ? md.dailyCandles : [];
  const weeklyCandles = Array.isArray(md.weeklyCandles) ? md.weeklyCandles : [];

  const weakSummary = summary.length < 40;
  const emptySignals = signals.length === 0;
  const missingPrice = !(closingPrice > 0);
  const missingVolume = !(tradedVolume > 0);
  const noCandles = dailyCandles.length === 0 && weeklyCandles.length === 0;

  const lowQuality = weakSummary || (emptySignals && missingPrice && noCandles) || (missingPrice && missingVolume);
  const reasons = [];
  if (weakSummary) reasons.push('SUMMARY_TOO_SHORT');
  if (emptySignals) reasons.push('EMPTY_SIGNALS');
  if (missingPrice) reasons.push('MISSING_CLOSING_PRICE');
  if (missingVolume) reasons.push('MISSING_TRADED_VOLUME');
  if (noCandles) reasons.push('MISSING_CANDLES');

  return { lowQuality: lowQuality, reasons: reasons };
}

function buildFinalMeta(traceId, input, parsedSuccessfully, ontologyVersion, extra) {
  return Object.assign(
    {
      traceId: traceId,
      model: env.GAPGPT_MODEL || 'gpt-4o-mini',
      timestamp: new Date().toISOString(),
      inputType: typeof input,
      parsedSuccessfully: parsedSuccessfully,
      ontologyVersion: ontologyVersion || DEFAULT_ONTOLOGY_VERSION,
      analysisDataQuality: extractAnalysisDataQuality(input)
    },
    asPlainObject(extra) || {}
  );
}

async function runAnalysis(input, userId) {
  const normalizedUserId = userId || null;
  const traceId = 'gapgpt-' + Date.now() + '-' + Math.random().toString(36).slice(2, 8);
  const ontologyVersion = resolveOntologyVersion(input);

  try {
    if (input == null || (typeof input !== 'object' && typeof input !== 'string')) {
      throw new Error('AI_INPUT_INVALID_TYPE');
    }
    if (!ontologyVersion) throw new Error('ONTOLOGY_VERSION_MISSING');
    if (!env.GAPGPT_API_KEY || env.GAPGPT_API_KEY === 'gapgpt_xxx') {
      throw new Error('GAPGPT_API_KEY_MISSING');
    }

    if (normalizedUserId) {
      checkRateLimit(normalizedUserId);
      pushRateLimitEntry(normalizedUserId);
    }

    const inputLength = typeof input === 'string' ? input.length : JSON.stringify(input).length;

    logger.info('[GapGPT:' + traceId + '] Starting analysis', {
      model: env.GAPGPT_MODEL || 'gpt-4o-mini',
      inputLength: inputLength,
      userId: normalizedUserId,
      ontologyVersion: ontologyVersion,
      hasAnalysisDataQuality: !!extractAnalysisDataQuality(input)
    });

    const response = await executeWithRetry(function requestAnalysis() {
      return client.post(
        '/chat/completions',
        {
          model: env.GAPGPT_MODEL || 'gpt-4o-mini',
          messages: buildMessages(input, ontologyVersion),
          temperature: 0.1,
          max_tokens: Number(env.AI_MAX_TOKENS || 4000),
          top_p: 0.9
        },
        {
          timeout: FETCH_TIMEOUT_MS,
          headers: buildRequestHeaders()
        }
      );
    });

    const rawContent = extractMessageContent(response);
    logger.info('[GapGPT:' + traceId + '] Raw response received', {
      responseLength: rawContent.length,
      preview: rawContent.slice(0, 200)
    });

    const parsedResult = parseAIResponse(rawContent);
    let validated;

    try {
      validated = validateAIOutput(parsedResult.data);
    } catch (validatorError) {
      logger.warn('[GapGPT:' + traceId + '] Validator failed, using fallback payload', {
        error: validatorError.message
      });

      validated = buildFallbackResult(traceId, 'AI validation failed', {
        error: 'VALIDATION_FAILED',
        reason: 'AI validation failed',
        raw: parsedResult.data
      });
    }

    const qualityCheck = isLowQualityOutput(validated);
    const existingMeta = validated && typeof validated.meta === 'object' ? validated.meta : {};
    const normalizedModel =
      (existingMeta && typeof existingMeta.model === 'string' && existingMeta.model.trim()) ||
      (validated && typeof validated.model === 'string' && validated.model.trim()) ||
      (env.GAPGPT_MODEL || 'gpt-4o-mini');

    const finalResult = Object.assign({}, validated, {
      ontology_version:
        (validated && typeof validated.ontology_version === 'string' && validated.ontology_version.trim()) ||
        ontologyVersion,
      model: normalizedModel,
      meta: Object.assign(
        {},
        existingMeta,
        buildFinalMeta(traceId, input, parsedResult.parsedSuccessfully, ontologyVersion, {
          model: normalizedModel,
          dataInsufficient: qualityCheck.lowQuality ? true : !!existingMeta.dataInsufficient,
          lowQuality: qualityCheck.lowQuality ? true : !!existingMeta.lowQuality,
          lowQualityReason:
            qualityCheck.lowQuality && qualityCheck.reasons.length > 0
              ? qualityCheck.reasons.join('|')
              : existingMeta.lowQualityReason || null
        })
      )
    });

    if (qualityCheck.lowQuality) {
      finalResult.fallback = typeof finalResult.fallback === 'boolean' ? finalResult.fallback : false;
      finalResult.quality = 'low';
    } else {
      finalResult.quality = finalResult.quality || 'ok';
    }

    logger.info('[GapGPT:' + traceId + '] Analysis completed successfully', {
      fallback: !!finalResult.fallback,
      quality: finalResult.quality,
      lowQualityReason: finalResult.meta ? finalResult.meta.lowQualityReason : null
    });

    return finalResult;
  } catch (error) {
    logger.error('[GapGPT:' + traceId + '] Analysis failed', {
      error: error.message,
      status: error.response ? error.response.status : undefined,
      stack: error.stack,
      userId: normalizedUserId,
      ontologyVersion: ontologyVersion
    });

    return buildFallbackResult(traceId, error.message, {
      meta: buildFinalMeta(traceId, input, false, ontologyVersion, {
        dataInsufficient: true,
        lowQuality: true,
        lowQualityReason: error.message
      })
    });
  }
}

function healthCheck() {
  const apiKeyConfigured = !!env.GAPGPT_API_KEY && env.GAPGPT_API_KEY !== 'gapgpt_xxx';

  const ontologyVersion = resolveOntologyVersion({
    options: {
      ontologyVersion:
        ontology &&
        typeof ontology.AI_MARKET_SUMMARY_ONTOLOGY_VERSION === 'string' &&
        ontology.AI_MARKET_SUMMARY_ONTOLOGY_VERSION.trim()
          ? ontology.AI_MARKET_SUMMARY_ONTOLOGY_VERSION.trim()
          : null
    }
  });

  return {
    service: 'gapGPT',
    status: apiKeyConfigured && ontologyVersion ? 'healthy' : 'degraded',
    model: env.GAPGPT_MODEL || 'gpt-4o-mini',
    baseURL: GAPGPT_BASE_URL,
    apiKeyConfigured: apiKeyConfigured,
    ontologyVersion: ontologyVersion || 'unknown',
    rateLimit: {
      windowMs: RATE_LIMIT_WINDOW_MS,
      max: RATE_LIMIT_MAX
    }
  };
}

async function analyzeBulk(symbols, userId) {
  if (!Array.isArray(symbols) || symbols.length === 0) throw new Error('SYMBOLS_MUST_BE_ARRAY');
  if (symbols.length > 50) throw new Error('MAX_50_SYMBOLS_PER_BULK');

  const results = {};
  for (let i = 0; i < symbols.length; i += 1) {
    const symbol = symbols[i];
    try {
      results[symbol] = await runAnalysis({ type: 'bulk', symbol: symbol, context: 'quick-scan' }, userId);
    } catch (error) {
      results[symbol] = buildFallbackResult('gapgpt-bulk-' + Date.now() + '-' + i, error.message);
    }
  }
  return results;
}

module.exports = {
  runAnalysis: runAnalysis,
  analyzeBulk: analyzeBulk,
  healthCheck: healthCheck,
  default: { runAnalysis: runAnalysis },
  getStats: function getStats() {
    return {
      queueSize: analysisQueue.size,
      healthy: true,
      baseURL: GAPGPT_BASE_URL,
      timeoutMs: FETCH_TIMEOUT_MS,
      retries: FETCH_RETRIES
    };
  },
  _safeJsonParse: safeJsonParse,
  _checkRateLimit: checkRateLimit,
  _extractAnalysisDataQuality: extractAnalysisDataQuality,
  _resolveOntologyVersion: resolveOntologyVersion,
  _isLowQualityOutput: isLowQualityOutput
};
