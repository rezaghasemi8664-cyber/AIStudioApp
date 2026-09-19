"use strict";

const path = require("path");
require("dotenv").config({
  path: path.resolve(__dirname, "..", ".env"),
});

const prisma = require("../config/prisma.cjs");

/* ===============================
   Environment validation
================================ */

if (!process.env.DATABASE_URL) {
  console.error("? DATABASE_URL is not set");
  process.exit(1);
}


/* ===============================
   Helpers
================================ */

function toSafeJson(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch (e) {
    return String(value);
  }
}

/* ===============================
   DB API (Facade)
================================ */

/**
 * Save final AI analysis
 * Maps cleanly to AnalysisHistory table
 */
async function saveAnalysis({
  userId = null,
  keyId = null,
  symbol,
  inputPayload,
  aiResponse,
}) {
  try {
    if (!symbol || typeof symbol !== "string") {
      throw new Error("Invalid symbol");
    }

    const resultJson = toSafeJson({
      keyId,
      input: inputPayload,
      output: aiResponse,
    });

    const record = await prisma.analysisHistory.create({
      data: {
        userId,
        stock: symbol,
        resultJson,
      },
    });

    return record;
  } catch (err) {
    console.error("? saveAnalysis failed", {
      message: err.message,
      stack: err.stack,
      symbol,
      keyId,
      userId,
      aiResponseType: typeof aiResponse,
    });

    // ? controller already handles non-persist case
    return null;
  }
}

/**
 * Raw fetch not implemented yet
 * Stub preserved to avoid runtime crash
 */
async function saveRawFetch() {
  return null;
}

/* ===============================
   Exports
================================ */

module.exports = {
  prisma,
  userPreference: prisma.userPreference,
  saveAnalysis,
  saveRawFetch,
};


