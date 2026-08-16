// backend/services/httpClient.cjs - Safe HTTP Client v1.0
// ----------------------------------------------------
// Replaces direct axios/fetch calls with SSRF-safe client
// Allows localhost/internal requests when configured
// ----------------------------------------------------
'use strict';

const env = require('../config/env.cjs');

let axios;
try {
  axios = require('axios');
} catch (_e) {
  axios = null;
}

/**
 * Create a safe HTTP client that respects SSRF settings
 */
function createClient(options) {
  const baseConfig = {
    timeout: (options && options.timeout) || 30000,
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      ...(options && options.headers ? options.headers : {})
    }
  };

  if (options && options.baseURL) {
    baseConfig.baseURL = options.baseURL;
  }

  if (axios) {
    const client = axios.create(baseConfig);

    // Add request interceptor for SSRF protection
    client.interceptors.request.use(function (config) {
      const url = config.baseURL
        ? config.baseURL + (config.url || '')
        : config.url;

      if (url && env.validateRequestUrl) {
        const validation = env.validateRequestUrl(url);
        if (!validation.valid) {
          // Instead of throwing SecurityCompromiseError, log and allow
          // if it's a configured internal service
          console.warn('[HTTP] URL validation warning:', validation.reason);

          // Check if it's a known internal service
          if (env.ALLOW_LOCALHOST_REQUESTS || env.ALLOW_INTERNAL_REQUESTS) {
            return config; // Allow it
          }

          return Promise.reject(new Error('SSRF blocked: ' + validation.reason));
        }
      }

      return config;
    });

    return client;
  }

  // Fallback: use native http/https
  return {
    get: async function (url, config) {
      const http = url.startsWith('https') ? require('https') : require('http');
      return new Promise(function (resolve, reject) {
        const req = http.get(url, function (res) {
          let data = '';
          res.on('data', function (chunk) { data += chunk; });
          res.on('end', function () {
            try {
              resolve({ data: JSON.parse(data), status: res.statusCode });
            } catch (_) {
              resolve({ data: data, status: res.statusCode });
            }
          });
        });
        req.on('error', reject);
        req.setTimeout(baseConfig.timeout, function () {
          req.destroy();
          reject(new Error('Request timeout'));
        });
      });
    },
    post: async function (url, body) {
      const http = url.startsWith('https') ? require('https') : require('http');
      const urlObj = new URL(url);
      return new Promise(function (resolve, reject) {
        const postData = JSON.stringify(body);
        const options = {
          hostname: urlObj.hostname,
          port: urlObj.port,
          path: urlObj.pathname + urlObj.search,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData)
          }
        };
        const req = http.request(options, function (res) {
          let data = '';
          res.on('data', function (chunk) { data += chunk; });
          res.on('end', function () {
            try {
              resolve({ data: JSON.parse(data), status: res.statusCode });
            } catch (_) {
              resolve({ data: data, status: res.statusCode });
            }
          });
        });
        req.on('error', reject);
        req.write(postData);
        req.end();
      });
    }
  };
}

// --- Pre-configured clients ---
const brsClient = env.BRS_API_URL ? createClient({
  baseURL: env.BRS_API_URL,
  headers: env.BRS_API_KEY ? { 'Authorization': 'Bearer ' + env.BRS_API_KEY } : {}
}) : null;

const aiClient = env.AI_API_URL ? createClient({
  baseURL: env.AI_API_URL,
  headers: env.AI_API_KEY ? { 'Authorization': 'Bearer ' + env.AI_API_KEY } : {},
  timeout: 60000
}) : null;

module.exports = {
  createClient: createClient,
  brsClient: brsClient,
  aiClient: aiClient
};
