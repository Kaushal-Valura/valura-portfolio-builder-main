import test from "node:test";
import assert from "node:assert/strict";
import { calculateScenarioEngine, type ScenarioEngineInput } from "./scenario-engine";

const base: ScenarioEngineInput = {
  asOf: "2026-10-16",
  housePrior: { base: 0.55, bull: 0.2, bear: 0.15, tail: 0.1 },
  evidenceWeight: 0.6,
  freshnessHalfLifeDays: 45,
  signals: [
    { name: "Fresh market signal", family: "Prediction market", observedAt: "2026-10-16", reliability: 5,
      probabilities: { base: 0.5, bull: 0.2, bear: 0.2, tail: 0.1 } },
    { name: "Old options signal", family: "Options-implied", observedAt: "2026-09-01", reliability: 3,
      probabilities: { base: 0.6, bull: 0.1, bear: 0.2, tail: 0.1 } },
    { name: "", family: "Survey", observedAt: "2026-10-16", reliability: 5,
      probabilities: { base: 0.25, bull: 0.25, bear: 0.25, tail: 0.25 } },
    { name: "Invalid distribution", family: "Survey", observedAt: "2026-10-16", reliability: 5,
      probabilities: { base: 0.4, bull: 0.2, bear: 0.2, tail: 0.1 } },
  ],
  scenarioReturns: { base: 0.08, bull: 0.18, bear: -0.12, tail: -0.3 },
  portfolioValue: 1_000_000,
  calibration: [
    { statement: "Forecast A", probability: 0.65, outcome: 1 },
    { statement: "Forecast B", probability: 0.32, outcome: 0 },
  ],
};

test("uses reliability multiplied by exponential freshness decay", () => {
  const result = calculateScenarioEngine(base);
  assert.equal(result.signals[0].effectiveWeight, 5);
  assert.ok(Math.abs(result.signals[1].freshnessWeight - Math.pow(0.5, 45 / 45)) < 1e-12);
  assert.equal(result.signals[1].effectiveWeight, 1.5);
  assert.equal(result.signals[2].effectiveWeight, 0);
  assert.equal(result.signals[3].effectiveWeight, 0);
});

test("blends weighted evidence with house prior and normalises final probabilities", () => {
  const result = calculateScenarioEngine(base);
  const total = Object.values(result.finalProbabilities).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 1e-12);
  assert.ok(result.finalProbabilities.base > 0);
  assert.equal(result.signalsUpdatedLast30Days, 2);
});

test("falls back to house prior when no valid evidence exists", () => {
  const input = { ...base, signals: [] };
  const result = calculateScenarioEngine(input);
  assert.deepEqual(result.evidenceBlend, base.housePrior);
  assert.deepEqual(result.finalProbabilities, base.housePrior);
  assert.equal(result.totalEffectiveWeight, 0);
  assert.deepEqual(result.disagreement, { base: 0, bull: 0, bear: 0, tail: 0 });
});

test("calculates portfolio return ranges and Brier calibration score", () => {
  const result = calculateScenarioEngine(base);
  assert.ok(result.expected12MonthReturn);
  assert.equal(result.projectedPortfolioValue?.central,
    1_000_000 * (1 + result.expected12MonthReturn!.central));
  assert.equal(result.brierScore, ((0.65 - 1) ** 2 + (0.32 - 0) ** 2) / 2);
});

test("rejects invalid engine settings and invalid dates", () => {
  assert.throws(() => calculateScenarioEngine({ ...base, evidenceWeight: 1.1 }), /evidenceWeight/);
  assert.throws(() => calculateScenarioEngine({ ...base, freshnessHalfLifeDays: 0 }), /freshnessHalfLifeDays/);
  assert.throws(() => calculateScenarioEngine({ ...base, asOf: "not-a-date" }), /Invalid valuation date/);
});

test("preserves the workbook's unnormalised one-standard-deviation probability bands", () => {
  const signals = [
    { name: "Base-only", family: "Survey", observedAt: "2026-10-16", reliability: 5,
      probabilities: { base: 1, bull: 0, bear: 0, tail: 0 } },
    { name: "Bull-only", family: "Survey", observedAt: "2026-10-16", reliability: 5,
      probabilities: { base: 0, bull: 1, bear: 0, tail: 0 } },
    { name: "Bear-only", family: "Survey", observedAt: "2026-10-16", reliability: 5,
      probabilities: { base: 0, bull: 0, bear: 1, tail: 0 } },
    { name: "Tail-only", family: "Survey", observedAt: "2026-10-16", reliability: 5,
      probabilities: { base: 0, bull: 0, bear: 0, tail: 1 } },
  ];
  const result = calculateScenarioEngine({ ...base, housePrior: { base: 0.25, bull: 0.25, bear: 0.25, tail: 0.25 }, signals });
  const pessimisticTotal = Object.values(result.pessimisticProbabilities).reduce((a, b) => a + b, 0);
  assert.ok(pessimisticTotal > 1);
  assert.ok(result.warnings.some((warning) => warning.includes("Pessimistic probability band exceeds 100%")));
});
