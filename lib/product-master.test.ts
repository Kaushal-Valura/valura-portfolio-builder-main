import test from "node:test";
import assert from "node:assert/strict";
import { derivePublicProduct, type ProductMasterAssumptions, type PublicProductInput } from "./product-master";

const assumptions: ProductMasterAssumptions = {
  fiveYearTreasuryYield: 0.05,
  lossGivenDefault: 0.6,
  creditSpreadExpectedLossShare: 0.5,
  assetClasses: [
    { code: "EQ-USLC", level1Name: "Equity", name: "US Large Cap", expectedReturn: 0.075, volatility: 0.16, beta: 1, riskRating: 4 },
    { code: "FI-HY", level1Name: "Fixed Income", name: "High Yield", expectedReturn: 0.1, volatility: 0.18, beta: 0.7, riskRating: 5 },
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
  assert.equal(result.assetClassName, "Equity");
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


test("maps every formula output column and expands to all 80 workbook slots", async () => {
  const { derivePublicProductSlots, PRODUCT_MASTER_CAPACITY, PRODUCT_MASTER_FORMULA_MAP } = await import("./product-master");
  const slots = derivePublicProductSlots([base], assumptions);
  assert.equal(PRODUCT_MASTER_CAPACITY, 80);
  assert.equal(slots.length, 80);
  assert.deepEqual(Object.keys(PRODUCT_MASTER_FORMULA_MAP), ["G", "H", "U", "AT", "AU", "AV", "AW", "AX"]);
  assert.equal(slots[0].assetClassName, "Equity");
  assert.equal(slots[0].subclassName, "US Large Cap");
  assert.equal(slots[0].geographyCheck, "OK");
  for (const blank of slots.slice(1)) {
    assert.equal(blank.assetClassName, "");
    assert.equal(blank.subclassName, "");
    assert.equal(blank.usSitus, "");
    assert.equal(blank.expectedReturn, 0);
    assert.equal(blank.volatility, 0);
    assert.equal(blank.beta, 0);
    assert.equal(blank.riskRating, 0);
    assert.equal(blank.geographyCheck, "");
  }
});

test("reproduces the complete workbook rating-default lookup table", () => {
  const defaults = [
    ["AAA", 0], ["AA+", 0.0001], ["AA", 0.0002], ["AA-", 0.0003],
    ["A+", 0.0005], ["A", 0.0006], ["A-", 0.0008], ["BBB+", 0.0012],
    ["BBB", 0.0018], ["BBB-", 0.003], ["BB+", 0.005], ["BB", 0.008],
    ["BB-", 0.013], ["B+", 0.022], ["B", 0.035], ["B-", 0.055],
    ["CCC or below", 0.25], ["Not rated", 0.03],
  ] as const;
  for (const [rating, probability] of defaults) {
    const result = derivePublicProduct({
      ...base, subclassCode: "FI-HY", yieldToMaturity: 0.06, creditRating: rating,
    }, assumptions);
    const expected = 0.06 - Math.max(probability * 0.6, 0.005);
    assert.ok(Math.abs(result.expectedReturn - expected) < 1e-12, `${rating}: ${result.expectedReturn} != ${expected}`);
  }
});

test("keeps zero overrides and negative beta as valid explicit values", () => {
  const result = derivePublicProduct({
    ...base, expectedReturnOverride: 0, volatilityOverride: 0, betaOverride: -0.48, riskOverride: 0,
  }, assumptions);
  assert.equal(result.expectedReturn, 0);
  assert.equal(result.volatility, 0);
  assert.equal(result.beta, -0.48);
  assert.equal(result.riskRating, 0);
});

test("rejects duplicate product IDs and excess worksheet rows", async () => {
  const { derivePublicProductSlots } = await import("./product-master");
  assert.throws(() => derivePublicProductSlots([base, base], assumptions), /Duplicate Product Master product ID/);
  assert.throws(() => derivePublicProductSlots(Array.from({ length: 81 }, (_, i) => ({ ...base, id: `P${i}` })), assumptions), /supports 80 rows/);
});

test("validates linked assumptions and duplicate lookup keys", async () => {
  const { validateProductMasterAssumptions } = await import("./product-master");
  assert.deepEqual(validateProductMasterAssumptions(assumptions), []);
  const invalid = {
    ...assumptions,
    assetClasses: [...assumptions.assetClasses, assumptions.assetClasses[0]],
    creditDefaults: [...assumptions.creditDefaults, assumptions.creditDefaults[0]],
    fiveYearTreasuryYield: Number.NaN,
  };
  const errors = validateProductMasterAssumptions(invalid);
  assert.ok(errors.some((error) => error.includes("Inputs!D45")));
  assert.ok(errors.some((error) => error.includes("duplicate sub-asset-class")));
  assert.ok(errors.some((error) => error.includes("duplicate ratings")));
});
