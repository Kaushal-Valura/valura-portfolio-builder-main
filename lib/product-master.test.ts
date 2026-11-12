import test from "node:test";
import assert from "node:assert/strict";
import { derivePublicProduct, type ProductMasterAssumptions, type PublicProductInput } from "./product-master";

const assumptions: ProductMasterAssumptions = {
  fiveYearTreasuryYield: 0.05,
  lossGivenDefault: 0.6,
  creditSpreadExpectedLossShare: 0.5,
  assetClasses: [
    { code: "EQ-USLC", level1: "EQ", name: "US Large Cap", expectedReturn: 0.075, volatility: 0.16, beta: 1, riskRating: 4 },
    { code: "FI-HY", level1: "FI", name: "High Yield", expectedReturn: 0.1, volatility: 0.18, beta: 0.7, riskRating: 5 },
  ],
  creditDefaults: [
    { rating: "BB", annualDefaultProbability: 0.008 },
    { rating: "Not rated", annualDefaultProbability: 0.03 },
  ],
};

const base: PublicProductInput = {
  id: "P001", subclassCode: "EQ-USLC", domicile: "Ireland", geography: { us: 1, india: 0, restOfWorld: 0 },
};

test("uses asset-class defaults for non-bond products and derives classification", () => {
  const result = derivePublicProduct(base, assumptions);
  assert.equal(result.assetClassCode, "EQ");
  assert.equal(result.subclassName, "US Large Cap");
  assert.equal(result.expectedReturn, 0.075);
  assert.equal(result.volatility, 0.16);
  assert.equal(result.beta, 1);
  assert.equal(result.riskRating, 4);
  assert.equal(result.usSitus, "No");
  assert.equal(result.geographyCheck, "OK");
});

test("explicit overrides win, including a zero override", () => {
  const result = derivePublicProduct({
    ...base, domicile: "United States", usSitusOverride: "No",
    expectedReturnOverride: 0, volatilityOverride: 0, betaOverride: 0, riskOverride: 0,
  }, assumptions);
  assert.equal(result.usSitus, "No");
  assert.equal(result.expectedReturn, 0);
  assert.equal(result.volatility, 0);
  assert.equal(result.beta, 0);
  assert.equal(result.riskRating, 0);
});

test("uses the larger rating-default or spread-based credit loss for bonds", () => {
  const product: PublicProductInput = {
    ...base, subclassCode: "FI-HY", yieldToMaturity: 0.15, creditRating: "BB",
  };
  const result = derivePublicProduct(product, assumptions);
  const ratingLoss = 0.008 * 0.6;
  const spreadLoss = (0.15 - 0.05) * 0.5;
  assert.equal(result.expectedReturn, 0.15 - Math.max(ratingLoss, spreadLoss));
});

test("falls back to 2% default probability for an unknown bond rating", () => {
  const result = derivePublicProduct({
    ...base, subclassCode: "FI-HY", yieldToMaturity: 0.1, creditRating: "UNKNOWN",
  }, assumptions);
  assert.equal(result.expectedReturn, 0.1 - Math.max(0.02 * 0.6, (0.1 - 0.05) * 0.5));
});

test("flags unknown subclasses and incomplete look-through", () => {
  const result = derivePublicProduct({
    ...base, subclassCode: "NO-SUCH-CODE", geography: { us: 0.5, india: 0.2, restOfWorld: 0.2 },
  }, assumptions);
  assert.equal(result.assetClassCode, "Unknown code");
  assert.equal(result.expectedReturn, 0);
  assert.equal(result.geographyCheck, "CHECK");
  assert.equal(result.warnings.length, 2);
});

test("blank domicile remains blank and blank subclass zeroes model outputs", () => {
  const result = derivePublicProduct({
    ...base, domicile: "", subclassCode: "",
  }, assumptions);
  assert.equal(result.usSitus, "");
  assert.equal(result.expectedReturn, 0);
  assert.equal(result.volatility, 0);
  assert.equal(result.geographyCheck, "OK");
});
