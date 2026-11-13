import test from "node:test";
import assert from "node:assert/strict";
import products from "../data/products.json" with { type: "json" };
import subclasses from "../data/subclasses.json" with { type: "json" };
import masterInputs from "../data/master-inputs.json" with { type: "json" };
import type { Product, Subclass } from "./engine";
import type { MasterInputs } from "./master-data";
import {
  createPublicProduct, EMPTY_PUBLIC_PRODUCT_FORM, nextPublicProductId,
  validatePublicProductForm, validateStoredPublicProducts, type PublicProductForm,
} from "./product-catalog";
import type { ProductMasterAssumptions } from "./product-master";

const existing = products as Product[];
const sub = subclasses as Subclass[];
const inputs = masterInputs as MasterInputs;
const assumptions: ProductMasterAssumptions = {
  ...inputs.productAssumptions,
  assetClasses: sub.map((item) => ({
    code: item.code, level1Name: item.l1Name, name: item.name, expectedReturn: item.ret,
    volatility: item.vol, beta: item.beta, riskRating: item.risk,
  })),
};
const validForm = (): PublicProductForm => ({
  ...EMPTY_PUBLIC_PRODUCT_FORM,
  name: "Test Global Equity ETF", type: "UCITS ETF", ticker: "TESTX",
  subclassCode: "EQ-USLC", strategy: "Broad market", geography: "United States",
  geoUs: "100", geoIndia: "0", geoRest: "0", currency: "USD", underlyingCurrency: "USD",
  sector: "Diversified", segment: "Large cap", style: "Blend", domicile: "Ireland",
  managerIssuer: "Test Asset Management", expenseRatio: "0.10", liquidity: "Daily",
  distributionChannel: "Public offer", platformAccess: "Yes",
});

test("creates a product with generated ID and Excel-derived model outputs", () => {
  const record = createPublicProduct(validForm(), existing, sub, assumptions);
  assert.equal(record.product.id, "P028");
  assert.equal(record.product.source, "Public");
  assert.equal(record.product.subclass, "EQ-USLC");
  assert.equal(record.product.assetClassName, "Equity");
  assert.equal(record.product.subclassName, "US Large Cap");
  assert.equal(record.product.ret, 0.075);
  assert.equal(record.product.vol, 0.16);
  assert.equal(record.product.beta, 1);
  assert.equal(record.product.risk, 4);
  assert.equal(record.product.usSitus, "No");
  assert.equal(record.product.fee, 0.001);
  assert.equal(record.raw.geography.us, 1);
  assert.equal(record.product.geographyCheck, "OK");
});

test("percentage inputs are normalized and explicit zero overrides are preserved", () => {
  const form = { ...validForm(), returnOverride: "0", volatilityOverride: "0", betaOverride: "-0.4", riskOverride: "0" };
  const record = createPublicProduct(form, existing, sub, assumptions);
  assert.equal(record.product.ret, 0);
  assert.equal(record.product.vol, 0);
  assert.equal(record.product.beta, -0.4);
  assert.equal(record.product.risk, 0);
});

test("bond yield is converted to decimal and passed through the credit-loss formula", () => {
  const form = {
    ...validForm(), name: "Test Corporate Bond", type: "Bond", ticker: "TESTBOND",
    subclassCode: "FI-IG", bondIssuer: "Test Issuer", creditRating: "BBB",
    coupon: "5.5", maturity: "2031-10-01", yieldToMaturity: "6.0",
    modifiedDuration: "4.2", seniority: "Senior unsecured",
  };
  const record = createPublicProduct(form, existing, sub, assumptions);
  assert.equal(record.product.yield, 0.06);
  assert.equal(record.raw.yieldToMaturity, 0.06);
  assert.ok(record.product.ret < 0.06 && record.product.ret > 0.05);
  assert.equal(record.product.rating, "BBB");
});

test("rejects missing independent inputs, duplicate identifiers and geography totals", () => {
  const missing = { ...validForm(), managerIssuer: "" };
  assert.ok(validatePublicProductForm(missing, existing, sub).some((error) => error.includes("Manager / issuer")));
  const duplicate = { ...validForm(), ticker: existing.find((item) => item.source === "Public")!.ticker };
  assert.ok(validatePublicProductForm(duplicate, existing, sub).some((error) => error.includes("ticker / ISIN")));
  const badGeo = { ...validForm(), geoRest: "80" };
  assert.ok(validatePublicProductForm(badGeo, existing, sub).some((error) => error.includes("total 100%")));
});

test("requires bond-specific hardcoded fields only for bond-like products", () => {
  assert.deepEqual(validatePublicProductForm(validForm(), existing, sub), []);
  const bond = { ...validForm(), type: "Bond" };
  const errors = validatePublicProductForm(bond, existing, sub);
  assert.ok(errors.some((error) => error.includes("Bond issuer")));
  assert.ok(errors.some((error) => error.includes("Yield to maturity")));
});

test("allocates the next free public product ID and validates persisted records", () => {
  assert.equal(nextPublicProductId(existing), "P028");
  const record = createPublicProduct(validForm(), existing, sub, assumptions);
  assert.deepEqual(validateStoredPublicProducts([record, record]).map((item) => item.product.id), ["P028"]);
  assert.deepEqual(validateStoredPublicProducts({}), []);
});

test("new Product Master record joins the runtime catalogue with calculated engine values", async () => {
  const { deriveMasterProducts } = await import("./master-data");
  const record = createPublicProduct(validForm(), existing, sub, assumptions);
  const runtime = deriveMasterProducts(
    [...existing, record.product],
    sub,
    { ...inputs, public: [...inputs.public, record.raw] },
  );
  const added = runtime.find((item) => item.id === record.product.id)!;
  assert.ok(added);
  assert.equal(added.ret, record.product.ret);
  assert.equal(added.vol, record.product.vol);
  assert.equal(added.beta, record.product.beta);
  assert.equal(added.risk, record.product.risk);
  assert.equal(added.geographyCheck, "OK");
  assert.equal(record.product.productMasterFields.name, "Test Global Equity ETF");
});


test("rejects unsupported dropdown values and out-of-range fee inputs at the validation boundary", () => {
  const unsupported = { ...validForm(), currency: "XYZ" };
  assert.ok(validatePublicProductForm(unsupported, existing, sub).some((error) => error.includes("Invalid currency")));
  const excessiveFee = { ...validForm(), expenseRatio: "125" };
  assert.ok(validatePublicProductForm(excessiveFee, existing, sub).some((error) => error.includes("Expense ratio must be between 0% and 100%")));
  const invalidLiquidity = { ...validForm(), liquidity: "Instant" };
  assert.ok(validatePublicProductForm(invalidLiquidity, existing, sub).some((error) => error.includes("Invalid liquidity")));
});

test("rejects corrupted persisted records instead of restoring unsafe model values", () => {
  const record = createPublicProduct(validForm(), existing, sub, assumptions);
  const corrupted = {
    ...record,
    product: { ...record.product, vol: Number.NaN },
  };
  assert.deepEqual(validateStoredPublicProducts([record, corrupted]).map((item) => item.product.id), ["P028"]);
});


test("matches Excel bond-return precedence, rating fallback and credit-spread loss rules", () => {
  const bond = {
    ...validForm(), name: "Formula Parity Bond", type: "Bond", ticker: "PARITYBOND",
    subclassCode: "FI-IG", bondIssuer: "Parity Issuer", creditRating: "AAA",
    coupon: "5", maturity: "2032-01-01", yieldToMaturity: "5",
    modifiedDuration: "4", seniority: "Senior unsecured",
  };
  const noLoss = createPublicProduct(bond, existing, sub, assumptions);
  assert.equal(noLoss.product.ret, 0.05);

  const unrated = createPublicProduct({
    ...bond, name: "Unrated Parity Bond", ticker: "UNRATEDBOND",
    creditRating: "Unlisted rating", yieldToMaturity: "6",
  }, existing, sub, assumptions);
  assert.equal(unrated.product.ret, 0.048);

  const overrideWins = createPublicProduct({
    ...bond, name: "Override Parity Bond", ticker: "OVERRIDEBOND",
    yieldToMaturity: "6", returnOverride: "7",
  }, existing, sub, assumptions);
  assert.equal(overrideWins.product.ret, 0.07);
});

test("US situs follows domicile unless an explicit Excel override is supplied", () => {
  const usDomiciled = createPublicProduct({
    ...validForm(), name: "US Domiciled Product", ticker: "USDOMICILE",
    domicile: "United States",
  }, existing, sub, assumptions);
  assert.equal(usDomiciled.product.usSitus, "Yes");

  const overridden = createPublicProduct({
    ...validForm(), name: "Overridden US Product", ticker: "USOVERRIDE",
    domicile: "United States", usSitusOverride: "No",
  }, existing, sub, assumptions);
  assert.equal(overridden.product.usSitus, "No");
});
