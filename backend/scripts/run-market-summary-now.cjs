/* eslint-disable no-console */
const path = require("path");

async function main() {
  try {
    const servicePath = path.resolve(__dirname, "..", "services", "marketSummary.service.cjs");
    const svc = require(servicePath);

    const candidateFns = [
      "findOrGenerateLatest",
      "generateDailySummary",
      "generateAndSaveMarketSummary",
      "runMarketSummaryJob",
      "createOrUpdateTodaySummary",
      "generateMarketSummary",
      "runNow"
    ];

    let selected = null;
    for (const fn of candidateFns) {
      if (typeof svc[fn] === "function") {
        selected = fn;
        break;
      }
    }

    if (!selected) {
      console.error("[RUNNER] No known exported generator function found.");
      console.error("[RUNNER] Available exports:", Object.keys(svc));
      process.exit(3);
    }

    console.log(`[RUNNER] Using function: ${selected}`);

    // چند مدل ورودی برای سازگاری با امضای تابع‌های مختلف
    let result;
    try {
      result = await svc[selected]({ forceRegenerate: true, reason: "manual-run" });
    } catch (e1) {
      try {
        result = await svc[selected](true);
      } catch (e2) {
        result = await svc[selected]();
      }
    }

    if (result && typeof result === "object") {
      const keys = Object.keys(result);
      console.log("[RUNNER] Result keys:", keys.join(", "));
      const preview = (result.summary || result.content || "").toString().slice(0, 200);
      if (preview) console.log("[RUNNER] Preview:", preview.replace(/\s+/g, " "));
    } else {
      console.log("[RUNNER] Result type:", typeof result);
    }

    console.log("[RUNNER] DONE");
    process.exit(0);
  } catch (err) {
    console.error("[RUNNER] ERROR:", err && err.stack ? err.stack : err);
    process.exit(1);
  }
}

main();
