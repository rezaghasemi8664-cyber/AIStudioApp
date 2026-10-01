"use strict";

const prisma = require("../config/prisma.cjs");
const { jalaliToGregorianISO } = require("../utils/jalaliDate.cjs");

function parseJson(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? parsed
      : null;
  } catch {
    return null;
  }
}

function normalizeDate(value) {
  if (value == null) return null;
  const raw = String(value).trim().replace(/\//g, "-");
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!match) return null;

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  if (year >= 1900) {
    const iso = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
    const date = new Date(`${iso}T00:00:00.000Z`);
    if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== iso) {
      return null;
    }
    return { kind: "gregorian", source: raw, gregorian: iso, jalali: null };
  }

  if (year < 1200 || year > 1600 || month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }

  const jalali = `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
  const gregorian = jalaliToGregorianISO(jalali);
  if (!gregorian) return null;

  return { kind: "jalali", source: raw, gregorian, jalali };
}

function snapshotTime(value) {
  if (value == null) return "";
  const match = String(value).trim().match(/(\d{1,2}):(\d{2})(?::(\d{2}))?/);
  if (!match) return "";
  return [match[1].padStart(2, "0"), match[2], match[3] || "00"].join(":");
}

function getIndexData(payload) {
  if (!payload || typeof payload !== "object") return null;

  // Current MarketHistory format: { date, time, index, ... }
  if (
    payload.type !== "symbols" &&
    payload.date != null &&
    Number.isFinite(Number(payload.index))
  ) {
    return payload;
  }

  // Legacy format: { type: "index", data: { date, time, index, ... } }
  if (
    payload.type === "index" &&
    payload.data &&
    typeof payload.data === "object" &&
    !Array.isArray(payload.data) &&
    payload.data.date != null &&
    Number.isFinite(Number(payload.data.index))
  ) {
    return payload.data;
  }

  return null;
}

async function main() {
  const rows = await prisma.marketHistory.findMany({
    orderBy: { id: "asc" },
    select: { id: true, jsonData: true, createdAt: true, marketDate: true },
  });

  const byDay = new Map();
  const invalid = [];
  const ignoredNonIndex = [];
  const alreadyFilled = [];
  let validRows = 0;

  for (const row of rows) {
    const payload = parseJson(row.jsonData);
    const data = getIndexData(payload);

    if (!data) {
      ignoredNonIndex.push({
        id: row.id,
        type: payload?.type ?? null,
        reason: "not-index-snapshot",
      });
      continue;
    }

    const normalized = normalizeDate(data.date);
    if (!normalized) {
      invalid.push({
        id: row.id,
        date: data.date ?? null,
        time: data.time ?? null,
        reason: "invalid-date",
      });
      continue;
    }

    validRows += 1;
    if (row.marketDate) alreadyFilled.push(row.id);

    const current = {
      id: row.id,
      dateKind: normalized.kind,
      jalali: normalized.jalali,
      gregorian: normalized.gregorian,
      time: snapshotTime(data.time),
      createdAt: row.createdAt,
    };

    const list = byDay.get(normalized.gregorian) || [];
    list.push(current);
    byDay.set(normalized.gregorian, list);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([gregorian, list]) => {
      list.sort((a, b) => {
        const timeCompare = b.time.localeCompare(a.time);
        if (timeCompare !== 0) return timeCompare;
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      });

      const latest = list[0];
      return {
        marketDate: gregorian,
        jalaliDate: latest.jalali,
        sourceDateKind: latest.dateKind,
        rows: list.length,
        latestRowId: latest.id,
        latestBrsTime: latest.time || null,
      };
    });

  const duplicateRows = days.reduce((sum, day) => sum + Math.max(0, day.rows - 1), 0);

  console.log(JSON.stringify({
    mode: "DRY_RUN",
    totalRows: rows.length,
    validRows,
    ignoredNonIndexRows: ignoredNonIndex.length,
    invalidRows: invalid.length,
    uniqueTradingDays: days.length,
    duplicateRows,
    alreadyFilledRows: alreadyFilled.length,
    invalid,
    days,
  }, null, 2));

  if (invalid.length > 0) process.exitCode = 2;
}

main()
  .catch((error) => {
    console.error("[MARKET][BACKFILL][DRY_RUN] Failed:", error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
