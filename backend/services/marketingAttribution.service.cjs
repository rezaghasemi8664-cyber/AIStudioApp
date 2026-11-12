'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const dataDir = path.join(__dirname, '..', 'data');
const filePath = path.join(dataDir, 'marketing-attribution.json');
const ALLOWED_CONTENT = new Set(['bursebazaar', 'arzonlineinfo', 'roniya']);
const MAX_EVENTS = 100000;
const AD_CAMPAIGN = 'roniya_ads';
const isDynamicContent = value => /^[a-f0-9]{16,32}$/.test(String(value || ''));

function normalizeAttribution(input) {
  if (!input || typeof input !== 'object') return null;
  const source = String(input.source || '').trim().slice(0, 100);
  const medium = String(input.medium || '').trim().slice(0, 100);
  const campaign = String(input.campaign || '').trim().slice(0, 100);
  const content = String(input.content || '').trim().slice(0, 100);
  const validSource = Boolean(source) && !/[|\u0000-\u001f\u007f]/.test(source);
  if (!validSource || medium !== 'paid') return null;
  // Keep legacy Telegram attribution backward-compatible; current ad slots may
  // come from any website or platform and are still isolated by utm_content.
  const isLegacyCampaign = campaign === 'roniya_oct2026' && source === 'telegram' && ALLOWED_CONTENT.has(content);
  const isAdCampaign = campaign === AD_CAMPAIGN && isDynamicContent(content);
  if (!isLegacyCampaign && !isAdCampaign) return null;
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
      landingPageViews: Array.isArray(parsed.landingPageViews) ? parsed.landingPageViews : (Array.isArray(parsed.clicks) ? parsed.clicks.map(item => ({ ...item, viewedAt: item.viewedAt || item.clickedAt })) : legacyClicks),
      ctaClicks: Array.isArray(parsed.ctaClicks) ? parsed.ctaClicks : [],
      loginPageViews: Array.isArray(parsed.loginPageViews) ? parsed.loginPageViews : [],
      signupClicks: Array.isArray(parsed.signupClicks) ? parsed.signupClicks : [],
      registrations: Array.isArray(parsed.registrations) ? parsed.registrations : [],
      purchases: Array.isArray(parsed.purchases) ? parsed.purchases : [],
      adCampaigns: Array.isArray(parsed.adCampaigns) ? parsed.adCampaigns : [],
      adCampaignSlots: Array.isArray(parsed.adCampaignSlots) ? parsed.adCampaignSlots : [],
      adCampaignArchives: Array.isArray(parsed.adCampaignArchives) ? parsed.adCampaignArchives : [],
    };
  } catch {
    return { visits: [], clicks: [], landingPageViews: [], ctaClicks: [], loginPageViews: [], signupClicks: [], registrations: [], purchases: [], adCampaigns: [], adCampaignSlots: [], adCampaignArchives: [] };
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
  store.landingPageViews.push({ id: crypto.randomBytes(12).toString('hex'), ...attribution, viewedAt: new Date().toISOString() });
  if (store.landingPageViews.length > MAX_EVENTS) store.landingPageViews = store.landingPageViews.slice(-MAX_EVENTS);
  writeStore(store);
  return { recorded: true, counted: false };
}

function recordEvent({ input, eventType }) {
  const attribution = normalizeAttribution(input);
  if (!attribution || !['cta_click', 'login_page_view', 'signup_click'].includes(eventType)) return { recorded: false };
  const store = readStore();
  const key = eventType === 'cta_click' ? 'ctaClicks' : eventType === 'login_page_view' ? 'loginPageViews' : 'signupClicks';
  store[key].push({
    id: crypto.randomBytes(12).toString('hex'),
    ...attribution,
    occurredAt: new Date().toISOString(),
  });
  if (store[key].length > MAX_EVENTS) store[key] = store[key].slice(-MAX_EVENTS);
  writeStore(store);
  return { recorded: true };
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
  const reportContentKeys = new Set([...ALLOWED_CONTENT, ...store.adCampaigns.map(item => item && item.id).filter(isDynamicContent), ...store.adCampaignSlots.map(item => item && item.content).filter(value => ALLOWED_CONTENT.has(value) || isDynamicContent(value))]);
  for (const content of reportContentKeys) {
    const visits = store.visits.filter(item => item.content === content && item.userId !== undefined && item.userId !== null);
    const clicks = store.clicks.filter(item => item.content === content);
    const landingPageViews = store.landingPageViews.filter(item => item.content === content);
    const ctaClicks = store.ctaClicks.filter(item => item.content === content);
    const loginPageViews = store.loginPageViews.filter(item => item.content === content);
    const signupClicks = store.signupClicks.filter(item => item.content === content);
    const registrations = store.registrations.filter(item => item.content === content);
    const purchases = store.purchases.filter(item => item.content === content);
    const revenueAmount = purchases.reduce((total, item) => total + Number(item.amount || 0), 0);
    channels[content] = {
      visits: visits.length, visitCount: visits.length, clickCount: clicks.length,
      landingPageViewCount: landingPageViews.length, ctaClickCount: ctaClicks.length, loginPageViewCount: loginPageViews.length,
      signupClickCount: signupClicks.length,
      registrationCount: registrations.length,
      conversionRatePercent: clicks.length ? Math.round((registrations.length / clicks.length) * 10000) / 100 : 0,
      paidPurchaseCount: purchases.length, revenueAmount,
      currency: purchases.find(item => item.currency)?.currency || 'IRR',
      recentRegistrations: registrations.slice(-100).map(({ userId, registeredAt, source, medium, campaign, content: channel }) => ({ userId, registeredAt, source, medium, campaign, content: channel })),
      recentPurchases: purchases.slice(-100).map(({ paymentId, userId, planId, amount, currency, refId, paidAt, content: channel }) => ({ paymentId, userId, planId, amount, currency, refId, paidAt, content: channel })),
      recentClicks: clicks.slice(-100).map(({ id, clickedAt, source, medium, campaign, content: channel }) => ({ id, clickedAt, source, medium, campaign, content: channel })),
      recentLandingPageViews: landingPageViews.slice(-100).map(({ id, viewedAt, source, medium, campaign, content: channel }) => ({ id, occurredAt: viewedAt, source, medium, campaign, content: channel })),
      recentCtaClicks: ctaClicks.slice(-100).map(({ id, occurredAt, source, medium, campaign, content: channel }) => ({ id, occurredAt, source, medium, campaign, content: channel })),
      recentLoginPageViews: loginPageViews.slice(-100).map(({ id, occurredAt, source, medium, campaign, content: channel }) => ({ id, occurredAt, source, medium, campaign, content: channel })),
      recentSignupClicks: signupClicks.slice(-100).map(({ id, occurredAt, source, medium, campaign, content: channel }) => ({ id, occurredAt, source, medium, campaign, content: channel }))
    };
  }
  return { generatedAt: new Date().toISOString(), channels };
}


function getAdCampaigns() {
  return readStore().adCampaigns
    .filter(item => item && isDynamicContent(item.id))
    .map(item => ({ id: item.id, name: String(item.name || ''), message: String(item.message || ''), createdAt: item.createdAt || null, updatedAt: item.updatedAt || null }));
}

function saveAdCampaign(input) {
  const name = String(input?.name || '').trim().slice(0, 120);
  const message = String(input?.message || '').trim().slice(0, 5000);
  const requestedId = String(input?.id || '').trim();
  if (!name) return { saved: false, reason: 'missing-name' };
  if (!message) return { saved: false, reason: 'missing-message' };
  if (requestedId && !isDynamicContent(requestedId)) return { saved: false, reason: 'invalid-id' };

  const store = readStore();
  const existingIndex = requestedId ? store.adCampaigns.findIndex(item => item && item.id === requestedId) : -1;
  const now = new Date().toISOString();
  const record = {
    id: existingIndex >= 0 ? requestedId : crypto.randomBytes(12).toString('hex'),
    name,
    message,
    createdAt: existingIndex >= 0 ? store.adCampaigns[existingIndex].createdAt || now : now,
    updatedAt: now,
  };
  if (existingIndex >= 0) store.adCampaigns[existingIndex] = record;
  else store.adCampaigns.push(record);
  writeStore(store);
  return { saved: true, campaign: record };
}


const DEFAULT_AD_SLOTS = [
  { slotId: 'slot1', name: 'کانال بورس‌بازار', content: 'bursebazaar' },
  { slotId: 'slot2', name: 'کانال ارزآنلاین', content: 'arzonlineinfo' },
  { slotId: 'slot3', name: 'کانال رونیا', content: 'roniya' },
  { slotId: 'slot4', name: 'جایگاه تبلیغاتی ۴', content: null },
  { slotId: 'slot5', name: 'جایگاه تبلیغاتی ۵', content: null },
];

function getAdCampaignSlots() {
  const store = readStore();
  const slots = DEFAULT_AD_SLOTS.map(defaultSlot => {
    const saved = store.adCampaignSlots.find(item => item && item.slotId === defaultSlot.slotId);
    return saved ? { ...defaultSlot, ...saved } : {
      ...defaultSlot,
      content: defaultSlot.content || crypto.randomBytes(12).toString('hex'),
      link: '',
      message: '',
      createdAt: null,
      updatedAt: null,
    };
  });
  return slots.map(({ slotId, name, content, link, message, createdAt, updatedAt }) =>
    ({ slotId, name, content, link: String(link || ''), message: String(message || ''), createdAt: createdAt || null, updatedAt: updatedAt || null }));
}

function saveAdCampaignSlot(input) {
  const slotId = String(input?.slotId || '');
  const name = String(input?.name || '').trim().slice(0, 120);
  const link = String(input?.link || '').trim().slice(0, 2048);
  const message = String(input?.message || '').trim().slice(0, 5000);
  if (!/^slot[1-5]$/.test(slotId)) return { saved: false, reason: 'invalid-slot' };
  // An empty name AND link explicitly deactivate a slot. Partial clearing is
  // rejected so an active slot can never be left in an ambiguous state.
  const clearing = !name && !link;
  if (!clearing && (!name || !link)) return { saved: false, reason: 'incomplete-slot' };
  let attribution = null;
  if (!clearing) {
    let parsed;
    try { parsed = new URL(link); } catch { return { saved: false, reason: 'invalid-link' }; }
    if (!['http:', 'https:'].includes(parsed.protocol)) return { saved: false, reason: 'invalid-link' };
    attribution = normalizeAttribution({
      source: parsed.searchParams.get('utm_source'),
      medium: parsed.searchParams.get('utm_medium'),
      campaign: parsed.searchParams.get('utm_campaign'),
      content: parsed.searchParams.get('utm_content'),
    });
    if (!attribution) return { saved: false, reason: 'invalid-attribution-link' };
  }

  const store = readStore();
  const slots = DEFAULT_AD_SLOTS.map(defaultSlot => {
    const saved = store.adCampaignSlots.find(item => item && item.slotId === defaultSlot.slotId);
    return saved ? { ...defaultSlot, ...saved } : { ...defaultSlot, content: defaultSlot.content || crypto.randomBytes(12).toString('hex'), link: '', message: '', createdAt: null, updatedAt: null };
  });
  const current = slots.find(item => item.slotId === slotId);
  if (!clearing && slots.some(item => item.slotId !== slotId && item.name && item.link && item.content === attribution.content)) return { saved: false, reason: 'duplicate-link' };
  const now = new Date().toISOString();
  const changedConfiguration = String(current.name || '') !== name || String(current.link || '') !== link || (!clearing && current.content !== attribution.content);
  if (changedConfiguration && (current.name || current.link || current.message)) {
    // Snapshot the old campaign before replacing/deactivating it. Always retain
    // a complete zero-valued report too, so the archive UI never renders blanks.
    const previousReport = getReport().channels[current.content] || {
      visits: 0, visitCount: 0, clickCount: 0, landingPageViewCount: 0, ctaClickCount: 0,
      loginPageViewCount: 0, signupClickCount: 0, registrationCount: 0, conversionRatePercent: 0,
      paidPurchaseCount: 0, revenueAmount: 0, currency: 'IRR', recentRegistrations: [], recentPurchases: [],
      recentClicks: [], recentLandingPageViews: [], recentCtaClicks: [], recentLoginPageViews: [], recentSignupClicks: [],
    };
    store.adCampaignArchives.push({
      id: crypto.randomBytes(12).toString('hex'),
      slotId,
      slotName: String(current.name || DEFAULT_AD_SLOTS.find(item => item.slotId === slotId)?.name || slotId),
      content: current.content,
      link: String(current.link || ''),
      message: String(current.message || ''),
      report: previousReport,
      archivedAt: now,
    });
  }
  const record = {
    slotId, name, content: clearing ? crypto.randomBytes(12).toString('hex') : attribution.content, link, message,
    createdAt: current.createdAt || now, updatedAt: now,
  };
  const existingIndex = store.adCampaignSlots.findIndex(item => item && item.slotId === slotId);
  if (existingIndex >= 0) store.adCampaignSlots[existingIndex] = record;
  else store.adCampaignSlots.push(record);
  writeStore(store);
  return { saved: true, slot: record, archived: changedConfiguration, cleared: clearing };
}

function getAdCampaignArchives() {
  return readStore().adCampaignArchives
    .slice()
    .sort((a, b) => String(b.archivedAt).localeCompare(String(a.archivedAt)));
}

function deleteAdCampaignArchive(archiveId) {
  const id = String(archiveId || '');
  if (!id) return { deleted: false };
  const store = readStore();
  const before = store.adCampaignArchives.length;
  store.adCampaignArchives = store.adCampaignArchives.filter(item => item && item.id !== id);
  if (store.adCampaignArchives.length === before) return { deleted: false };
  writeStore(store);
  return { deleted: true };
}

module.exports = { getAdCampaignSlots, saveAdCampaignSlot, getAdCampaignArchives, deleteAdCampaignArchive, normalizeAttribution, recordVisit, recordEvent, recordAuthenticatedVisit, recordRegistration, recordPurchase, getReport, getAdCampaigns, saveAdCampaign };
