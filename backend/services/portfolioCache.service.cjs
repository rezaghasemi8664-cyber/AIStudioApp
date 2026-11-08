'use strict';

// Bounded process-local cache for authenticated users' private portfolios.
// Portfolio records are isolated by user id; SQL Server remains authoritative.
const entries = new Map();
const inFlightStateLoads = new Map();
const STATE_TTL_MS = 60_000;
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

async function getState(userId, loader) {
  const key = userKey(userId);
  const entry = entries.get(key);
  if (entry?.state && Date.now() - entry.stateUpdatedAt < STATE_TTL_MS) {
    touch(key, entry);
    return entry.state;
  }

  const pending = inFlightStateLoads.get(key);
  if (pending) return pending;

  const load = Promise.resolve().then(loader).then((state) => {
    if (state !== null && state !== undefined) {
      const current = entries.get(key) || {};
      current.state = state;
      current.stateUpdatedAt = Date.now();
      touch(key, current);
      trimCache();
      return state;
    }
    return entry?.state ?? null;
  }).catch((error) => {
    if (entry?.state) return entry.state;
    throw error;
  }).finally(() => {
    if (inFlightStateLoads.get(key) === load) inFlightStateLoads.delete(key);
  });

  inFlightStateLoads.set(key, load);
  return load;
}

function setState(userId, state) {
  const key = userKey(userId);
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
  return entries.delete(userKey(userId));
}

function getStats() {
  return { users: entries.size, inFlightStateLoads: inFlightStateLoads.size };
}

module.exports = { getState, setState, getQuotes, setQuotes, invalidateUser, getStats };
