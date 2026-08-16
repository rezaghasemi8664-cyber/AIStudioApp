'use strict';

const Ajv = require('ajv');
const addFormats = require('ajv-formats');
const schema = require('../config/ontology/output.schema.cjs');
const logger = require('./logger.service.cjs');

const ajv = new Ajv({
  allErrors: true,
  strict: false,
  allowUnionTypes: true
});

addFormats(ajv);

const validate = ajv.compile(schema);

function clampConfidence(value) {
  const num = Number(value);

  if (!Number.isFinite(num)) {
    return 0;
  }

  if (num < 0) {
    return 0;
  }

  if (num > 100) {
    return 100;
  }

  return Math.round(num);
}

function normalizeSignals(signals) {
  if (!Array.isArray(signals)) {
    return [];
  }

  return signals.filter(function isUsableSignal(item) {
    return item && typeof item === 'object' && !Array.isArray(item);
  });
}

function normalizeOutput(output) {
  if (!output || typeof output !== 'object' || Array.isArray(output)) {
    throw new Error('AI_OUTPUT_INVALID_TYPE');
  }

  const normalized = {
    ...output
  };

  if ('confidence' in normalized) {
    normalized.confidence = clampConfidence(normalized.confidence);
  } else {
    normalized.confidence = 0;
  }

  if ('signals' in normalized) {
    normalized.signals = normalizeSignals(normalized.signals);
  } else {
    normalized.signals = [];
  }

  if (typeof normalized.summary !== 'string') {
    normalized.summary = '';
  } else {
    normalized.summary = normalized.summary.trim();
  }

  if (typeof normalized.risk_level === 'string') {
    normalized.risk_level = normalized.risk_level.trim().toLowerCase();
  }

  if (typeof normalized.recommendation === 'string') {
    normalized.recommendation = normalized.recommendation.trim().toUpperCase();
  }

  if (
    !normalized.meta ||
    typeof normalized.meta !== 'object' ||
    Array.isArray(normalized.meta)
  ) {
    normalized.meta = {};
  }

  return normalized;
}

function formatAjvErrors(errors) {
  if (!Array.isArray(errors)) {
    return [];
  }

  return errors.map(function mapError(err) {
    return {
      instancePath: err.instancePath || '',
      schemaPath: err.schemaPath || '',
      keyword: err.keyword || '',
      message: err.message || 'Schema validation error',
      params: err.params || {}
    };
  });
}

function validateAIOutput(output) {
  const normalized = normalizeOutput(output);
  const valid = validate(normalized);

  if (!valid) {
    const formattedErrors = formatAjvErrors(validate.errors);

    logger.warn('[AI VALIDATION FAILED]', {
      errors: formattedErrors,
      output: normalized
    });

    const error = new Error('AI_OUTPUT_SCHEMA_VALIDATION_FAILED');
    error.code = 'AI_OUTPUT_SCHEMA_VALIDATION_FAILED';
    error.validationErrors = formattedErrors;
    error.output = normalized;

    throw error;
  }

  return normalized;
}

function isValidAIOutput(output) {
  try {
    validateAIOutput(output);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  validateAIOutput,
  isValidAIOutput
};
