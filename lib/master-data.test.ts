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
  }
});

test("structured note factor and scenario outputs reproduce the workbook master", () => {
  for (const original of expected.filter((item) => item.source === "Structured")) {
    const result = derived.find((item) => item.id === original.id)!;
    assert.deepEqual(result.factors, original.factors, `${original.id} factor scores`);
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
