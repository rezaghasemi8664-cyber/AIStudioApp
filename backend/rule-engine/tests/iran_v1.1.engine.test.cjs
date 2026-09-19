"use strict";

/**
 * IRAN_V1.1 Rule Engine Tests
 * --------------------------------
 * - Contract-compatible with IRAN_V1
 * - Adds regression guarantees vs V1
 * - Snapshot-locks new behavior
 */

describe("IRAN_V1.1 Rule Engine", () => {
  let engineV1;
  let engineV11;

  beforeAll(() => {
    engineV1 = require("../index.cjs");        // IRAN_V1
    engineV11 = require("../index.v1_1.cjs");  // IRAN_V1.1
  });

  /* ============================
     Contract / Schema Tests
  ============================ */

  test("must produce schema-locked output", () => {
    const result = engineV11.run({
      raw: {
        price: 120,
        volume: 1_500_000,
      },
      ai: {
        confidence: 0.9,
      },
    });

    expect(result).toHaveProperty("risk_level");
    expect(result).toHaveProperty("trend");
    expect(result).toHaveProperty("confidence");

    expect(["LOW", "MEDIUM", "HIGH"]).toContain(result.risk_level);
    expect(["bullish", "bearish", "neutral"]).toContain(result.trend);

    expect(result.meta).toBeDefined();
    expect(result.meta.rule_engine).toBe("IRAN_V1.1");
  });

  test("confidence must always stay within [0,1]", () => {
    const result = engineV11.run({
      raw: {},
      ai: {
        confidence: 5, // intentionally invalid
      },
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test("engine must be deterministic", () => {
    const input = {
      raw: {
        rsi: 72,
        liquidity: 0.35,
        volatility: 0.6,
      },
      ai: {
        confidence: 0.75,
      },
    };

    const r1 = engineV11.run(input);
    const r2 = engineV11.run(input);

    expect(r1).toEqual(r2);
  });

  /* ============================
     Regression vs IRAN_V1
  ============================ */

  test("V1.1 confidence must not increase compared to V1 for same input", () => {
    const payload = {
      raw: {
        liquidity: 0.25,
        volatility: 0.85,
        rsi: 78,
      },
      ai: {
        confidence: 0.88,
      },
    };

    const v1 = engineV1.run(payload);
    const v11 = engineV11.run(payload);

    expect(v11.confidence).toBeLessThanOrEqual(v1.confidence);
  });

  /* ============================
     Snapshot Lock (Baseline)
  ============================ */

  test("snapshot: IRAN_V1.1 baseline output", () => {
    const result = engineV11.run({
      raw: {
        price: 95,
        volume: 900_000,
        liquidity: 0.4,
        volatility: 0.65,
        rsi: 68,
      },
      ai: {
        trend: "bullish",
        confidence: 0.9,
      },
    });

    expect(result).toMatchSnapshot();
  });
});
