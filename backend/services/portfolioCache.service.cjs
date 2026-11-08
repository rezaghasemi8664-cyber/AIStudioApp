'use strict';

// Bounded process-local cache for authenticated users' private portfolios.
// Portfolio records are isolated by user id; SQL Server remains authoritative.
// State has no time-based expiry: it stays cached until that user's portfolio
// changes, is explicitly invalidated, or the bounded LRU cache needs room.
const entries = new Map();
const inFlightStateLoads = new Map();
const MAX_CACHED_USERS = 2_000;

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
    // setState/invalidateUser may have superseded this DB read while it was
    // in flight. Never let an older read overwrite a newer portfolio state.
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

function setState(userId, state) {
  const key = userKey(userId);
  // A pending DB read is now stale relative to this successful portfolio write.
  inFlightStateLoads.delete(key);
  const entry = entries.get(key) || {};
  entry.state = state;
  entry.stateUpdatedAt = Date.now();
  entry.quotes = null;
  touch(key, entry);
  trimCache();
  return true;
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
  // Prevent an older in-flight load from repopulating an explicitly invalidated entry.
  inFlightStateLoads.delete(key);
  return entries.delete(key);
}

function getStats() {
  return { users: entries.size, inFlightStateLoads: inFlightStateLoads.size };
}

module.exports = { getState, setState, getQuotes, setQuotes, invalidateUser, getStats };
