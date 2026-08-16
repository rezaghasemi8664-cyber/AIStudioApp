// backend/services/aiConfigResolver.service.cjs
const env = require('../config/env.cjs')
const apiKeyService = require('./apiKey.service.cjs')

function maskKey(key = '') {
  if (!key) return ''
  if (key.length <= 8) return '****'
  return `${key.slice(0, 4)}****${key.slice(-4)}`
}

function normalizeEndpoint(url = '') {
  return String(url || '').replace(/\/+$/, '')
}

async function resolveAiConfigByFeature({ featureKey, userId = null }) {
  const assignment = await apiKeyService.getFeatureAssignment(featureKey)

  if (assignment?.isActive && assignment?.apiKey && assignment?.endpoint) {
    return {
      provider: assignment.endpoint.provider || 'custom',
      apiUrl: normalizeEndpoint(assignment.endpoint.baseUrl),
      apiKey: assignment.apiKey.keyValue,
      model: assignment.modelOverride || assignment.apiKey.model || env.AI_MODEL || 'gpt-4.1-mini',
      timeoutMs: assignment.endpoint.timeoutMs || 30000,
      extraHeaders: assignment.endpoint.extraHeaders || {},
      source: 'feature_assignment',
      debug: {
        featureKey,
        userId,
        endpointId: assignment.endpoint.id,
        apiKeyId: assignment.apiKey.id,
        maskedKey: maskKey(assignment.apiKey.keyValue)
      }
    }
  }

  const fallbackKey = process.env.GAPGPT_API_KEY || env.AI_API_KEY || ''
  const fallbackUrl = process.env.GAPGPT_API_URL || env.AI_API_URL || 'https://api.gapapi.com/v1'
  const fallbackModel = process.env.GAPGPT_MODEL || env.AI_MODEL || 'gpt-4.1-mini'

  if (!fallbackKey || !fallbackUrl) {
    const err = new Error(`AI_CONFIG_NOT_FOUND for featureKey=${featureKey}`)
    err.code = 'AI_CONFIG_NOT_FOUND'
    throw err
  }

  return {
    provider: 'gapgpt',
    apiUrl: normalizeEndpoint(fallbackUrl),
    apiKey: fallbackKey,
    model: fallbackModel,
    timeoutMs: 30000,
    extraHeaders: {},
    source: 'global_env',
    debug: {
      featureKey,
      userId,
      maskedKey: maskKey(fallbackKey)
    }
  }
}

module.exports = {
  resolveAiConfigByFeature,
  maskKey,
  normalizeEndpoint
}
