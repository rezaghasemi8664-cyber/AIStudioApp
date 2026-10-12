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
    return { visits: Array.isArray(parsed.visits) ? parsed.visits : [], registrations: Array.isArray(parsed.registrations) ? parsed.registrations : [] };
  } catch {
    return { visits: [], registrations: [] };
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
  const store = readStore();
  store.visits.push({ id: crypto.randomBytes(12).toString('hex'), ...attribution, visitedAt: new Date().toISOString() });
  if (store.visits.length > MAX_EVENTS) store.visits = store.visits.slice(-MAX_EVENTS);
  writeStore(store);
  return { recorded: true };
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

function getReport() {
  const store = readStore();
  const channels = {};
  for (const content of ALLOWED_CONTENT) {
    const visits = store.visits.filter(item => item.content === content);
    const registrations = store.registrations.filter(item => item.content === content);
    channels[content] = {
      visits: visits.length,
      registrations: registrations.length,
      visitCount: visits.length,
      registrationCount: registrations.length,
      conversionRatePercent: visits.length ? Math.round((registrations.length / visits.length) * 10000) / 100 : 0,
      registrations: registrations.map(({ userId, registeredAt, source, medium, campaign, content: channel }) => ({ userId, registeredAt, source, medium, campaign, content: channel }))
    };
  }
  return { generatedAt: new Date().toISOString(), channels };
}

module.exports = { normalizeAttribution, recordVisit, recordRegistration, getReport };
