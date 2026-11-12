import test from "node:test";
import assert from "node:assert/strict";
import products from "../data/products.json" with { type: "json" };
import subclasses from "../data/subclasses.json" with { type: "json" };
import masterInputs from "../data/master-inputs.json" with { type: "json" };
import { deriveMasterProducts, type MasterInputs } from "./master-data";
import type { Product, Subclass } from "./engine";

const expected = products as Product[];
const derived = deriveMasterProducts(expected, subclasses as Subclass[], masterInputs as MasterInputs);
const close = (actual: number, expectedValue: number, label: string) =>
  assert.ok(Math.abs(actual - expectedValue) < 1e-9, `${label}: got ${actual}, expected ${expectedValue}`);

test("all workbook master rows derive the same expected return, volatility, beta and risk", () => {
  assert.equal(derived.length, expected.length);
  for (const original of expected) {
    const result = derived.find((item) => item.id === original.id);
    assert.ok(result, `missing derived product ${original.id}`);
    close(result.ret, original.ret, `${original.id} expected return`);
    close(result.vol, original.vol, `${original.id} volatility`);
    close(result.beta, original.beta, `${original.id} beta`);
    close(result.risk, original.risk, `${original.id} risk rating`);
    assert.equal(result.usSitus, original.usSitus, `${original.id} US situs`);
    const linkedSubclass = (subclasses as Subclass[]).find((item) => item.code === original.subclass)!;
    assert.equal(result.assetClassName, linkedSubclass.l1Name, `${original.id} Level 1 name`);
    assert.equal(result.subclassName, linkedSubclass.name, `${original.id} sub-class name`);
    assert.equal(result.geographyCheck, "OK", `${original.id} geography check`);
  }
});

test("structured note factor and scenario outputs reproduce the workbook master", () => {
  for (const original of expected.filter((item) => item.source === "Structured")) {
    const result = derived.find((item) => item.id === original.id)!;
    result.factors!.forEach((value, index) => close(value, original.factors![index], `${original.id} factor score ${index}`));
    result.scen.forEach((value, index) => close(value ?? 0, original.scen[index] ?? 0, `${original.id} scenario ${index}`));
    if (original.distToBarrier !== null) close(result.distToBarrier ?? 0, original.distToBarrier, `${original.id} barrier distance`);
    assert.equal(result.issuerCreditRisk, original.issuerCreditRisk);
  }
});

test("missing raw master records fail loudly instead of silently using stale outputs", () => {
  assert.throws(
    () => deriveMasterProducts(expected, subclasses as Subclass[], { ...(masterInputs as MasterInputs), public: [] }),
    /Missing Product Master raw inputs/,
  );
});


test("public Product Master outputs map Level 1 names, subclass names and geography for every live row", async () => {
  const { derivePublicProduct } = await import("./product-master");
  const { public: rawProducts, productAssumptions } = masterInputs as MasterInputs;
  const defaults = (subclasses as Subclass[]).map((item) => ({
    code: item.code, level1Name: item.l1Name, name: item.name, expectedReturn: item.ret,
    volatility: item.vol, beta: item.beta, riskRating: item.risk,
  }));
  const assumptions: ProductMasterAssumptions = { ...productAssumptions, assetClasses: defaults };
  assert.equal(rawProducts.length, 27);
  for (const raw of rawProducts) {
    const result = derivePublicProduct(raw, assumptions);
    const subclass = (subclasses as Subclass[]).find((item) => item.code === raw.subclassCode);
    assert.ok(subclass, `missing subclass for ${raw.id}`);
    assert.equal(result.assetClassName, subclass!.l1Name, `${raw.id} Product Master!G`);
    assert.equal(result.subclassName, subclass!.name, `${raw.id} Product Master!H`);
    assert.equal(result.geographyCheck, "OK", `${raw.id} Product Master!AX`);
  }
});


test("public Product Master domicile formula does not fall back to stale product situs", () => {
  const changedInputs = {
    ...(masterInputs as MasterInputs),
    public: (masterInputs as MasterInputs).public.map((item, index) => index === 0 ? { ...item, domicile: "" } : item),
  };
  const result = deriveMasterProducts(expected, subclasses as Subclass[], changedInputs);
  assert.equal(result.find((item) => item.id === changedInputs.public[0].id)!.usSitus, "");
});
