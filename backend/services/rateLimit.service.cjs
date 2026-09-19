// backend/services/rateLimit.service.cjs - In-Memory Rate Limiter
'use strict';

const store = new Map();

// Clean up expired entries every 60 seconds
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (now - entry.startTime > entry.windowMs) {
      store.delete(key);
    }
  }
}, 60000);

async function checkLimit(key, maxAttempts, windowMs) {
  maxAttempts = maxAttempts || 5;
  windowMs = windowMs || 60000;
  var now = Date.now();
  var entry = store.get(key);
  if (!entry) return true;
  if (now - entry.startTime > windowMs) {
    store.delete(key);
    return true;
  }
  return entry.count < maxAttempts;
}

async function increment(key, windowMs) {
  windowMs = windowMs || 60000;
  var now = Date.now();
  var entry = store.get(key);
  if (!entry || (now - entry.startTime > windowMs)) {
    store.set(key, { count: 1, startTime: now, windowMs: windowMs });
  } else {
    entry.count += 1;
  }
}

async function reset(key) {
  store.delete(key);
}

module.exports = { checkLimit, increment, reset };
