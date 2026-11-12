import test from "node:test";
import assert from "node:assert/strict";
import { derivePrivateAsset, type PrivateAssetAssumptions, type PrivateAssetInput } from "./private-assets";

const assumptions: PrivateAssetAssumptions = {
  realisationFactor: 0.8,
  assetClasses: [
    { code: "HF-EQ", level1: "HF", name: "Equity hedge", expectedReturn: 0.09, volatility: 0.2, beta: 0.45, riskRating: 3 },
  ],
};
const base: PrivateAssetInput = {
  id: "A001", subclassCode: "HF-EQ", domicile: "India (GIFT IFSC)", structure: "Open-ended",
  redemptionFrequency: "Monthly", managementFee: 0.015, performanceFee: 0.15, hurdle: 0.08,
  targetGrossIrr: 0.15, targetNetIrr: 0.12, reportedVolatility: 0.14, desmoothingFactor: 1,
  betaToListedMarkets: 0.45, dueDiligenceRating: 4,
  geography: { us: 0, india: 1, restOfWorld: 0 },
};

test("applies the 80% realisation factor to target net IRR", () => {
  const result = derivePrivateAsset(base, assumptions);
  assert.equal(result.expectedReturn, 0.096);
  assert.equal(result.volatility, 0.14);
  assert.equal(result.beta, 0.45);
  assert.equal(result.riskRating, 3);
});

test("de-smooths volatility and applies DD risk uplift for ratings 1–2", () => {
  const result = derivePrivateAsset({
    ...base, reportedVolatility: 0.1, desmoothingFactor: 1.5, dueDiligenceRating: 2,
  }, assumptions);
  assert.ok(Math.abs(result.volatility - 0.15) < 1e-12);
  assert.equal(result.riskRating, 4);
});

test("falls back to asset-class assumptions when fund metrics are absent", () => {
  const result = derivePrivateAsset({
    ...base, targetNetIrr: null, reportedVolatility: null, betaToListedMarkets: null,
  }, assumptions);
  assert.equal(result.expectedReturn, 0.09);
  assert.equal(result.volatility, 0.2);
  assert.equal(result.beta, 0.45);
});

test("caps risk rating at five and classifies closed-ended funds as locked", () => {
  const result = derivePrivateAsset({
    ...base, structure: "Closed-ended", dueDiligenceRating: 1,
  }, { ...assumptions, assetClasses: [{ ...assumptions.assetClasses[0], riskRating: 5 }] });
  assert.equal(result.riskRating, 5);
  assert.equal(result.liquidityClass, "Locked (lock-up)");
});

test("calculates the workbook's approximate fee drag", () => {
  const result = derivePrivateAsset(base, assumptions);
  assert.equal(result.feeDrag, 0.015 + 0.15 * (0.15 - 0.08));
});

test("flags unknown subclass and incomplete look-through", () => {
  const result = derivePrivateAsset({
    ...base, subclassCode: "UNKNOWN", geography: { us: 0.5, india: 0.2, restOfWorld: 0.2 },
  }, assumptions);
  assert.equal(result.assetClassCode, "Unknown code");
  assert.equal(result.expectedReturn, 0.096); // target net IRR is calculated even when the subclass lookup is unknown
  assert.equal(result.geographyCheck, "CHECK");
  assert.equal(result.warnings.length, 2);
});

test("blank subclass produces zero model values and blank fund produces blank checks", () => {
  const result = derivePrivateAsset({
    ...base, id: "", subclassCode: "", domicile: "",
  }, assumptions);
  assert.equal(result.expectedReturn, 0);
  assert.equal(result.volatility, 0);
  assert.equal(result.beta, 0);
  assert.equal(result.riskRating, 0);
  assert.equal(result.liquidityClass, "");
  assert.equal(result.usSitus, "");
  assert.equal(result.geographyCheck, "");
});
