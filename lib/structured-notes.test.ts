import test from "node:test";
import assert from "node:assert/strict";
import { classifyStructuredNote, deriveStructuredNote, type StructuredNoteAssumptions, type StructuredNoteInput } from "./structured-notes";

const assumptions: StructuredNoteAssumptions = {
  assetClasses: [
    { code: "EQ-USLC", level1: "EQ", name: "US Large Cap", expectedReturn: 0.075, volatility: 0.16, beta: 1, riskRating: 4 },
    { code: "SP-CPN", level1: "SP", name: "Capital-protected notes", expectedReturn: 0.06, volatility: 0.15, beta: 0.35, riskRating: 2 },
    { code: "SP-YLD", level1: "SP", name: "Yield enhancement notes", expectedReturn: 0.12, volatility: 0.12, beta: 0.7, riskRating: 4 },
    { code: "SP-AMC", level1: "SP", name: "Actively managed certificates", expectedReturn: 0.14, volatility: 0.14, beta: 0.8, riskRating: 4 },
  ],
  barrierIncomeBaseRisk: 0.3, barrierIncomeBarrierSlope: 0.7, protectedResidualExposure: 0.4,
  protectedIncomeBaseRisk: 0.1, lossGivenBreachFactor: 0.8, protectedUpsideCapture: 0.8,
  issuerCreditAdjustment: { low: -0.25, medium: -0.5, high: -1 },
  highIssuerRiskRatingAddon: 1, americanBarrierRiskAddon: 1, defaultIncomeCoupon: 0.08,
};
const base: StructuredNoteInput = {
  id: "S101", structureType: "Protected Income Note", issuerRating: "A+", issuerDomicile: "Netherlands",
  underlyingSubclassCode: "EQ-USLC", tenorYears: 3, couponYield: 0.0525, participation: 1,
  capitalProtection: 0.95, barrierStrike: 1, barrierObservation: "European (maturity)",
  underlyingInitialLevel: 7690.73, underlyingCurrentLevel: 7690.73, annualFee: 0,
  factorScores: [-1, 1, 1, 0, 0, 0, -1],
  underlyingScenarioReturns: { base: 0.08, bull: 0.12, bear: -0.06, tail: -0.1 },
};

test("maps supported term-sheet types to workbook subclasses and payoff families", () => {
  assert.deepEqual(classifyStructuredNote("Protected Income Note"), { subclassCode: "SP-CPN", payoffFamily: "Protected income" });
  assert.deepEqual(classifyStructuredNote("Autocallable"), { subclassCode: "SP-YLD", payoffFamily: "Income" });
  assert.deepEqual(classifyStructuredNote("Tracker Certificate"), { subclassCode: "SP-AMC", payoffFamily: "Tracker" });
  assert.equal(classifyStructuredNote("Unknown").subclassCode, "");
});

test("calculates protected-income risk equivalence, barrier probability and note returns", () => {
  const result = deriveStructuredNote(base, assumptions);
  assert.equal(result.subclassCode, "SP-CPN");
  assert.equal(result.assetClassCode, "SP");
  assert.equal(result.subclassName, "Capital-protected notes");
  assert.equal(result.riskEquivalent, Math.min(1, 0.1 + 2 * (1 - 0.95)));
  assert.ok(result.probabilityBelowBarrier > 0 && result.probabilityBelowBarrier < 1);
  assert.equal(result.expectedReturn, 0.0525 - result.probabilityBelowBarrier * 0.05 * 0.8 / 3);
  assert.equal(result.volatility, result.riskEquivalent * 0.16);
  assert.equal(result.usSitus, "No");
});

test("calculates income note risk, distance to barrier and loss probability", () => {
  const result = deriveStructuredNote({
    ...base, structureType: "Autocallable", capitalProtection: 0, barrierStrike: 0.7,
    underlyingCurrentLevel: 0.9 * 7690.73, barrierObservation: "American (daily)",
  }, assumptions);
  assert.equal(result.subclassCode, "SP-YLD");
  assert.equal(result.riskEquivalent, Math.min(1, 0.3 + 0.7 * 0.7));
  assert.ok(Math.abs((result.distanceToBarrier as number) - 0.2) < 1e-12);
  assert.equal(result.riskRating, Math.min(5, Math.max(1, 4 + 1)));
});

test("tracker return is underlying return less annual fee", () => {
  const result = deriveStructuredNote({ ...base, structureType: "Tracker Certificate", annualFee: 0.01 }, assumptions);
  assert.equal(result.expectedReturn, 0.075 - 0.01);
  assert.equal(result.riskEquivalent, 1);
  assert.equal(result.noteScenarioReturns.base, 0.08 - 0.01);
});

test("uses credit risk adjustment in F7 factor score and clamps factor scores", () => {
  const result = deriveStructuredNote({
    ...base, issuerRating: "BBB", factorScores: [10, 10, 10, 10, 10, 10, 10],
  }, assumptions);
  assert.equal(result.issuerCreditRisk, "High");
  assert.ok(result.factorScores.every((score) => score <= 2 && score >= -2));
});

test("unsupported note types are flagged without creating model exposure", () => {
  const result = deriveStructuredNote({ ...base, structureType: "Unknown" }, assumptions);
  assert.equal(result.subclassCode, "");
  assert.equal(result.expectedReturn, 0);
  assert.equal(result.volatility, 0);
  assert.ok(result.warnings.length > 0);
});
