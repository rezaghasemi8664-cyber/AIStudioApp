'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');
const filePath = path.join(dataDir, 'site-analytics.json');
const ONLINE_TTL_MS = 45 * 1000;

function todayKey(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tehran' }).format(date);
}

function ensureStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({ days: {} }, null, 2), 'utf8');
}

function readStore() {
  ensureStore();
  try {
    const raw = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return raw && typeof raw === 'object' ? raw : { days: {} };
  } catch {
    return { days: {} };
  }
}

function writeStore(store) {
  ensureStore();
  const temp = filePath + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temp, filePath);
}

function cleanupOldDays(store) {
  const today = todayKey();
  for (const key of Object.keys(store.days || {})) {
    if (key !== today) delete store.days[key];
  }
}

function createVisitorId() {
  return crypto.randomBytes(16).toString('hex');
}

function recordVisit({ visitorId, user }) {
  const store = readStore();
  cleanupOldDays(store);
  const day = todayKey();
  if (!store.days[day]) store.days[day] = { total: 0, unique: 0, visitors: {}, events: [], online: {} };

  const id = visitorId || createVisitorId();
  const now = new Date().toISOString();
  const existing = store.days[day].visitors[id];

  if (!existing) {
    store.days[day].unique += 1;
  }

  store.days[day].total += 1;
  store.days[day].visitors[id] = {
    id,
    username: user?.username || user?.email || null,
    userId: user?.userId || user?.id || null,
    lastVisitAt: now,
    visits: Number(existing?.visits || 0) + 1,
  };
  store.days[day].events = Array.isArray(store.days[day].events) ? store.days[day].events : [];
  store.days[day].events.push({ id: crypto.randomBytes(8).toString('hex'), visitorId: id, username: user?.username || user?.email || null, userId: user?.userId || user?.id || null, visitedAt: now });
  if (store.days[day].events.length > 5000) store.days[day].events = store.days[day].events.slice(-5000);
  writeStore(store);
  return { visitorId: id, timestamp: now };
}

function heartbeat({ visitorId, user }) {
  const store = readStore();
  cleanupOldDays(store);
  const day = todayKey();
  if (!store.days[day]) store.days[day] = { total: 0, unique: 0, visitors: {}, events: [], online: {} };
  const id = visitorId || createVisitorId();
  const now = Date.now();
  store.days[day].online[id] = {
    visitorId: id,
    userId: user?.userId || user?.id || null,
    username: user?.username || user?.email || null,
    lastSeenAt: new Date(now).toISOString(),
  };
  writeStore(store);
  return { visitorId: id, lastSeenAt: new Date(now).toISOString() };
}

function getTodayStats() {
  const store = readStore();
  cleanupOldDays(store);
  const day = todayKey();
  const current = store.days[day] || { total: 0, unique: 0, visitors: {}, events: [], online: {} };
  const cutoff = Date.now() - ONLINE_TTL_MS;
  const online = Object.values(current.online || {}).filter(item => Date.parse(item.lastSeenAt) >= cutoff);
  const visits = (Array.isArray(current.events) ? current.events : Object.values(current.visitors || {}).map(item => ({ ...item, visitedAt: item.lastVisitAt })))
    .map(item => ({ id: item.id || item.visitorId, username: item.username || null, userId: item.userId || null, visitedAt: item.visitedAt }))
    .sort((a, b) => Date.parse(b.visitedAt) - Date.parse(a.visitedAt));

  return {
    date: day,
    totalVisits: Number(current.total || 0),
    uniqueVisitors: Number(current.unique || 0),
    onlineCount: online.filter(item => item.userId).length,
    onlineUsers: online
      .filter(item => item.userId)
      .map(item => ({ userId: item.userId, username: item.username || 'کاربر', lastSeenAt: item.lastSeenAt }))
      .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt)),
    visits,
  };
}

module.exports = { recordVisit, heartbeat, getTodayStats, ONLINE_TTL_MS };