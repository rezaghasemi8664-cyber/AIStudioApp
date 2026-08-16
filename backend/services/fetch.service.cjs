'use strict';

const axios = require('axios');
const axiosRetry = require('axios-retry').default;
const DEFAULT_ENDPOINTS = require('../config/defaultEndpoints.cjs');

/* ===================================================
   ENV CONFIG (safe defaults)
=================================================== */

const FETCH_TIMEOUT_MS = Number(process.env.FETCH_TIMEOUT_MS) || 20000;
const FETCH_RETRIES = Number(process.env.FETCH_RETRIES) || 2;
const BRS_API_KEY = process.env.BRS_API_KEY;

/* ===================================================
   AXIOS CLIENT
=================================================== */

const client = axios.create({
  timeout: FETCH_TIMEOUT_MS,
  // Let 5xx reject so axios-retry can handle them.
  // Keep 4xx resolved for manual business handling.
  validateStatus: status => status < 500,
});

axiosRetry(client, {
  retries: FETCH_RETRIES,

  retryDelay: retryCount => {
    const delay = axiosRetry.exponentialDelay(retryCount);
    console.warn(`[FETCH][RETRY] attempt=${retryCount} delay=${delay}ms`);
    return delay;
  },

  retryCondition: error => {
    if (axiosRetry.isNetworkOrIdempotentRequestError(error)) {
      return true;
    }

    const status = error && error.response ? error.response.status : null;
    return typeof status === 'number' && status >= 500;
  },
});

/* ===================================================
   ENDPOINT RESOLVER
=================================================== */

function resolveEndpoint(endpoint) {
  if (!endpoint || typeof endpoint !== 'object') {
    throw new Error('Invalid endpoint object');
  }

  if (endpoint.enabled === false) {
    throw new Error(`Endpoint disabled: ${endpoint.key || 'unknown'}`);
  }

  if (!endpoint.url || typeof endpoint.url !== 'string') {
    throw new Error(`Endpoint URL missing: ${endpoint.key || 'unknown'}`);
  }

  return endpoint;
}

/* ===================================================
   URL BUILDER (BRS-SAFE)
=================================================== */

function buildUrl(resolved, opts) {
  let url = resolved.url;

  if (resolved.requiresSymbol) {
    const symbol = opts.symbol;

    if (!symbol || typeof symbol !== 'string' || !symbol.trim()) {
      const error = new Error(`Symbol is required for endpoint: ${resolved.key}`);
      error.status = 400;
      throw error;
    }

    url = url.replace('{symbol}', encodeURIComponent(symbol.trim()));
  }

  if (resolved.provider === 'BRS') {
    if (!BRS_API_KEY) {
      const error = new Error('BRS_API_KEY is not configured');
      error.status = 500;
      throw error;
    }

    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}key=${encodeURIComponent(BRS_API_KEY)}`;
  }

  return url;
}

/* ===================================================
   ERROR NORMALIZER
=================================================== */

function normalizeAxiosError(error, resolved, url, method) {
  const normalized = new Error(
    error && error.message
      ? error.message
      : `[FETCH_FAILED] ${resolved.key}`
  );

  normalized.status =
    (error && error.response && error.response.status) ||
    error.status ||
    500;

  normalized.data =
    (error && error.response && error.response.data) ||
    error.data ||
    null;

  normalized.endpoint = resolved.key;
  normalized.provider = resolved.provider;
  normalized.url = url;
  normalized.method = method;

  return normalized;
}

/* ===================================================
   CORE FETCH FUNCTION
=================================================== */

async function fetchFromEndpoint(endpoint, opts = {}) {
  const resolved = resolveEndpoint(endpoint);
  const method = (resolved.method || 'GET').toUpperCase();
  const url = buildUrl(resolved, opts);

  try {
    const response = await client.request({
      url,
      method,
      headers: {
        Accept: 'application/json',
        ...(opts.headers || {}),
      },
      data: opts.body === undefined ? undefined : opts.body,
      maxContentLength: 10 * 1024 * 1024,
      maxBodyLength: 10 * 1024 * 1024,
    });

    if (response.status >= 400) {
      const error = new Error(`[FETCH_FAILED] ${response.status} ${resolved.key}`);
      error.status = response.status;
      error.data = response.data;
      error.endpoint = resolved.key;
      error.provider = resolved.provider;
      error.url = url;
      error.method = method;
      throw error;
    }

    return {
      status: response.status,
      data: response.data,
    };
  } catch (error) {
    const normalized = normalizeAxiosError(error, resolved, url, method);

    console.error('[FETCH_ERROR]', {
      endpoint: normalized.endpoint,
      provider: normalized.provider,
      url: normalized.url,
      method: normalized.method,
      message: normalized.message,
      status: normalized.status,
    });

    throw normalized;
  }
}

/* ===================================================
   EXPORTS
=================================================== */

module.exports = {
  fetchFromEndpoint,
  DEFAULT_ENDPOINTS,
};
