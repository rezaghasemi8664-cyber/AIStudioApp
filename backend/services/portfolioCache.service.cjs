'use strict';

// Bounded process-local cache for authenticated users' private portfolios.
// SQL Server remains authoritative; cached state is refreshed by portfolio writes.
const entries = new Map();
const inFlightStateLoads = new Map();
const inFlightAnalyticsLoads = new Map();
const MAX_CACHED_USERS = 2_000;
const ANALYTICS_TTL_MS = 5 * 60 * 1000;

function userKey(userId) {
  const key = String(userId ?? '').trim();
  if (!/^\d+$/.test(key) || Number(key) <= 0) throw new Error('Invalid portfolio cache user id');
  return key;
}

function touch(key, entry) {
  entries.delete(key);
  entries.set(key, entry);
}

function trimCache() {
  while (entries.size > MAX_CACHED_USERS) {
    const oldestKey = entries.keys().next().value;
    if (oldestKey === undefined) break;
    entries.delete(oldestKey);
    inFlightStateLoads.delete(oldestKey);
    inFlightAnalyticsLoads.delete(oldestKey);
  }
}

function hasState(entry) {
  return Boolean(entry) && Object.prototype.hasOwnProperty.call(entry, 'state');
}

async function getState(userId, loader) {
  const key = userKey(userId);
  const entry = entries.get(key);
  if (hasState(entry)) {
    touch(key, entry);
    return entry.state;
  }

  const pending = inFlightStateLoads.get(key);
  if (pending) return pending;

  const load = Promise.resolve().then(loader).then((state) => {
    if (inFlightStateLoads.get(key) !== load) {
      const latest = entries.get(key);
      return hasState(latest) ? latest.state : null;
    }

    if (state !== null && state !== undefined) {
      const current = entries.get(key) || {};
      current.state = state;
      current.stateUpdatedAt = Date.now();
      touch(key, current);
      trimCache();
      return state;
    }

    const current = entries.get(key);
    return hasState(current) ? current.state : null;
  }).catch((error) => {
    const current = entries.get(key);
    if (hasState(current)) return current.state;
    throw error;
  }).finally(() => {
    if (inFlightStateLoads.get(key) === load) inFlightStateLoads.delete(key);
  });

  inFlightStateLoads.set(key, load);
  return load;
}

function clearAnalytics(key) {
  inFlightAnalyticsLoads.delete(key);
  const entry = entries.get(key);
  if (entry) entry.analytics = null;
}

function setState(userId, state) {
  const key = userKey(userId);
  inFlightStateLoads.delete(key);
  clearAnalytics(key);
  const entry = entries.get(key) || {};
  entry.state = state;
  entry.stateUpdatedAt = Date.now();
  entry.quotes = null;
  touch(key, entry);
  trimCache();
  return true;
}

// Shared analytics payload for all portfolio cards. It is scoped to the user,
// the active market snapshot, and a short freshness window. Portfolio writes
// invalidate it immediately; simultaneous card requests share one loader.
async function getAnalytics(userId, cacheKey, loader) {
  const key = userKey(userId);
  const normalizedCacheKey = String(cacheKey ?? 'default');
  const entry = entries.get(key);
  const cached = entry && entry.analytics;
  if (
    cached &&
    cached.cacheKey === normalizedCacheKey &&
    Date.now() - cached.updatedAt < ANALYTICS_TTL_MS
  ) {
    touch(key, entry);
    return cached.data;
  }

  const pending = inFlightAnalyticsLoads.get(key);
  if (pending && pending.cacheKey === normalizedCacheKey) return pending.promise;

  const load = Promise.resolve().then(loader).then((data) => {
    const currentPending = inFlightAnalyticsLoads.get(key);
    if (!currentPending || currentPending.promise !== load) {
      const latest = entries.get(key)?.analytics;
      return latest && latest.cacheKey === normalizedCacheKey ? latest.data : null;
    }
    if (data !== null && data !== undefined) {
      const current = entries.get(key) || {};
      current.analytics = { cacheKey: normalizedCacheKey, data, updatedAt: Date.now() };
      touch(key, current);
      trimCache();
      return data;
    }
    return null;
  }).catch((error) => {
    const latest = entries.get(key)?.analytics;
    if (latest && latest.cacheKey === normalizedCacheKey) return latest.data;
    throw error;
  }).finally(() => {
    if (inFlightAnalyticsLoads.get(key)?.promise === load) inFlightAnalyticsLoads.delete(key);
  });

  inFlightAnalyticsLoads.set(key, { cacheKey: normalizedCacheKey, promise: load });
  return load;
}

function getQuotes(userId, snapshotId) {
  const key = userKey(userId);
  const entry = entries.get(key);
  if (!entry?.quotes || String(entry.quotes.snapshotId) !== String(snapshotId)) return null;
  touch(key, entry);
  return entry.quotes.data;
}

function setQuotes(userId, snapshotId, data) {
  const key = userKey(userId);
  const entry = entries.get(key) || {};
  entry.quotes = { snapshotId, data, updatedAt: Date.now() };
  touch(key, entry);
  trimCache();
  return true;
}

function invalidateUser(userId) {
  const key = userKey(userId);
  inFlightStateLoads.delete(key);
  inFlightAnalyticsLoads.delete(key);
  return entries.delete(key);
}

function getStats() {
  return {
    users: entries.size,
    inFlightStateLoads: inFlightStateLoads.size,
    inFlightAnalyticsLoads: inFlightAnalyticsLoads.size,
    analyticsEntries: Array.from(entries.values()).filter(entry => Boolean(entry.analytics)).length
  };
}

module.exports = {
  getState,
  setState,
  getAnalytics,
  getQuotes,
  setQuotes,
  invalidateUser,
  getStats
};
