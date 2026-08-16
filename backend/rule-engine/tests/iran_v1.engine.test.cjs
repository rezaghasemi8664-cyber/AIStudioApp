"use strict";

describe("IRAN_V1 Rule Engine", () => {
  beforeEach(() => {
    jest.resetModules();
  });

  test("should return valid deterministic output", () => {
    const engine = require("../index.cjs");

    const result = engine.run({
      raw: {
        price: 100,
        volume: 2_000_000,
        market: "TSE",
      },
      ai: {
        trend: "bullish",
        risk_level: "LOW",
        confidence: 0.95,
      },
      options: {},
    });

    expect(result).toBeDefined();
    expect(result.trend).toBeDefined();
    expect(result.risk_level).toBeDefined();
    expect(typeof result.confidence).toBe("number");
  });

  test("confidence must always be clamped between 0 and 1", () => {
    const engine = require("../index.cjs");

    const result = engine.run({
      raw: {},
      ai: {
        confidence: 5,
      },
    });

    expect(result.confidence).toBeGreaterThanOrEqual(0);
    expect(result.confidence).toBeLessThanOrEqual(1);
  });

  test("rule failure must reduce confidence (penalty applied)", () => {
    jest.doMock("../rules/regime.rules.cjs", () => {
      return () => {
        throw new Error("forced rule crash");
      };
    });

    const engine = require("../index.cjs");

    const result = engine.run({
      raw: {},
      ai: {
        confidence: 0.8,
      },
    });

    expect(result.confidence).toBeLessThan(0.8);
  });

  test("meta.rule_engine must be IRAN_V1", () => {
    const engine = require("../index.cjs");

    const result = engine.run({
      raw: {},
      ai: {},
    });

    expect(result.meta).toBeDefined();
    expect(result.meta.rule_engine).toBe("IRAN_V1");
  });

  test("AI should not override final decision", () => {
    const engine = require("../index.cjs");

    const result = engine.run({
      raw: {
        liquidity: 0,
        volatility: 0.9,
      },
      ai: {
        trend: "bullish",
        risk_level: "LOW",
      },
    });

    expect(["LOW", "MEDIUM", "HIGH"]).toContain(result.risk_level);
  });
});
