'use strict';

// Process-local shared cache for the single Node.js application process.
// Values are replaced atomically; expired entries remain available as stale
// fallback while a refresh is in flight or the database is temporarily down.
const entries = new Map();
const inFlight = new Map();

function getEntry(key) { return entries.get(String(key)) || null; }
function get(key) { const entry = getEntry(key); return entry ? entry.value : null; }
function set(key, value) {
  if (value === null || value === undefined) return false;
  entries.set(String(key), { value, updatedAt: Date.now() });
  return true;
}
function invalidate(key) { return entries.delete(String(key)); }
function invalidatePrefix(prefix) {
  const value = String(prefix);
  let removed = 0;
  for (const key of entries.keys()) if (key.startsWith(value)) { entries.delete(key); removed += 1; }
  return removed;
}
async function getOrLoad(key, ttlMs, loader) {
  const normalizedKey = String(key);
  const entry = getEntry(normalizedKey);
  if (entry && Date.now() - entry.updatedAt < Math.max(0, Number(ttlMs) || 0)) return entry.value;
  if (inFlight.has(normalizedKey)) return inFlight.get(normalizedKey);
  const pending = Promise.resolve().then(loader).then(value => {
    if (value !== null && value !== undefined) set(normalizedKey, value);
    return value ?? (entry ? entry.value : null);
  }).catch(error => {
    if (entry) {
      console.warn('[CENTRAL MARKET CACHE] Serving stale value after load failure:', normalizedKey, error.message);
      return entry.value;
    }
    throw error;
  }).finally(() => inFlight.delete(normalizedKey));
  inFlight.set(normalizedKey, pending);
  return pending;
}
function getStats() {
  return { entries: entries.size, inFlight: inFlight.size, keys: [...entries.keys()] };
}
module.exports = { get, set, invalidate, invalidatePrefix, getOrLoad, getStats };
