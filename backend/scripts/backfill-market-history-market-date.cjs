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

function normalizeJalaliDate(value) {
  if (value == null) return null;
  const raw = String(value).trim().replace(/\//g, "-");
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(raw);
  if (!match) return null;
  return `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
}

function snapshotTime(value) {
  if (value == null) return "";
  const raw = String(value).trim();
  const match = /(\d{1,2}):(\d{2})(?::(\d{2}))?/.exec(raw);
  if (!match) return "";
  return [match[1].padStart(2, "0"), match[2], match[3] || "00"].join(":");
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
    const data = payload?.data;
    const isIndexSnapshot =
      payload?.type === "index" &&
      data &&
      typeof data === "object" &&
      !Array.isArray(data);

    if (!isIndexSnapshot) {
      ignoredNonIndex.push({
        id: row.id,
        type: payload?.type ?? null,
        reason: "not-index-snapshot",
      });
      continue;
    }

    const jalali = normalizeJalaliDate(data.date);
    const gregorian = jalali ? jalaliToGregorianISO(jalali) : null;

    if (!gregorian) {
      invalid.push({
        id: row.id,
        date: data.date ?? null,
        time: data.time ?? null,
        reason: data.date ? "invalid-jalali-date" : "missing-date",
      });
      continue;
    }

    validRows += 1;
    if (row.marketDate) alreadyFilled.push(row.id);

    const time = snapshotTime(data.time);
    const current = { id: row.id, jalali, gregorian, time, createdAt: row.createdAt };
    const list = byDay.get(gregorian) || [];
    list.push(current);
    byDay.set(gregorian, list);
  }

  const days = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([gregorian, list]) => {
      list.sort((a, b) => {
        const timeCompare = b.time.localeCompare(a.time);
        if (timeCompare !== 0) return timeCompare;
        return new Date(b.createdAt || 0).getTime() -
          new Date(a.createdAt || 0).getTime();
      });
      const latest = list[0];
      return {
        marketDate: gregorian,
        jalaliDate: latest.jalali,
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
    ignoredNonIndex,
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
