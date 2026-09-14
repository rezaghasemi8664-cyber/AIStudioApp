'use strict';

// Codal provider skeleton.
// It intentionally performs no network request until a real Codal API
// contract and credentials are configured.

function getStatus() {
  const apiUrl = String(process.env.CODAL_API_URL || '').trim();
  return {
    provider: 'CODAL',
    configured: Boolean(apiUrl),
    enabled: false,
    reason: apiUrl
      ? 'API contract not configured'
      : 'CODAL_API_URL is not configured'
  };
}

async function getCompanyReports() {
  const status = getStatus();
  const error = new Error('Codal provider is not configured');
  error.code = 'CODAL_NOT_CONFIGURED';
  error.status = status;
  throw error;
}

module.exports = {
  getStatus,
  getCompanyReports
};
