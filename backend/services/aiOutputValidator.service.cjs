'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../config/ontology/output.schema.cjs');
const logger = require('./logger.service.cjs');

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  allowUnionTypes: true,
  removeAdditional: false,
  useDefaults: true,
  coerceTypes: false
});

addFormats(ajv);

const validate = ajv.compile(schema);

/* ================================
 * Helpers
 * ================================ */

function createTypedError(message, code, details) {
  const err = new Error(message);
  err.code = code || 'AI_VALIDATION_ERROR';
  if (details && typeof details === 'object') {
    Object.assign(err, details);
  }
  return err;
}

function clampConfidence(value) {
  const num = Number(value);

  if (!Number.isFinite(num)) return 0;
  if (num < 0) return 0;
  if (num > 100) return 100;

  return Math.round(num);
}

function normalizeText(value, fallback) {
  if (typeof value !== 'string') return fallback;
  return value.trim();
}

function normalizeRiskLevel(value) {
  if (typeof value !== 'string') return value;

  const v = value.trim().toLowerCase();

  // نگاشت رایج برای جلوگیری از fail بی‌مورد
  if (v === 'low' || v === 'کم' || v === 'پایین') return 'low';
  if (v === 'medium' || v === 'med' || v === 'متوسط') return 'medium';
  if (v === 'high' || v === 'زیاد' || v === 'بالا') return 'high';

  return v;
}

function normalizeRecommendation(value) {
  if (typeof value !== 'string') return value;

  const v = value.trim().toUpperCase();

  // نگاشت رایج
  if (v === 'BUY' || v === 'LONG') return 'BUY';
  if (v === 'SELL' || v === 'SHORT') return 'SELL';
  if (v === 'HOLD' || v === 'NEUTRAL' || v === 'WAIT') return 'HOLD';

  return v;
}

function isPlainObject(item) {
  return !!item && typeof item === 'object' && !Array.isArray(item);
}

function normalizeSignals(signals) {
  if (!Array.isArray(signals)) return [];

  return signals
    .filter(isPlainObject)
    .filter((item) => Object.keys(item).length > 0);
}

function safeOutputForLog(output) {
  // خروجی سنگین/حساس را خلاصه می‌کنیم
  if (!isPlainObject(output)) return output;

  const cloned = { ...output };

  if (Array.isArray(cloned.signals)) {
    cloned.signalsCount = cloned.signals.length;
    delete cloned.signals;
  }

  return cloned;
}

function normalizeOutput(output) {
  if (!isPlainObject(output)) {
    throw createTypedError(
      'AI output must be a plain object',
      'AI_OUTPUT_INVALID_TYPE',
      { outputType: Array.isArray(output) ? 'array' : typeof output }
    );
  }

  const normalized = { ...output };

  // confidence
  normalized.confidence = clampConfidence(normalized.confidence);

  // signals
  normalized.signals = normalizeSignals(normalized.signals);

  // summary
  normalized.summary = normalizeText(normalized.summary, '');

  // optional standard fields
  if ('risk_level' in normalized) {
    normalized.risk_level = normalizeRiskLevel(normalized.risk_level);
  }

  if ('recommendation' in normalized) {
    normalized.recommendation = normalizeRecommendation(normalized.recommendation);
  }

  // meta
  if (!isPlainObject(normalized.meta)) {
    normalized.meta = {};
  }

  return normalized;
}

function formatAjvErrors(errors) {
  if (!Array.isArray(errors)) return [];

  return errors.map((err) => ({
    instancePath: err.instancePath || '',
    schemaPath: err.schemaPath || '',
    keyword: err.keyword || '',
    message: err.message || 'Schema validation error',
    params: err.params || {}
  }));
}

/* ================================
 * Public API
 * ================================ */

function validateAIOutput(output) {
  const normalized = normalizeOutput(output);
  const valid = validate(normalized);

  if (!valid) {
    const formattedErrors = formatAjvErrors(validate.errors);

    logger.warn('[AI VALIDATION FAILED]', {
      code: 'AI_OUTPUT_SCHEMA_VALIDATION_FAILED',
      errors: formattedErrors,
      output: safeOutputForLog(normalized)
    });

    throw createTypedError(
      'AI output failed schema validation',
      'AI_OUTPUT_SCHEMA_VALIDATION_FAILED',
      {
        validationErrors: formattedErrors,
        output: normalized
      }
    );
  }

  return normalized;
}

function isValidAIOutput(output) {
  try {
    validateAIOutput(output);
    return true;
  } catch (error) {
    return false;
  }
}

module.exports = {
  validateAIOutput,
  isValidAIOutput
};
