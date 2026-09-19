// backend/controllers/marketHistory.controller.cjs - Production Ready v2.0
"use strict";

const marketService = require("../services/marketHistory.service.cjs");

/* ===================================================
   CONSTANTS
=================================================== */

const DEFAULT_DAILY_LIMIT = 30;
const DEFAULT_SYMBOL_LIMIT = 60;

/* ===================================================
   GET SERVICE STATUS
=================================================== */

async function getStatus(req, res, next) {
  try {
    let brsAvailable = false;
    let dbConnected = false;
    let symbolCount = 0;

    try {
      // ????? ????? ???????
      if (typeof marketService.getDailyHistory === "function") {
        const test = await marketService.getDailyHistory(1);
        dbConnected = Array.isArray(test);
      }
    } catch (_) {
      dbConnected = false;
    }

    try {
      // ????? BRS API
      if (typeof marketService.fetchAllSymbols === "function") {
        const symbols = await marketService.fetchAllSymbols();
        brsAvailable = Array.isArray(symbols) && symbols.length > 0;
        symbolCount = symbols?.length || 0;
      }
    } catch (_) {
      brsAvailable = false;
    }

    return res.status(200).json({
      ok: true,
      status: {
        database: dbConnected ? "connected" : "disconnected",
        brsApi: brsAvailable ? "available" : "unavailable",
        symbolCount,
        timestamp: new Date().toISOString(),
      },
    });
  } catch (err) {
    console.error("[MARKET][STATUS]", err);
    return next(err);
  }
}

/* ===================================================
   GET SYMBOLS LIST
=================================================== */

async function getSymbols(req, res, next) {
  try {
    let symbols = [];

    // ??? ??? ?? ?? BRS API ?????
    if (typeof marketService.fetchAllSymbols === "function") {
      try {
        symbols = await marketService.fetchAllSymbols();
      } catch (apiErr) {
        console.warn("[MARKET][SYMBOLS] BRS API failed, falling back to DB:", apiErr.message);
      }
    }

    // ??? ?? API ?????? ?? ?? ??????? ?????
    if (!Array.isArray(symbols) || symbols.length === 0) {
      if (typeof marketService.getCachedSymbols === "function") {
        try {
          symbols = await marketService.getCachedSymbols();
        } catch (dbErr) {
          console.warn("[MARKET][SYMBOLS] DB cache also failed:", dbErr.message);
        }
      }
    }

    return res.status(200).json({
      ok: true,
      count: Array.isArray(symbols) ? symbols.length : 0,
      symbols: Array.isArray(symbols) ? symbols : [],
    });
  } catch (err) {
    console.error("[MARKET][GET_SYMBOLS]", err);
    return next(err);
  }
}

/* ===================================================
   GET MARKET INDEX
=================================================== */

async function getIndex(req, res, next) {
  try {
    let indexData = null;

    if (typeof marketService.fetchIndex === "function") {
      try {
        indexData = await marketService.fetchIndex();
      } catch (apiErr) {
        console.warn("[MARKET][INDEX] BRS API failed:", apiErr.message);
      }
    }

    // Fallback: ????? ????? ?? MarketHistory
    if (!indexData && typeof marketService.getLatestMarketHistory === "function") {
      try {
        indexData = await marketService.getLatestMarketHistory();
      } catch (dbErr) {
        console.warn("[MARKET][INDEX] DB fallback also failed:", dbErr.message);
      }
    }

    return res.status(200).json({
      ok: true,
      index: indexData || null,
    });
  } catch (err) {
    console.error("[MARKET][GET_INDEX]", err);
    return next(err);
  }
}

/* ===================================================
   GET SYMBOL DETAIL
=================================================== */

async function getSymbolDetail(req, res, next) {
  try {
    const { name } = req.params;

    if (!name || typeof name !== "string") {
      return res.status(400).json({
        ok: false,
        error: "??????? name ?????? ???.",
      });
    }

    const normalizedName = name.trim();
    let detail = null;

    if (typeof marketService.fetchSymbolDetail === "function") {
      try {
        detail = await marketService.fetchSymbolDetail(normalizedName);
      } catch (apiErr) {
        console.warn(`[MARKET][SYMBOL_DETAIL] API failed for ${normalizedName}:`, apiErr.message);
      }
    }

    // Fallback: ?? MarketDaily ????? ?????
    if (!detail && typeof marketService.getSymbolDaily === "function") {
      try {
        const history = await marketService.getSymbolDaily(normalizedName.toUpperCase(), 1);
        if (Array.isArray(history) && history.length > 0) {
          detail = {
            symbol: normalizedName,
            lastData: history[0],
            source: "database_cache",
          };
        }
      } catch (dbErr) {
        console.warn(`[MARKET][SYMBOL_DETAIL] DB fallback failed for ${normalizedName}:`, dbErr.message);
      }
    }

    if (!detail) {
      return res.status(404).json({
        ok: false,
        error: `???????? ???? ???? "${normalizedName}" ???? ???.`,
      });
    }

    return res.status(200).json({
      ok: true,
      detail,
    });
  } catch (err) {
    console.error("[MARKET][SYMBOL_DETAIL]", err);
    return next(err);
  }
}

/* ===================================================
   GET SYMBOL HISTORY (dedicated endpoint)
=================================================== */

async function getSymbolHistory(req, res, next) {
  try {
    const { name } = req.params;

    if (!name || typeof name !== "string") {
      return res.status(400).json({
        ok: false,
        error: "??????? name ?????? ???.",
      });
    }

    const normalizedSymbol = name.trim().toUpperCase();
    const limit = Number(req.query?.limit) || DEFAULT_SYMBOL_LIMIT;

    const items = await marketService.getSymbolDaily(normalizedSymbol, limit);

    return res.status(200).json({
      ok: true,
      symbol: normalizedSymbol,
      count: Array.isArray(items) ? items.length : 0,
      items: Array.isArray(items) ? items : [],
    });
  } catch (err) {
    console.error("[MARKET][SYMBOL_HISTORY]", err);
    return next(err);
  }
}

/* ===================================================
   FETCH DAILY FROM EXTERNAL API (CRON / MANUAL) — Admin Only
=================================================== */

async function fetchDaily(req, res, next) {
  try {
    const data = await marketService.fetchDailyFromAPI();

    if (!Array.isArray(data) || data.length === 0) {
      const err = new Error("Invalid or empty market data");
      err.status = 502;
      err.publicMessage = "Market data provider returned no data";
      throw err;
    }

    const savedCount = await marketService.saveMarketDaily(data);

    return res.status(200).json({
      ok: true,
      saved: savedCount,
      message: `${savedCount} ????? ?? ?????? ????? ??.`,
    });
  } catch (err) {
    console.error("[MARKET][FETCH_DAILY]", err);
    return next(err);
  }
}

/* ===================================================
   FETCH SYMBOLS FROM BRS API — Admin Only
=================================================== */

async function fetchSymbols(req, res, next) {
  try {
    if (typeof marketService.fetchAllSymbols !== "function") {
      return res.status(501).json({
        ok: false,
        error: "????? ?????? ?????? ?????????? ???? ???.",
      });
    }

    const symbols = await marketService.fetchAllSymbols();

    // ??? ????? ????? ?? ????? ????? ??
    if (typeof marketService.cacheSymbols === "function" && Array.isArray(symbols)) {
      await marketService.cacheSymbols(symbols);
    }

    return res.status(200).json({
      ok: true,
      count: Array.isArray(symbols) ? symbols.length : 0,
      symbols: Array.isArray(symbols) ? symbols : [],
    });
  } catch (err) {
    console.error("[MARKET][FETCH_SYMBOLS]", err);
    return next(err);
  }
}

/* ===================================================
   FETCH INDEX DATA FROM BRS API — Admin Only
=================================================== */

async function fetchIndexData(req, res, next) {
  try {
    if (typeof marketService.fetchIndex !== "function") {
      return res.status(501).json({
        ok: false,
        error: "????? ?????? ???? ?????????? ???? ???.",
      });
    }

    const indexData = await marketService.fetchIndex();

    return res.status(200).json({
      ok: true,
      index: indexData || null,
    });
  } catch (err) {
    console.error("[MARKET][FETCH_INDEX]", err);
    return next(err);
  }
}

/* ===================================================
   GET MARKET DAILY HISTORY
=================================================== */

async function getDaily(req, res, next) {
  try {
    const limit = Number(req.query?.limit) || DEFAULT_DAILY_LIMIT;

    const items = await marketService.getDailyHistory(limit);

    return res.status(200).json({
      ok: true,
      count: Array.isArray(items) ? items.length : 0,
      items: Array.isArray(items) ? items : [],
    });
  } catch (err) {
    console.error("[MARKET][GET_DAILY]", err);
    return next(err);
  }
}

/* ===================================================
   GET SYMBOL DAILY HISTORY (legacy route)
=================================================== */

async function getSymbolDaily(req, res, next) {
  try {
    const { symbol } = req.params;

    if (!symbol || typeof symbol !== "string") {
      const err = new Error("Symbol param is required");
      err.status = 400;
      err.publicMessage = "Symbol parameter is missing or invalid";
      throw err;
    }

    const normalizedSymbol = symbol.trim().toUpperCase();

    if (!normalizedSymbol) {
      const err = new Error("Invalid symbol");
      err.status = 400;
      err.publicMessage = "Symbol must not be empty";
      throw err;
    }

    const limit = Number(req.query?.limit) || DEFAULT_SYMBOL_LIMIT;

    const items = await marketService.getSymbolDaily(normalizedSymbol, limit);

    return res.status(200).json({
      ok: true,
      symbol: normalizedSymbol,
      count: Array.isArray(items) ? items.length : 0,
      items: Array.isArray(items) ? items : [],
    });
  } catch (err) {
    console.error("[MARKET][GET_SYMBOL_DAILY]", err);
    return next(err);
  }
}

/* ===================================================
   RUN MARKET AI ANALYSIS — Admin Only
=================================================== */

async function runAI(req, res, next) {
  try {
    const result = await marketService.runMarketAI();

    return res.status(200).json({
      ok: true,
      result,
    });
  } catch (err) {
    console.error("[MARKET][RUN_AI]", err);
    return next(err);
  }
}

/* ===================================================
   EXPORTS
=================================================== */

module.exports = {
  // === Public endpoints ===
  getStatus,
  getSymbols,
  getIndex,
  getDaily,
  getSymbolDaily,
  getSymbolDetail,
  getSymbolHistory,

  // === Admin endpoints ===
  fetchDaily,
  fetchSymbols,
  fetchIndexData,
  runAI,
};
