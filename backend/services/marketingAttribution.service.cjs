'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');
const filePath = path.join(dataDir, 'marketing-attribution.json');
const ALLOWED_CONTENT = new Set(['bursebazaar', 'arzonlineinfo']);
const MAX_EVENTS = 100000;

function normalizeAttribution(input) {
  if (!input || typeof input !== 'object') return null;
  const source = String(input.source || '').trim().slice(0, 100);
  const medium = String(input.medium || '').trim().slice(0, 100);
  const campaign = String(input.campaign || '').trim().slice(0, 100);
  const content = String(input.content || '').trim().slice(0, 100);
  if (source !== 'telegram' || medium !== 'paid' || campaign !== 'roniya_oct2026' || !ALLOWED_CONTENT.has(content)) return null;
  return { source, medium, campaign, content };
}

function readStore() {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(filePath)) fs.writeFileSync(filePath, JSON.stringify({ visits: [], registrations: [] }, null, 2), 'utf8');
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const legacyVisits = Array.isArray(parsed.visits) ? parsed.visits : [];
    // Older versions counted every landing-page click as a visit. Keep those as clicks,
    // and only retain visits linked to a registered user who successfully logged in.
    const visits = legacyVisits.filter(item => item && item.userId !== undefined && item.userId !== null);
    const legacyClicks = legacyVisits.filter(item => !item || item.userId === undefined || item.userId === null);
    return {
      visits,
      clicks: Array.isArray(parsed.clicks) ? parsed.clicks : legacyClicks,
      registrations: Array.isArray(parsed.registrations) ? parsed.registrations : [],
      purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
    };
  } catch {
    return { visits: [], clicks: [], registrations: [], purchases: [] };
  }
}

function writeStore(store) {
  if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
  const temp = filePath + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(temp, filePath);
}

function recordVisit(input) {
  const attribution = normalizeAttribution(input);
  if (!attribution) return { recorded: false };
  // A landing-page hit is a click, not a qualified visit. It must not inflate
  // the visitor count until this attributed registrant successfully logs in.
  const store = readStore();
  store.clicks.push({ id: crypto.randomBytes(12).toString('hex'), ...attribution, clickedAt: new Date().toISOString() });
  if (store.clicks.length > MAX_EVENTS) store.clicks = store.clicks.slice(-MAX_EVENTS);
  writeStore(store);
  return { recorded: true, counted: false };
}

function recordAuthenticatedVisit({ userId }) {
  if (userId === undefined || userId === null) return { recorded: false, reason: 'missing-identity' };
  const store = readStore();
  const key = String(userId);
  const registration = store.registrations.find(item => String(item.userId) === key);
  if (!registration) return { recorded: false, reason: 'no-attribution' };
  if (store.visits.some(item => String(item.userId) === key)) return { recorded: false, reason: 'already-counted' };

  store.visits.push({
    id: crypto.randomBytes(12).toString('hex'),
    userId,
    source: registration.source,
    medium: registration.medium,
    campaign: registration.campaign,
    content: registration.content,
    visitedAt: new Date().toISOString(),
  });
  if (store.visits.length > MAX_EVENTS) store.visits = store.visits.slice(-MAX_EVENTS);
  writeStore(store);
  return { recorded: true, counted: true };
}

function recordRegistration({ userId, input }) {
  const attribution = normalizeAttribution(input);
  if (!attribution || userId === undefined || userId === null) return { recorded: false };
  const store = readStore();
  const key = String(userId);
  const existing = store.registrations.findIndex(item => String(item.userId) === key);
  const record = { userId, ...attribution, registeredAt: new Date().toISOString() };
  if (existing >= 0) store.registrations[existing] = record;
  else store.registrations.push(record);
  if (store.registrations.length > MAX_EVENTS) store.registrations = store.registrations.slice(-MAX_EVENTS);
  writeStore(store);
  return { recorded: true };
}

function recordPurchase({ userId, paymentId, amount, currency = 'IRR', paidAt, planId, refId }) {
  if (userId === undefined || userId === null || paymentId === undefined || paymentId === null) return { recorded: false, reason: 'missing-identity' };
  const normalizedAmount = Number(amount);
  if (!Number.isSafeInteger(normalizedAmount) || normalizedAmount <= 0) return { recorded: false, reason: 'invalid-amount' };
  const store = readStore();
  const registration = store.registrations.find(item => String(item.userId) === String(userId));
  if (!registration) return { recorded: false, reason: 'no-attribution' };
  const key = String(paymentId);
  const existing = store.purchases.findIndex(item => String(item.paymentId) === key);
  const record = { paymentId: key, userId, planId: planId == null ? null : Number(planId), amount: normalizedAmount, currency: String(currency || 'IRR').slice(0, 10), refId: refId == null ? null : String(refId).slice(0, 100), paidAt: paidAt ? new Date(paidAt).toISOString() : new Date().toISOString(), source: registration.source, medium: registration.medium, campaign: registration.campaign, content: registration.content };
  if (existing >= 0) store.purchases[existing] = record; else store.purchases.push(record);
  if (store.purchases.length > MAX_EVENTS) store.purchases = store.purchases.slice(-MAX_EVENTS);
  writeStore(store);
  return { recorded: true };
}
function getReport() {
  const store = readStore();
  const channels = {};
  for (const content of ALLOWED_CONTENT) {
    const visits = store.visits.filter(item => item.content === content && item.userId !== undefined && item.userId !== null);
    const clicks = store.clicks.filter(item => item.content === content);
    const registrations = store.registrations.filter(item => item.content === content);
    const purchases = store.purchases.filter(item => item.content === content);
    const revenueAmount = purchases.reduce((total, item) => total + Number(item.amount || 0), 0);
    channels[content] = {
      visits: visits.length, registrationCount: registrations.length, visitCount: visits.length,
      conversionRatePercent: clicks.length ? Math.round((registrations.length / clicks.length) * 10000) / 100 : 0,
      paidPurchaseCount: purchases.length, revenueAmount,
      currency: purchases.find(item => item.currency)?.currency || 'IRR',
      recentRegistrations: registrations.slice(-100).map(({ userId, registeredAt, source, medium, campaign, content: channel }) => ({ userId, registeredAt, source, medium, campaign, content: channel })),
      recentPurchases: purchases.slice(-100).map(({ paymentId, userId, planId, amount, currency, refId, paidAt, content: channel }) => ({ paymentId, userId, planId, amount, currency, refId, paidAt, content: channel }))
    };
  }
  return { generatedAt: new Date().toISOString(), channels };
}

module.exports = { normalizeAttribution, recordVisit, recordAuthenticatedVisit, recordRegistration, recordPurchase, getReport };
