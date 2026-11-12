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
  assert.deepEqual(r.startHere, {
    productAvailability: "27 public | 6 private (4 DD-approved) | 4 notes",
    portfolioConstruction: "13 lines | $1,000,000 | sleeves on target 5/5 | geography 3/3",
    eligibility: "0 blocked | 1 under review",
    riskAndScenarios: "Return 7.2% | volatility 6.4% | 12m expected +4.3% | confidence Medium",
    actionsAndHedges: "1 high / 7 medium actions | 6 hedges recommended",
    clientPresentation: "Ready",
  });
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


test("Portfolio Builder keeps unknown product amounts in totals, weights and sleeve actuals", () => {
  const extra = [
    { id: "P999", sleeve: "Equity", amount: 10_000 },
    { id: "X999", sleeve: "Bonds & fixed income", amount: 5_000 },
    { id: "", sleeve: "Equity", amount: 2_000 },
  ];
  const r = analyse(defaultClient(data.assumptions), [...sample.lines, ...extra], data);
  close(r.value, 1_017_000, "Portfolio Builder!E64 includes unknown-ID and blank-ID amounts");
  assert.equal(r.counts.lines, 15, "Portfolio Builder!D64 counts nonblank IDs only");
  assert.equal(r.unmappedLines.length, 3, "amount-only blank-ID slot retains its formula weight");
  assert.deepEqual(r.unmappedLines.map((line) => [line.id, line.source, line.eligibility]), [
    ["P999", "Public", "CHECK: ID not found in masters"],
    ["X999", "Unknown", "CHECK: unknown product ID"],
    ["", "", ""],
  ]);
  close(r.unmappedLines[0].weight, 10_000 / 1_017_000, "unknown-ID line weight");
  close(r.unmappedLines[2].weight, 2_000 / 1_017_000, "blank-ID amount-only slot weight");
  close(r.mandate.find((s) => s.name === "Equity")!.actual, 112_000, "sleeve SUMIF includes unresolved and blank-ID amounts");
  close(r.mandate.find((s) => s.name === "Equity")!.targetUsd, 0.1 * 1_017_000, "sleeve target uses invested total");
  close(r.mandate.find((s) => s.name === "Equity")!.actualPct, 112_000 / 1_017_000, "sleeve actual weight uses invested total");
  assert.equal(r.geoStatus, "Check look-through %", "unknown-ID amounts have zero look-through shares");
});

test("Portfolio Builder sleeve and geography targets use invested value, not the client budget", () => {
  const client = { ...defaultClient(data.assumptions), amount: 2_000_000 };
  const r = analyse(client, sample.lines, data);
  close(r.value, 1_000_000, "invested portfolio value");
  close(r.mandate[0].targetUsd, 100_000, "sleeve target USD uses Portfolio Builder!E64");
  close(r.mandate[0].actualPct, 0.1, "sleeve actual percent uses Portfolio Builder!E64");
  close(r.geography[0].targetUsd, 400_000, "geography target USD uses Portfolio Builder!E64");
  close(r.geography[0].actualPct, 0.4, "geography actual percent uses Portfolio Builder!E64");
});


test("Portfolio Builder master lookup follows Excel MATCH case-insensitive text semantics", () => {
  const lowerCaseId = { ...sample.lines[0], id: sample.lines[0].id.toLowerCase() };
  const r = analyse(defaultClient(data.assumptions), [lowerCaseId], data);
  assert.equal(r.lines.length, 1);
  assert.equal(r.lines[0].product.id, sample.lines[0].id);
  assert.equal(r.unmappedLines.length, 0);
  close(r.value, sample.lines[0].amount, "case-insensitive product ID match retains amount");
});


test("Portfolio Builder mandate completeness uses Excel ROUND half-away-from-zero semantics", () => {
  const lines = [
    { id: "P001", sleeve: "Equity", amount: -1 },
    { id: "X999", sleeve: "Unmapped", amount: -0.5 },
  ];
  const r = analyse(defaultClient(data.assumptions), lines, data);
  assert.equal(r.value, -1.5);
  assert.equal(r.mandateStatus, "Unmapped sleeve");
});
