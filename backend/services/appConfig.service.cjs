"use strict";

const { prisma } = require("./db.service.cjs");

let ioInstance = null;

/*
 =====================================
 ? Socket.IO injection (once, on boot)
 =====================================
*/
function setSocketIO(io) {
  ioInstance = io || null;
}

/*
 =====================================
 ? Internal helpers
 =====================================
*/
function safeStringify(value) {
  if (value === undefined) return null;

  // ??? string ??? ??? JSON ????? ??? ? ???? ?? ??? ???
  if (typeof value === "string") {
    try {
      JSON.parse(value);
      return value;
    } catch {
      return JSON.stringify(value);
    }
  }

  // object / array / number / boolean
  return JSON.stringify(value);
}

function safeParse(value) {
  if (value === null || value === undefined) return null;

  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}

/*
 =====================================
 ? Set / Update config
 =====================================
*/
async function setConfig(key, value, options = {}) {
  if (!key || typeof key !== "string") {
    throw new Error("Config key must be a non-empty string");
  }

  const jsonValue = safeStringify(value);

  const result = await prisma.appConfig.upsert({
    where: { key },
    update: { value: jsonValue },
    create: { key, value: jsonValue },
  });

  /*
   ===========================
   ? Real-time broadcast
   ===========================
  */
  if (ioInstance && !options.silent) {
    try {
      ioInstance.emit("config:update", {
        key,
        value: safeParse(jsonValue),
      });
    } catch (err) {
      console.warn("[CONFIG] Socket emit failed:", err.message);
    }
  }

  return {
    key: result.key,
    value: safeParse(result.value),
  };
}

/*
 =====================================
 ? Get all configs
 =====================================
*/
async function getAllConfigs() {
  const rows = await prisma.appConfig.findMany();
  const result = Object.create(null);

  for (const row of rows) {
    result[row.key] = safeParse(row.value);
  }

  return result;
}

module.exports = {
  setConfig,
  getAllConfigs,
  setSocketIO,
};
