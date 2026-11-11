// Excel parity across many portfolios: data/parity.json holds the workbook's outputs for each case, recalculated
// in LibreOffice by scripts/excel_parity.py. The engine must reproduce every one of them.
// Run: node --test lib/parity.test.ts (or npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, defaultClient, type Client, type Data } from "./engine.ts";
import products from "../data/products.json" with { type: "json" };
import subclasses from "../data/subclasses.json" with { type: "json" };
import assumptions from "../data/assumptions.json" with { type: "json" };
import cases from "../data/parity.json" with { type: "json" };

const data = { products, subclasses, assumptions } as unknown as Data;
type Case = { name: string; client: Record<string, unknown>; lines: { id: string; sleeve: string; amount: number }[]; expected: Record<string, any> };

// Tolerance: 1e-9 relative (absolute below 1) - far inside the 0.01% the outputs are shown to.
function diff(path: string, excel: unknown, ours: unknown, out: string[]) {
  if (typeof excel === "number") {
    if (typeof ours !== "number" || !(Math.abs(excel - ours) <= 1e-9 * Math.max(1, Math.abs(excel)))) out.push(`${path}: Excel ${excel}, engine ${ours}`);
  } else if (Array.isArray(excel)) {
    if (!Array.isArray(ours) || ours.length !== excel.length) out.push(`${path}: Excel ${JSON.stringify(excel)}, engine ${JSON.stringify(ours)}`);
    else excel.forEach((x, i) => diff(`${path}[${i}]`, x, ours[i], out));
  } else if (excel && typeof excel === "object") {
    for (const k of Object.keys(excel)) diff(`${path}.${k}`, (excel as any)[k], (ours as any)?.[k], out);
  } else if (excel !== ours) out.push(`${path}: Excel ${JSON.stringify(excel)}, engine ${JSON.stringify(ours)}`);
}

export function clientFor(c: Case): Client {
  const d = defaultClient(data.assumptions), x = c.client as any;
  return {
    ...d, ...x, amount: c.expected.value,
    sleeves: x.sleeves ? d.sleeves.map((s, k) => ({ ...s, target: x.sleeves[k] })) : d.sleeves,
    geoTargets: x.geoTargets ? d.geoTargets.map((g, k) => ({ ...g, target: x.geoTargets[k] })) : d.geoTargets,
  };
}

// The engine's figures, keyed like scripts/extract_excel.py expected()
export function engineView(c: Case) {
  const r = analyse(clientFor(c), c.lines, data), L = r.lines, H = r.hedges.rows, k = r.risk;
  const subOf = (code: string) => r.subs.find((s) => s.code === code)!;
  return {
    value: r.value, ret: k.ret, retInr: k.retInr, vol: k.vol, beta: k.beta, lo: k.lo, hi: k.hi,
    toughYear: k.toughYear, toughValue: r.value * (1 + k.toughYear), pTarget: k.pTarget, pTargetInr: k.pTargetInr, pLoss: k.pLoss,
    retPerRisk: k.retPerRisk, gapToTarget: k.gapToTarget, corrCheck: k.corrCheck,
    riskShare: r.byL1.map((x) => x.riskShare), riskRatio: r.byL1.map((x) => x.riskRatio), weightL1: r.byL1.map((x) => x.weight),
    probs: r.scenarios.list.map((s) => s.prob), scenRet: r.scenarios.list.map((s) => s.ret), probWeighted: r.scenarios.probWeighted,
    scenValue: r.scenarios.list.map((s) => s.value), sixtyForty: r.scenarios.list.map((s) => s.sixtyForty), sixtyFortyWeighted: r.scenarios.sixtyFortyWeighted,
    lineAction: L.map((l) => l.action), linePriority: L.map((l) => l.priority), lineFlags: L.map((l) => l.flags.map((f) => f + "; ").join("")),
    lineTodo: L.map((l) => l.whatToDo), lineEligibility: L.map((l) => l.eligibility), lineFactor: L.map((l) => l.netFactor),
    lineFactors: L.map((l) => l.factors), lineWeight: L.map((l) => l.weight), lineScen: L.map((l) => l.scen),
    lineProbWeighted: L.map((l) => l.probWeighted), lineWorst: L.map((l) => l.worst), lineCapCall: L.map((l) => l.capCall),
    lineIssuerExcess: L.map((l) => l.issuerExcess), lineAi: L.map((l) => l.aiAmount), lineInr: L.map((l) => l.inrAmount),
    hedgeStatus: H.map((h) => h.status), hedgeInstrument: H.map((h) => h.instrument), hedgeNotional: H.map((h) => h.notional),
    hedgeRowCost: H.map((h) => h.cost), hedgeRowBear: H.map((h) => h.bear), hedgeRowTail: H.map((h) => h.tail),
    hedgeCost: r.hedges.cost, hedgeCostPct: r.hedges.costPct, hedgeBear: r.hedges.bearBenefit, hedgeTail: r.hedges.tailBenefit,
    tailAfter: r.hedges.tailAfter, bearAfter: r.hedges.bearAfter,
    factorExposure: r.factorExposure.map((f) => f.exposure), factorNet: r.factorExposure.map((f) => f.exposure),
    factorL1: data.assumptions.factors.map((_, f) => r.byL1.map((x) => x.factors[f])),
    factorSub: data.assumptions.factors.map((_, f) => Object.fromEntries(data.subclasses.map((s) => [s.code, subOf(s.code).factors[f]]))),
    sleeveActual: r.mandate.map((m) => m.actual), sleevePct: r.mandate.map((m) => m.actualPct), sleeveStatus: r.mandate.map((m) => m.status),
    mandateStatus: r.mandateStatus, geoActual: r.geography.map((g) => g.actual), geoPct: r.geography.map((g) => g.actualPct),
    geoStatus: r.geography.map((g) => g.status), geoTotalStatus: r.geoStatus,
    monitoringCurrent: r.monitoring.map((m) => m.current), monitoringStatus: r.monitoring.map((m) => m.status),
    subs: r.subs.map((s) => [s.lines, s.amount, s.weight, s.eRet, s.eVol, s.eBeta, s.eRisk, s.inUsd, s.usSitus, s.nonDaily]),
    l1Lines: r.byL1.map((x) => x.lines), l1Amount: r.byL1.map((x) => x.amount), l1Ret: r.byL1.map((x) => x.eRet),
    l1Contribution: r.byL1.map((x) => x.contribution), l1Vol: r.byL1.map((x) => x.eVol), l1Beta: r.byL1.map((x) => x.eBeta),
    l1Risk: r.byL1.map((x) => x.eRisk), l1Usd: r.byL1.map((x) => x.inUsd), l1UsSitus: r.byL1.map((x) => x.usSitus), l1NonDaily: r.byL1.map((x) => x.nonDaily),
    totals: [k.riskRating, k.inUsd, k.usSitusShare, k.nonDailyShare],
    l1Factor: r.byL1.map((x) => x.netFactor), netFactor: r.factorSummary.net,
    topPriorities: [0, 1, 2, 3, 4].map((i) => r.actions[i]?.product.name ?? ""),
    keyMessages: r.keyMessages, limitActual: r.riskLimits.map((x) => x.actual), limitStatus: r.riskLimits.map((x) => x.status),
  };
}

// Known workbook defects the engine deliberately does not copy (AUDIT_REPORT.md, open questions):
// - Client Summary!B292 always says "meets the mandate", even at 0/5 sleeves on target; the engine says
//   "does not yet meet" unless every sleeve and region is on target.
// - With nothing invested, B295 prints "Top priority:  - ." and B296 is #DIV/0!.
function excelKeyMessages(e: Record<string, any>) {
  return (e.keyMessages as string[]).map((m, i) => {
    m = m.replace(/^\d\.\s+/, "");
    if (i === 0) {
      const [, s, g] = m.match(/sleeves (\d+)\/5 and geography (\d+)\/3/)!;
      return m.replace(" meets the mandate", s === "5" && g === "3" ? " meets the mandate" : " does not yet meet the mandate");
    }
    if (e.value === 0 && i === 3) return m.replace(" Top priority:  - .", "");
    return m;
  });
}

for (const c of cases as unknown as Case[]) {
  test(`engine matches Excel: ${c.name}`, () => {
    const ours = engineView(c), out: string[] = [];
    if (c.expected.value === 0) ours.keyMessages[4] = "#DIV/0!";
    for (const key of Object.keys(c.expected)) diff(key, key === "keyMessages" ? excelKeyMessages(c.expected) : c.expected[key], (ours as any)[key], out);
    assert.deepEqual(out, [], `${out.length} mismatches:\n${out.join("\n")}`);
  });
}
