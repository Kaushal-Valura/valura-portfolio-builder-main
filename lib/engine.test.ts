// Parity check: the engine must reproduce the hand-built workbook's cached results.
// Run: node --test lib/engine.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, defaultClient, type Data } from "./engine.ts";
import products from "../data/products.json" with { type: "json" };
import subclasses from "../data/subclasses.json" with { type: "json" };
import assumptions from "../data/assumptions.json" with { type: "json" };
import sample from "../data/sample.json" with { type: "json" };
import scenarioEvidence from "../data/scenario-evidence.json" with { type: "json" };

const data = { products, subclasses, assumptions } as unknown as Data;
const E = sample.expected;
const close = (a: number, b: number, msg: string) => assert.ok(Math.abs(a - b) < 1e-9, `${msg}: got ${a}, Excel ${b}`);
const closeAll = (a: number[], b: number[], msg: string) => a.forEach((x, i) => close(x, b[i], `${msg}[${i}]`));

test("engine matches the Excel workbook on the sample client", () => {
  const r = analyse(defaultClient(data.assumptions), sample.lines, data);

  close(r.value, 1_000_000, "portfolio value");
  close(r.risk.ret, E.ret, "expected return");
  close(r.risk.retInr, E.retInr, "INR return");
  close(r.risk.vol, E.vol, "volatility");
  close(r.risk.beta, E.beta, "beta");
  close(r.risk.toughYear, E.toughYear, "tough year");
  close(r.risk.pTarget, E.pTarget, "P(>= target)");
  close(r.risk.pLoss, E.pLoss, "P(loss)");
  closeAll(r.byL1.map((c) => c.weight), E.weightL1, "L1 weight");
  closeAll(r.byL1.map((c) => c.riskShare), E.riskShare, "risk share");

  closeAll(r.scenarios.list.map((s) => s.ret), E.scenRet, "scenario return");
  closeAll(r.scenarios.list.map((s) => s.sixtyForty), E.sixtyForty, "60/40");
  close(r.scenarios.probWeighted, E.probWeighted, "prob-weighted 12m");
  closeAll(r.factorExposure.map((f) => f.exposure), E.factorExposure, "factor exposure");

  closeAll(r.mandate.map((m) => m.actual), E.sleeveActual, "sleeve actual");
  closeAll(r.geography.map((g) => g.actual), E.geoActual, "geo actual");

  assert.deepEqual(r.lines.map((l) => l.eligibility), E.lineEligibility);
  closeAll(r.lines.map((l) => l.netFactor), E.lineFactor, "line net factor");
  assert.deepEqual(r.lines.map((l) => l.action), E.lineAction);
  assert.deepEqual(r.lines.map((l) => l.priority), E.linePriority);
  assert.deepEqual(r.lines.map((l) => l.flags.map((f) => f + "; ").join("")), E.lineFlags);
  assert.deepEqual(r.lines.map((l) => l.whatToDo), E.lineTodo);

  assert.deepEqual(r.hedges.rows.map((h) => h.status), E.hedgeStatus);
  closeAll(r.hedges.rows.map((h) => h.notional), E.hedgeNotional, "hedge notional");
  close(r.hedges.cost, E.hedgeCost, "hedge cost");
  close(r.hedges.bearBenefit, E.hedgeBear, "hedge bear benefit");
  close(r.hedges.tailBenefit, E.hedgeTail, "hedge tail benefit");
  close(r.hedges.tailAfter, E.tailAfter, "tail after hedges");
  close(r.hedges.bearAfter, E.bearAfter, "bear after hedges");

  assert.deepEqual(r.monitoring.map((m) => m.status), E.monitoringStatus);

  // Client Summary sections 2, 3, 7 and 10
  closeAll(r.byL1.map((c) => c.lines), E.l1Lines, "L1 lines");
  closeAll(r.byL1.map((c) => c.eVol), E.l1Vol, "L1 vol");
  closeAll(r.byL1.map((c) => c.eBeta), E.l1Beta, "L1 beta");
  closeAll(r.byL1.map((c) => c.eRisk), E.l1Risk, "L1 risk rating");
  closeAll(r.byL1.map((c) => c.inUsd), E.l1Usd, "L1 % in USD");
  closeAll(r.byL1.map((c) => c.usSitus), E.l1UsSitus, "L1 % US situs");
  closeAll(r.byL1.map((c) => c.nonDaily), E.l1NonDaily, "L1 % non-daily");
  closeAll([r.risk.riskRating, r.risk.inUsd, r.risk.usSitusShare, r.risk.nonDailyShare], E.totals, "portfolio totals");
  closeAll(r.byL1.map((c) => c.netFactor), E.l1Factor, "L1 net factor");
  close(r.factorSummary.net, E.netFactor, "portfolio net factor");
  assert.deepEqual(r.actions.slice(0, 5).map((l) => l.product.name), E.topPriorities);
  assert.deepEqual(r.keyMessages, E.keyMessages.map((m) => m.replace(/^\d\.\s+/, "")));

  // Risk & Hedging rows 84-93: risk limits check
  closeAll(r.riskLimits.map((x) => x.actual), E.limitActual, "limit actual");
  assert.deepEqual(r.riskLimits.map((x) => x.status), E.limitStatus);
  close(r.lines.reduce((t, l) => t + l.riskShare, 0), 1, "line risk shares sum to 100%");
  close(r.cashLadder.reduce((t, x) => t + x, 0), 1, "cash ladder sums to 100%");
  // line-level covariance must reproduce the engine's volatility; weighted hurdles must add back to the portfolio return
  const w = r.lines.map((l) => l.weight);
  close(Math.sqrt(w.reduce((t, x, i) => t + x * r.why.lines[i].betaP * r.risk.variance, 0)), r.risk.vol, "line covariance vol");
  close(w.reduce((t, x, i) => t + x * r.why.lines[i].surplus, 0), 0, "weighted surplus is zero");
});

test("US person: US-situs rules switch off", () => {
  const r = analyse({ ...defaultClient(data.assumptions), usPerson: "Yes" }, sample.lines, data);
  assert.ok(r.lines.every((l) => l.action !== "SWITCH TO NON-US-SITUS LINE"));
  assert.equal(r.hedges.rows.find((h) => h.hedge === "US estate-tax exposure")!.status, "Not needed");
  assert.equal(r.riskLimits[5].status, "PASS");
});


test("live evidence model reproduces the workbook's scenario probabilities and confidence", () => {
  const evidenceData = { ...data, scenarioEvidence } as unknown as Data;
  const r = analyse(defaultClient(data.assumptions), sample.lines, evidenceData);
  assert.ok(r.scenarioEngine);
  r.scenarios.list.forEach((scenario, index) => {
    close(scenario.prob, data.assumptions.scenarios[index].prob, `scenario probability ${index}`);
  });
  close(r.scenarioEngine!.overallConfidenceScore, data.assumptions.engineConfidence, "overall scenario confidence");
  close(r.scenarioEngine!.totalEffectiveWeight, 40.407673275924395, "total effective evidence weight");
  assert.equal(r.scenarioEngine!.signalsUpdatedLast30Days, 12);
  close(r.scenarioEngine!.brierScore!, 0.11245, "calibration Brier score");
  (["base", "bull", "bear", "tail"] as const).forEach((key, index) => {
    close(r.scenarioEngine!.pessimisticProbabilities[key], data.assumptions.scenarios[index].pessimistic, `pessimistic probability ${key}`);
    close(r.scenarioEngine!.optimisticProbabilities[key], data.assumptions.scenarios[index].optimistic, `optimistic probability ${key}`);
  });
  close(r.scenarioEngine!.expected12MonthReturn!.central, r.scenarios.engineWeighted, "central scenario engine return");
  close(r.scenarioEngine!.projectedPortfolioValue!.central, r.value * (1 + r.scenarios.engineWeighted), "scenario engine projected portfolio value");
  assert.equal(r.scenarioEngine!.overallConfidence, data.assumptions.engineConfidenceLevel);
});
