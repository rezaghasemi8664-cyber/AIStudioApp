'use strict';

const cron = require('node-cron');
const prisma = require('../config/prisma.cjs');
const centralCache = require('./centralMarketCache.service.cjs');

const CACHE_KEY = 'commodity:snapshot:active';
const API_URL = 'https://Api.BrsApi.ir/Market/Commodity.php';
let refreshRunning = false;
let task = null;
let ioRef = null;

function apiKey() {
  return String(process.env.BRS_COMMODITY_API_KEY || process.env.BRS_API_KEY || '').trim();
}

function normalizePayload(payload) {
  const root = payload && typeof payload === 'object' && payload.data && typeof payload.data === 'object'
    ? payload.data : payload;
  const groups = {
    metal_precious: Array.isArray(root?.metal_precious) ? root.metal_precious : [],
    metal_base: Array.isArray(root?.metal_base) ? root.metal_base : [],
    energy: Array.isArray(root?.energy) ? root.energy : []
  };
  const count = groups.metal_precious.length + groups.metal_base.length + groups.energy.length;
  if (count < 10 || !groups.metal_precious.length || !groups.metal_base.length || !groups.energy.length) {
    throw new Error('Commodity API returned incomplete group data.');
  }
  for (const [group, rows] of Object.entries(groups)) {
    groups[group] = rows.filter(row => row && typeof row === 'object' && row.symbol && row.name &&
      Number.isFinite(Number(row.price))).map(row => ({
        date: row.date || null,
        time: row.time || null,
        time_unix: Number.isFinite(Number(row.time_unix)) ? Number(row.time_unix) : null,
        symbol: String(row.symbol),
        name: String(row.name),
        price: Number(row.price),
        change_value: Number.isFinite(Number(row.change_value)) ? Number(row.change_value) : null,
        change_percent: Number.isFinite(Number(row.change_percent)) ? Number(row.change_percent) : null,
        unit: String(row.unit || 'دلار')
      }));
  }
  const normalizedCount = groups.metal_precious.length + groups.metal_base.length + groups.energy.length;
  if (normalizedCount < 10) throw new Error('Commodity API data failed validation.');
  return groups;
}

async function readSnapshotFromDatabase() {
  const rows = await prisma.$queryRaw`SELECT TOP (1) snapshotJson, fetchedAt FROM dbo.CommoditySnapshot WHERE id = 1`;
  if (!rows.length || !rows[0].snapshotJson) return null;
  const snapshot = JSON.parse(rows[0].snapshotJson);
  if (!snapshot || !snapshot.groups) return null;
  snapshot.fetchedAt = rows[0].fetchedAt || snapshot.fetchedAt;
  return snapshot;
}

async function restoreCache() {
  const cached = centralCache.get(CACHE_KEY);
  if (cached) return cached;
  const snapshot = await readSnapshotFromDatabase();
  if (snapshot) centralCache.set(CACHE_KEY, snapshot);
  return snapshot;
}

async function refreshSnapshot({ reason = 'scheduled' } = {}) {
  if (refreshRunning) return { success: false, skipped: true, reason: 'ALREADY_RUNNING' };
  refreshRunning = true;
  try {
    const key = apiKey();
    if (!key) throw new Error('BRS_COMMODITY_API_KEY (or BRS_API_KEY) is not configured.');
    const url = new URL(API_URL);
    url.searchParams.set('key', key);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);
    let response;
    try {
      response = await fetch(url, { headers: { Accept: 'application/json' }, signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    if (!response.ok) throw new Error('Commodity API HTTP ' + response.status);
    const payload = await response.json();
    const groups = normalizePayload(payload);
    const fetchedAt = new Date().toISOString();
    const snapshot = { groups, fetchedAt, source: 'BRSAPI', reason };

    // The singleton primary key guarantees exactly one active snapshot.
    // Transaction commits before cache replacement or notification.
    await prisma.$transaction(async tx => {
      await tx.$executeRaw`MERGE dbo.CommoditySnapshot AS target
        USING (SELECT CAST(1 AS tinyint) AS id) AS source
        ON target.id = source.id
        WHEN MATCHED THEN UPDATE SET snapshotJson = ${JSON.stringify(snapshot)}, fetchedAt = SYSUTCDATETIME()
        WHEN NOT MATCHED THEN INSERT (id, snapshotJson, fetchedAt)
          VALUES (1, ${JSON.stringify(snapshot)}, SYSUTCDATETIME());`;
    });

    centralCache.set(CACHE_KEY, snapshot);
    const io = ioRef || global.io;
    if (io && typeof io.emit === 'function') io.emit('commodity:snapshot:updated', { snapshot });
    console.log('[COMMODITY SNAPSHOT] Updated; rows=' +
      (groups.metal_precious.length + groups.metal_base.length + groups.energy.length));
    return { success: true, snapshot };
  } catch (error) {
    console.error('[COMMODITY SNAPSHOT] Refresh failed; retaining previous snapshot/cache:', error.message);
    return { success: false, error: error.message };
  } finally {
    refreshRunning = false;
  }
}

function getCachedSnapshot() {
  return centralCache.get(CACHE_KEY);
}

function startCommoditySnapshotCron(io) {
  ioRef = io || ioRef;
  if (task) return task;
  // Hydrate the process-local cache from the latest persisted snapshot, then
  // make an initial refresh. User-facing reads never query SQL Server.
  restoreCache().catch(error => console.error('[COMMODITY SNAPSHOT] Cache restore failed:', error.message))
    .finally(() => refreshSnapshot({ reason: 'startup' }));
  task = cron.schedule('*/5 * * * *', () => {
    refreshSnapshot({ reason: 'scheduled' });
  }, { timezone: 'Asia/Tehran' });
  return task;
}

function stopCommoditySnapshotCron() {
  if (task) task.stop();
  task = null;
}

module.exports = { refreshSnapshot, getCachedSnapshot, restoreCache, startCommoditySnapshotCron, stopCommoditySnapshotCron };
