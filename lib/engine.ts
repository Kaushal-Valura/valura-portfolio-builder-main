import { calculateScenarioEngine, type ScenarioEngineInput } from "./scenario-engine";

// Portfolio engine: a line-for-line port of the Valura workbook formulas
// (Portfolio Builder -> Asset Class Master -> Risk & Hedging -> Scenarios -> Next Best Actions -> Monitoring).
// Pure: no IO, no React. Sheet references in comments point at the source cells.

export type Product = {
  id: string; source: "Public" | "Private" | "Structured"; name: string; type: string; ticker: string;
  subclass: string; geography: string; geo: number[]; ccy: string; underlyingCcy: string; domicile: string;
  usSitus: string; liquidity: string; sector: string; issuer: string; rating: string; yield: number; fee: number;
  aumM: number; platform: string; accreditedOnly: string; minAccredited: number; minNonAccredited: number;
  ddStatus: string; commitment: string; call1y: number; lockupYrs: number;
  ret: number; vol: number; beta: number; risk: number;
  factors: number[] | null; scen: (number | null)[]; distToBarrier: number | null; issuerCreditRisk: string; notes: string;
  assetClassName?: string; subclassName?: string; geographyCheck?: "OK" | "CHECK" | "";
  facts: [string, string][]; // key terms from the master sheet, shown as "why this holding"
};
export type Subclass = {
  code: string; l1: string; l1Name: string; name: string; ret: number; vol: number; beta: number; risk: number;
  scen: number[]; factors: number[]; riskEq: number;
};
export type Indicator = {
  indicator: string; linked: string; current: number; amber: number; red: number; direction: string; action: string; source: string;
};
export type Assumptions = {
  client: { name: string; jurisdiction: string; baseCcy: string; riskProfile: string; horizon: number; target: number; amount: number; accredited: string; accreditedVerified: string };
  market: Record<string, number>;
  limits: Record<string, number>;
  factors: { name: string; weight: number; consensus: string; number: string }[];
  notes: string[];
  l1: { code: string; name: string; label: string }[];
  corr: number[][];
  scenarios: { name: string; label: string; trigger: string; prob: number; pessimistic: number; optimistic: number; confidence: string }[];
  engineConfidence: number; engineConfidenceLevel: string;
  sleeves: { name: string; target: number }[];
  geoTargets: { name: string; target: number }[];
  monitoring: Indicator[];
  events: { date: string; event: string; factor: string; why: string }[];
};
export type Data = { products: Product[]; subclasses: Subclass[]; assumptions: Assumptions; scenarioEvidence?: ScenarioEngineInput };

export type Client = {
  name: string; riskProfile: string; horizon: number; target: number; amount: number;
  accredited: "Yes" | "No"; accreditedVerified: "Yes" | "No";
  sleeves: { name: string; target: number }[];
  geoTargets: { name: string; target: number }[];
  usPerson: "Yes" | "No";          // US person: US estate tax on US-situs assets no longer applies
  maxIlliquid: number;              // Inputs!D23
  targetVol: number;                // Inputs!D21
  probOverride?: (number | null)[]; // Scenarios!K6:K9
  drawdown?: number;                // Monitoring!E20
};
// rec: the amount Optimise recommended (absent when the advisor added the line by hand)
export type Line = { uid?: string; id: string; sleeve: string; amount: number; rationale?: string; rec?: number };

// Excel ROUND / TEXT round half away from zero on the decimal value; toFixed rounds the binary value (12.35 -> "12.3").
// toPrecision(15) first gives Excel's 15 significant digits, so 12.349999999999998 is read as 12.35.
export const xround = (x: number, d = 0) => (Math.sign(x) * Math.round(+(Math.abs(x) * 10 ** d).toPrecision(15))) / 10 ** d;
export const fixed = (x: number, d = 0) => xround(x, d).toFixed(d);
const pct = (x: number, d = 0) => `${fixed(x * 100, d)}%`;
const usd = (x: number) => `${x < 0 ? "-" : ""}$${xround(Math.abs(x)).toLocaleString("en-US")}`; // TEXT(x,"$#,##0")
const signed = (x: number, d: number, suffix = "") => `${x >= 0 ? "+" : "-"}${fixed(Math.abs(x), d)}${suffix}`;
const spct = (x: number) => signed(x * 100, 0, "%");
// Excel comparisons treat values within ~15 significant digits as equal, so 0.095 - 0.1 <= -0.005 and a net factor
// of -0.49999999999999994 <= -0.5 both hold there; every threshold test below goes through these.
const near = (a: number, b: number) => a === b || Math.abs(a - b) <= Math.min(Math.abs(a), Math.abs(b)) * 2 ** -48;
export const le = (a: number, b: number) => a < b || near(a, b);
export const ge = (a: number, b: number) => a > b || near(a, b);
const gt = (a: number, b: number) => !le(a, b), lt = (a: number, b: number) => !ge(a, b);
const statusOf = (gap: number) => (le(Math.abs(gap), 0.005) ? "On target" : gap > 0 ? "Over" : "Under");
// Client Summary H25 / L184 / Q68 / F232
export const riskLevel = (r: number) => (r ? ["Low", "Low-Med", "Medium", "Med-High", "High"][Math.max(1, Math.min(5, xround(r))) - 1] : "-");
export const outlook = (x: number) => (ge(x, 0.5) ? "Favourable" : ge(x, 0.2) ? "Mildly fav." : le(x, -0.5) ? "Unfavourable" : le(x, -0.2) ? "Mildly unfav." : "Neutral");
// ROUNDUP(x, 0): away from zero
const roundUp = (x: number) => Math.sign(x) * Math.ceil(+Math.abs(x).toPrecision(15));
const SUB_IG = ["BB+", "BB", "BB-", "B+", "B", "B-", "CCC or below"];

// Standard normal CDF to double precision (Hart 1968, as given by West 2005) - Excel NORMSDIST
export function normCdf(z: number) {
  const x = Math.abs(z);
  let c = 0;
  if (x < 37) {
    const e = Math.exp(-x * x / 2);
    if (x < 7.07106781186547) {
      const n = ((((((0.0352624965998911 * x + 0.700383064443688) * x + 6.37396220353165) * x + 33.912866078383) * x + 112.079291497871) * x + 221.213596169931) * x + 220.206867912376);
      const d = (((((((0.0883883476483184 * x + 1.75566716318264) * x + 16.064177579207) * x + 86.7807322029461) * x + 296.564248779674) * x + 637.333633378831) * x + 793.826512519948) * x + 440.413735824752);
      c = (e * n) / d;
    } else c = e / (x + 1 / (x + 2 / (x + 3 / (x + 4 / (x + 0.65))))) / 2.506628274631;
  }
  return z > 0 ? 1 - c : c;
}

export function analyse(client: Client, input: Line[], data: Data) {
  const { assumptions: A, subclasses } = data;
  const L = A.limits, M = A.market;
  const byId = new Map(data.products.map((p) => [p.id, p]));
  const sc = new Map(subclasses.map((s) => [s.code, s]));
  const l1Index = new Map(A.l1.map((x, i) => [x.code, i]));
  const accredited = client.accredited === "Yes";
  const situs = (p: Product) => p.usSitus === "Yes" && client.usPerson !== "Yes"; // estate-tax rules are for non-US persons
  const scenarioModel = data.scenarioEvidence ? calculateScenarioEngine(data.scenarioEvidence) : null;
  const scenarioKeys = ["base", "bull", "bear", "tail"] as const;
  const engineProbabilities = scenarioModel
    ? scenarioKeys.map((key) => scenarioModel.finalProbabilities[key])
    : A.scenarios.map((s) => s.prob);
  const probs = A.scenarios.map((s, k) => client.probOverride?.[k] ?? engineProbabilities[k]); // advisor override > live evidence model > workbook snapshot

  const held = input.filter((l) => byId.has(l.id));
  const V = held.reduce((s, l) => s + (l.amount || 0), 0); // Portfolio Builder!E64

  // ---- Portfolio Builder: one enriched row per line (cols G..BJ) ----
  const lines = held.map((l, i) => {
    const p = byId.get(l.id)!, s = sc.get(p.subclass)!;
    const amount = l.amount || 0, weight = V ? amount / V : 0;
    // PB!AO:AU - notes carry their own scores; other products look up their sub-class row (F sheets have no SP / OT rows
    // in that lookup range, so a non-note in an SP sub-class scores 0, as IFERROR(...,0) gives)
    const factors = p.source === "Structured" && p.factors ? p.factors : s.l1 === "SP" ? s.factors.map(() => 0) : s.factors;
    const netFactor = factors.reduce((t, f, k) => t + f * A.factors[k].weight, 0);
    const scen = s.scen.map((d, k) => (p.source === "Structured" ? (p.scen[k] ?? 0) : (p.scen[k] ?? d)));
    const probWeighted = scen.reduce((t, r, k) => t + r * probs[k], 0);
    const worst = Math.min(...scen);
    const minTicket = accredited ? p.minAccredited : p.minNonAccredited;
    const eligibility =
      p.platform === "No" ? "BLOCKED: not on Valura platform"
      : p.accreditedOnly === "Yes" && !accredited ? "BLOCKED: accredited investors only"
      : amount > 0 && lt(amount, minTicket) ? "BLOCKED: below minimum ticket"
      : p.source === "Private" && p.ddStatus !== "Approved" ? `REVIEW: due diligence ${p.ddStatus.toLowerCase()}`
      : "OK";
    const capCall = p.source === "Private" && p.commitment === "Yes" ? amount * p.call1y : 0;
    const issuerExcess = p.type === "Bond" ? Math.max(0, amount - L.singleIssuer * V) : 0;
    const aiAmount = p.subclass === "EQ-TECH" || p.sector === "Technology" || p.sector === "EQ-TECH" ? amount : 0; // PB!BI
    const inrAmount = /INR/i.test(p.underlyingCcy) ? amount : 0; // PB!BJ: SEARCH is case-insensitive
    const unverified = p.source === "Private" && accredited && client.accreditedVerified === "No";
    const issuerOver = p.type === "Bond" && gt(weight, L.singleIssuer), distressed = ge(p.yield, L.distressedYield);
    const headwind = le(netFactor, L.factorHeadwind), costly = ge(p.fee, L.highFee) || (p.aumM > 0 && lt(p.aumM, L.smallFundAum));

    // Next Best Actions!O (flags)
    const flags: string[] = [];
    if (eligibility !== "OK") flags.push(eligibility);
    if (issuerOver) flags.push(`Single-issuer ${pct(weight, 1)} vs ${pct(L.singleIssuer)} limit`);
    if (gt(weight, L.largePosition)) flags.push(`Large position ${pct(weight)}`);
    if (distressed) flags.push(`Distressed-level yield ${pct(p.yield, 1)}`);
    if (SUB_IG.includes(p.rating)) flags.push(`Sub-investment-grade (${p.rating})`);
    if (situs(p)) flags.push("US-situs asset (estate tax above USD 60k)");
    if (p.liquidity === "Quarterly" || p.liquidity === "Locked (lock-up)") flags.push(`Illiquid (${p.liquidity})`);
    if (ge(p.fee, L.highFee)) flags.push(`High fee ${pct(p.fee, 2)}`);
    if (p.aumM > 0 && lt(p.aumM, L.smallFundAum)) flags.push(`Small fund (AUM USD ${xround(p.aumM).toLocaleString("en-US")}m)`);
    if (headwind) flags.push(`Factor headwinds (${signed(netFactor, 2)})`);
    if (le(worst, L.worstScenario)) flags.push(`Worst scenario ${signed(worst * 100, 0, "%")}`);
    if (p.distToBarrier != null && lt(p.distToBarrier, L.barrierProximity)) flags.push(`Within ${pct(p.distToBarrier)} of barrier`);
    if (p.issuerCreditRisk === "High") flags.push("High issuer credit risk");
    if (unverified) flags.push("Accredited status not yet verified");
    if (inrAmount > 0) flags.push("INR currency exposure");
    if (p.beta < 0) flags.push("Negative beta - diversifies equity risk");
    if (capCall > 0) flags.push(`Year-1 capital call USD ${xround(capCall).toLocaleString("en-US")}`);

    // Next Best Actions!P (rule chain, first match wins)
    const action =
      eligibility.startsWith("BLOCKED") ? "FIX BEFORE EXECUTION"
      : distressed || issuerOver ? "RESIZE / REDUCE"
      : le(worst, L.severeLoss) ? "HEDGE OR REDUCE"
      : eligibility.startsWith("REVIEW") || eligibility.startsWith("CHECK") || unverified ? "VERIFY BEFORE COMMITTING"
      : situs(p) ? "SWITCH TO NON-US-SITUS LINE"
      : headwind ? "HOLD - DO NOT ADD"
      : costly ? "KEEP - MONITOR COST & SIZE"
      : ge(netFactor, L.factorTailwind) ? "HOLD / ADD ON WEAKNESS"
      : "HOLD";
    const priority = ["FIX BEFORE EXECUTION", "RESIZE / REDUCE", "HEDGE OR REDUCE"].includes(action) ? "High"
      : ["VERIFY BEFORE COMMITTING", "SWITCH TO NON-US-SITUS LINE", "HOLD - DO NOT ADD"].includes(action) ? "Medium" : "Low";
    const todo: Record<string, string> = {
      "FIX BEFORE EXECUTION": `Resolve: ${eligibility}`,
      "RESIZE / REDUCE": `Cap at ${usd(L.singleIssuer * V)} (${pct(L.singleIssuer)} single-issuer limit); move ${usd(Math.max(0, amount - L.singleIssuer * V))} to a diversified HY / IG fund (e.g. P015) or the FMP; see credit hedge`,
      "HEDGE OR REDUCE": "Reduce, or pair with the index put spread in section B",
      "VERIFY BEFORE COMMITTING": "Complete due diligence and file the accredited-investor certificate before signing the commitment",
      "SWITCH TO NON-US-SITUS LINE": "Prefer an Irish / Luxembourg UCITS alternative; if none exists, keep total US-situs exposure under USD 60,000 or arrange estate cover",
      "HOLD - DO NOT ADD": "Hold; revisit if the factor score improves",
      "KEEP - MONITOR COST & SIZE": "Review quarterly vs benchmark; replace if net alpha falls below the fee or AUM shrinks",
      "HOLD / ADD ON WEAKNESS": "Add on 5-10% pullbacks",
      HOLD: "Hold - no action needed",
    };
    const score = ({ High: 3, Medium: 2, Low: 1 } as const)[priority] * 1e9 + amount + i / 1000; // NBA!S (later row wins ties)

    return {
      ...l, product: p, subclassName: s.name, l1: s.l1, l1Name: s.l1Name, amount, weight, factors, netFactor,
      scen, probWeighted, worst, eligibility, capCall, issuerExcess, aiAmount, inrAmount,
      flags, action, priority, whatToDo: todo[action], score,
    };
  });

  // ---- Asset Class Master W..AG: aggregate by sub-asset class ----
  const eqUs = sc.get("EQ-USLC")!.factors;
  const subs = subclasses.map((s) => {
    const ls = lines.filter((l) => l.product.subclass === s.code);
    const X = ls.reduce((t, l) => t + l.amount, 0);
    const wavg = (f: (l: (typeof lines)[number]) => number, d: number) => (X ? ls.reduce((t, l) => t + l.amount * f(l), 0) / X : d);
    // F sheets rows 81-85: structured-note sub-classes score live - the held notes' amount-weighted scores, or when none
    // are held the risk-equivalent (Asset Class Master R) x the US large-cap score, plus the issuer adjustment on F7
    const factors = s.l1 !== "SP" ? s.factors : A.factors.map((_, k) => (X
      ? ls.reduce((t, l) => t + l.amount * l.factors[k], 0) / X
      : Math.max(-2, Math.min(2, s.riskEq * eqUs[k] + (k === 6 ? M.noteIssuerAdj : 0)))));
    return {
      ...s, lines: ls.filter((l) => l.amount > 0).length, amount: X, weight: V ? X / V : 0,
      eRet: wavg((l) => l.product.ret, s.ret), eVol: wavg((l) => l.product.vol, s.vol),
      eBeta: wavg((l) => l.product.beta, s.beta), eRisk: wavg((l) => l.product.risk, s.risk),
      nonDaily: X ? ls.reduce((t, l) => t + (l.product.liquidity !== "Daily" ? l.amount : 0), 0) / X : 0,
      usSitus: X ? ls.reduce((t, l) => t + (l.product.usSitus === "Yes" ? l.amount : 0), 0) / X : 0,
      inUsd: X ? ls.reduce((t, l) => t + (l.product.ccy === "USD" ? l.amount : 0), 0) / X : 0,
      factors, netFactor: factors.reduce((t, f, k) => t + f * A.factors[k].weight, 0),
    };
  });

  // ---- Risk & Hedging: correlation-based covariance (F28:AL60) ----
  const cov = subs.map((a) => subs.map((b) =>
    a.weight * b.weight * a.eVol * b.eVol * (a.code === b.code ? 1 : A.corr[l1Index.get(a.l1)!][l1Index.get(b.l1)!])));
  const rowRisk = cov.map((r) => r.reduce((t, x) => t + x, 0));
  const variance = rowRisk.reduce((t, x) => t + x, 0);
  const ret = subs.reduce((t, s) => t + s.weight * s.eRet, 0);
  const vol = Math.sqrt(Math.max(0, variance));
  const beta = subs.reduce((t, s) => t + s.weight * s.eBeta, 0);
  const retInr = (1 + ret) * (1 + M.inrDep) - 1;
  const hsd = vol / Math.sqrt(client.horizon || 1);
  const pAbove = (r: number) => (hsd ? 1 - normCdf((client.target - r) / hsd) : r >= client.target ? 1 : 0);
  const risk = {
    ret, retInr, vol, beta, variance,
    lo: ret - vol, hi: ret + vol, toughYear: ret - M.toughMult * vol,
    pTarget: pAbove(ret), pTargetInr: pAbove(retInr),
    pLoss: hsd ? normCdf(-ret / hsd) : ret < 0 ? 1 : 0,
    retPerRisk: vol ? ret / vol : 0, gapToTarget: client.target - ret,
    riskRating: subs.reduce((t, s) => t + s.weight * s.eRisk, 0),
    nonDailyShare: subs.reduce((t, s) => t + s.weight * s.nonDaily, 0),
    corrCheck: variance < 0 ? "CHECK: correlations imply negative variance" : "OK",
    inUsd: subs.reduce((t, s) => t + s.weight * s.inUsd, 0),
    usSitusShare: subs.reduce((t, s) => t + s.weight * s.usSitus, 0),
  };

  // ---- Client view: each line's share of risk (its sub-class's share, split by amount), cash ladder, fund costs ----
  const subIdx = new Map(subs.map((s, i) => [s.code, i]));
  const lineRisk = (l: (typeof lines)[number]) => {
    const i = subIdx.get(l.product.subclass)!;
    return variance > 0 && subs[i].amount ? (rowRisk[i] / variance) * (l.amount / subs[i].amount) : 0;
  };
  const access = (p: Product) => (/Daily|Weekly/.test(p.liquidity) ? 0 : /Monthly|Quarterly/.test(p.liquidity) ? 1 : 2); // week / year / locked
  const cashLadder = [0, 1, 2].map((k) => (V ? lines.reduce((t, l) => t + (access(l.product) === k ? l.amount : 0), 0) / V : 0));
  const feeCost = lines.reduce((t, l) => t + l.amount * l.product.fee, 0);

  // ---- Why this mix: line-level covariance (same rules as the sub-class matrix above, so it reproduces vol exactly) ----
  const rho = (a: string, b: string) => {
    const x = sc.get(a)!, y = sc.get(b)!;
    return a === b ? 1 : A.corr[l1Index.get(x.l1)!][l1Index.get(y.l1)!];
  };
  const lw = lines.map((l) => l.weight), lv = lines.map((l) => l.product.vol), lr = lines.map((l) => l.product.ret);
  const lcov = lines.map((a, i) => lines.map((b, j) => lv[i] * lv[j] * rho(a.product.subclass, b.product.subclass)));
  const mix = (w: number[]) => {
    const r = w.reduce((t, x, i) => t + x * lr[i], 0);
    const v = w.reduce((t, x, i) => t + x * w.reduce((u, y, j) => u + y * lcov[i][j], 0), 0);
    return { ret: r, vol: Math.sqrt(Math.max(0, v)) };
  };
  const rf = sc.get("CA-MM")!.ret; // cash return as the risk-free hurdle
  const standalone = lw.reduce((t, x, i) => t + x * lv[i], 0);
  // each line's hurdle = cash + (its beta to this portfolio) x (portfolio excess return); at the best risk/return mix every surplus is 0
  const lineWhy = lines.map((l, i) => {
    const betaP = variance > 0 ? lw.reduce((t, x, j) => t + x * lcov[i][j], 0) / variance : 0;
    const hurdle = rf + betaP * (ret - rf);
    return { uid: l.uid, name: l.product.name, betaP, hurdle, surplus: l.product.ret - hurdle };
  });
  const pair = (ws: [string, number][]) => {
    const r = ws.reduce((t, [c, w]) => t + w * sc.get(c)!.ret, 0);
    const v = ws.reduce((t, [a, x]) => t + ws.reduce((u, [b, y]) => u + x * y * sc.get(a)!.vol * sc.get(b)!.vol * rho(a, b), 0), 0);
    return { ret: r, vol: Math.sqrt(v) };
  };
  // ponytail: plain random mixes (seeded, so the picture is stable), not an optimised frontier - no optimiser in the workbook
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const cloud = lines.length > 1 ? Array.from({ length: 600 }, () => {
    const g = lines.map(() => -Math.log(rand()));
    const t = g.reduce((a, b) => a + b, 0);
    return mix(g.map((x) => x / t));
  }) : [];
  const why = {
    standalone, diversification: standalone ? 1 - vol / standalone : 0, rf, lines: lineWhy, cloud,
    beaten: cloud.length ? cloud.filter((m) => m.ret >= ret && m.vol <= vol).length / cloud.length : 0,
    marks: [
      { name: "Classic 60/40", ...pair([["EQ-USLC", 0.6], ["FI-UST", 0.2], ["FI-IG", 0.2]]) },
      { name: "US stocks", ...pair([["EQ-USLC", 1]]) },
      { name: "Cash", ...pair([["CA-MM", 1]]) },
    ],
  };

  // ---- Asset Class Master rows 83-92 + Risk & Hedging rows 64-73: by Level-1 class ----
  const byL1 = A.l1.map((c) => {
    const ss = subs.filter((s) => s.l1 === c.code);
    const amount = ss.reduce((t, s) => t + s.amount, 0);
    const weight = V ? amount / V : 0;
    // amount-weighted over held sub-classes; with nothing held, the plain average of the defaults (or 0)
    const avg = (f: (s: (typeof subs)[number]) => number, def?: (s: (typeof subs)[number]) => number) =>
      amount ? ss.reduce((t, s) => t + s.amount * f(s), 0) / amount : def ? ss.reduce((t, s) => t + def(s), 0) / ss.length : 0;
    const eRet = avg((s) => s.eRet, (s) => s.ret);
    const riskShare = variance > 0 ? subs.reduce((t, s, i) => t + (s.l1 === c.code ? rowRisk[i] : 0), 0) / variance : 0;
    // F-sheet L1 rows: sub-class scores weighted by portfolio weight, plain average when nothing is held
    const factors = A.factors.map((_, k) => avg((s) => s.factors[k], (s) => s.factors[k]));
    const netFactor = factors.reduce((t, f, k) => t + f * A.factors[k].weight, 0);
    return {
      ...c, amount, weight, eRet, contribution: weight * eRet, riskShare, riskRatio: weight ? riskShare / weight : 0,
      lines: ss.reduce((t, s) => t + s.lines, 0),
      eVol: avg((s) => s.eVol, (s) => s.vol), eBeta: avg((s) => s.eBeta, (s) => s.beta), eRisk: avg((s) => s.eRisk, (s) => s.risk),
      inUsd: avg((s) => s.inUsd), usSitus: avg((s) => s.usSitus), nonDaily: avg((s) => s.nonDaily),
      factors, netFactor, outlook: outlook(netFactor),
    };
  });

  // ---- Scenarios ----
  const sub = (code: string) => sc.get(code)!.scen;
  const scenRet = [0, 1, 2, 3].map((k) => (V ? lines.reduce((t, l) => t + l.amount * l.scen[k], 0) / V : 0));
  const dot = (p: number[]) => p.reduce((t, x, k) => t + x * scenRet[k], 0);
  const scenarioModelReport = scenarioModel && data.scenarioEvidence
    ? calculateScenarioEngine({
        ...data.scenarioEvidence,
        scenarioReturns: { base: scenRet[0], bull: scenRet[1], bear: scenRet[2], tail: scenRet[3] },
        portfolioValue: V,
      })
    : scenarioModel;
  const scenarios = {
    list: A.scenarios.map((s, k) => ({
      ...s, prob: probs[k], ret: scenRet[k], value: V * (1 + scenRet[k]),
      sixtyForty: 0.6 * sub("EQ-USLC")[k] + 0.2 * sub("FI-UST")[k] + 0.2 * sub("FI-IG")[k], // Scenarios!E59
    })),
    probWeighted: dot(probs),
    engineWeighted: dot(engineProbabilities), // Scenario Engine!D65: engine odds, ignores the advisor override
    sixtyFortyWeighted: probs.reduce((t, p, k) => t + p * (0.6 * sub("EQ-USLC")[k] + 0.2 * sub("FI-UST")[k] + 0.2 * sub("FI-IG")[k]), 0), // Scenarios!I59
    pessimistic: dot(A.scenarios.map((s) => s.pessimistic)),
    optimistic: dot(A.scenarios.map((s) => s.optimistic)),
  };

  // ---- F1..F7 sheets row 89: portfolio net exposure per factor ----
  const factorExposure = A.factors.map((f, k) => {
    const exposure = subs.reduce((t, s) => t + s.weight * s.factors[k], 0);
    return { ...f, exposure, stance: le(exposure, -0.3) ? "Headwind" : ge(exposure, 0.3) ? "Tailwind" : "Balanced" };
  });
  const netFactor = factorExposure.reduce((t, f) => t + f.exposure * f.weight, 0); // Client Summary K227
  const factorSummary = { net: netFactor, outlook: ge(netFactor, 0.2) ? "Net tailwind" : le(netFactor, -0.2) ? "Net headwind" : "Balanced" };

  // ---- Next Best Actions B: portfolio hedges (rows 52-59) ----
  const sum = (f: (l: (typeof lines)[number]) => number) => lines.reduce((t, l) => t + f(l), 0);
  const bearK = 2, tailK = 3;
  const tail = scenRet[tailK], bear = scenRet[bearK];
  const capped = (n: number, k: number, code: string) => n * Math.min(0.15, Math.max(0, -sub(code)[k] - 0.1));
  const issuerExcess = sum((l) => l.issuerExcess), aiAmt = sum((l) => l.aiAmount), inrAmt = sum((l) => l.inrAmount);
  const capCalls = sum((l) => l.capCall), usSitusAmt = sum((l) => (situs(l.product) ? l.amount : 0));
  const fx = (k: number) => factorExposure[k].exposure;
  const eqN = V * beta * M.eqHedgeRatio, ratesN = (byL1.find((c) => c.code === "FI")?.amount ?? 0) * 0.2;
  const hedgeRows = [
    { hedge: "Equity drawdown hedge", trigger: "Tail-scenario loss <= -8% or beta >= 0.5", on: le(tail, -0.08) || ge(beta, 0.5),
      instrument: `S&P 500 put spread (90% / 75%), 6 months, rolled - about ${roundUp(eqN / (M.spx / 10 * 100))} SPY contracts`,
      notional: eqN, cost: eqN * M.putSpreadCost, bear: capped(eqN, bearK, "EQ-USLC"), tail: capped(eqN, tailK, "EQ-USLC"),
      why: "Caps equity-driven losses." },
    { hedge: "Single-name credit hedge", trigger: "Any bond above the single-issuer limit", on: issuerExcess > 0,
      instrument: "Reduce to the single-issuer limit (preferred); alternatively HY index protection (HYG puts / CDX HY)",
      notional: issuerExcess, cost: issuerExcess * M.hyProtCost,
      bear: -sum((l) => l.issuerExcess * l.scen[bearK]), tail: -sum((l) => l.issuerExcess * l.scen[tailK]),
      why: "Removes the largest idiosyncratic loss." },
    { hedge: "AI-concentration tail hedge", trigger: "AI-linked exposure above threshold", on: V > 0 && gt(aiAmt / V, L.aiExposure),
      instrument: "Nasdaq-100 put spread sized to AI-linked exposure, or cut AI-linked credit",
      notional: aiAmt, cost: aiAmt * M.putSpreadCost, bear: capped(aiAmt, bearK, "EQ-TECH"), tail: capped(aiAmt, tailK, "EQ-TECH"),
      why: "AI capex financing is the market's weakest link." },
    { hedge: "Rates / duration hedge", trigger: "Rates factor exposure <= -0.25", on: le(fx(0), -0.25),
      instrument: "Keep average bond duration <= 3 years; add T-bills / floating-rate notes",
      notional: ratesN, cost: ratesN * Math.max(0, M.usd5y - M.fedFunds),
      bear: ratesN * (sub("CA-MM")[bearK] - sub("FI-UST")[bearK]), tail: ratesN * (sub("CA-MM")[tailK] - sub("FI-UST")[tailK]),
      why: "Helps if yields head toward 6%; costs a little if a growth scare hits." },
    { hedge: "Inflation / oil hedge", trigger: "Inflation or oil factor exposure <= -0.25", on: le(fx(1), -0.25) || le(fx(3), -0.25),
      instrument: "Add ~3% in energy equities (P003) or TIPS (P014)",
      notional: V * 0.03, cost: 0, bear: V * 0.03 * sub("EQ-ENRG")[bearK], tail: V * 0.03 * sub("EQ-ENRG")[tailK],
      why: "Energy is the only equity sleeve that gains in stagflation." },
    { hedge: "INR currency hedge", trigger: "INR-exposed assets above 10%", on: V > 0 && gt(inrAmt / V, 0.1),
      instrument: "USD/INR NDF or forward on India AIF NAVs (50% hedge ratio)",
      notional: inrAmt * M.inrHedgeRatio, cost: inrAmt * M.inrHedgeRatio * Math.max(0, M.repo - M.fedFunds),
      bear: inrAmt * M.inrHedgeRatio * M.inrStress, tail: inrAmt * M.inrHedgeRatio * M.inrStress,
      why: "India AIFs are USD-denominated but their assets are in rupees." },
    { hedge: "Liquidity buffer for capital calls", trigger: "Capital calls due or illiquid share above limit",
      on: capCalls > 0 || gt(risk.nonDailyShare, client.maxIlliquid),
      instrument: "Hold T-bills / USD money market fund (P017) >= next-12-month capital calls",
      notional: capCalls, cost: capCalls * Math.max(0, ret - sc.get("CA-MM")!.ret), bear: 0, tail: 0,
      why: "Avoids forced selling of liquid assets to meet drawdowns." },
    { hedge: "US estate-tax exposure", trigger: "US-situs holdings above USD 60,000", on: gt(usSitusAmt, L.usEstateTax),
      instrument: "Move US-listed ETFs to UCITS equivalents, or arrange estate-tax cover / a holding structure",
      notional: usSitusAmt, cost: 0, bear: 0, tail: 0,
      why: "US estate tax can apply to US-situs assets of non-US persons." },
  ].map((h) => ({ ...h, status: h.on ? "RECOMMENDED" : "Not needed", costPct: V ? h.cost / V : 0 }));
  const rec = hedgeRows.filter((h) => h.on);
  const hCost = rec.reduce((t, h) => t + h.cost, 0);
  const hBear = rec.reduce((t, h) => t + h.bear, 0), hTail = rec.reduce((t, h) => t + h.tail, 0);
  const hedges = {
    rows: hedgeRows, cost: hCost, costPct: V ? hCost / V : 0, bearBenefit: hBear, tailBenefit: hTail,
    bearBefore: bear, tailBefore: tail,
    bearAfter: V ? bear + (hBear - hCost) / V : bear, tailAfter: V ? tail + (hTail - hCost) / V : tail,
  };

  // ---- Portfolio Builder A: mandate and look-through geography ----
  const mandate = client.sleeves.map((s) => {
    const actual = lines.filter((l) => l.sleeve === s.name).reduce((t, l) => t + l.amount, 0);
    const actualPct = client.amount > 0 ? actual / client.amount : 0;
    return { ...s, targetUsd: s.target * client.amount, actual, actualPct, gap: actualPct - s.target, status: statusOf(actualPct - s.target) };
  });
  const geography = client.geoTargets.map((g, k) => {
    const actual = lines.reduce((t, l) => t + l.amount * (l.product.geo[k] ?? 0), 0);
    const actualPct = client.amount > 0 ? actual / client.amount : 0;
    return { ...g, targetUsd: g.target * client.amount, actual, actualPct, gap: actualPct - g.target, status: statusOf(actualPct - g.target) };
  });

  // ---- Monitoring: market indicators are static; rows 10-15 are live ----
  const blocked = lines.filter((l) => l.eligibility.startsWith("BLOCKED")).length;
  const review = lines.filter((l) => l.eligibility.startsWith("REVIEW")).length;
  const nearBarrier = lines.filter((l) => l.amount > 0 && l.product.distToBarrier != null && l.product.distToBarrier < L.barrierProximity).length;
  const live: Record<number, number> = { 9: scenarioModel?.overallConfidenceScore ?? A.engineConfidence, 10: blocked, 11: review, 12: nearBarrier, 13: usSitusAmt };
  if (client.drawdown != null) live[14] = client.drawdown;
  const monitoring = A.monitoring.map((m, i) => {
    const current = live[i] ?? m.current;
    const worse = m.direction === "Higher is worse";
    const status = worse ? (ge(current, m.red) ? "RED" : ge(current, m.amber) ? "AMBER" : "GREEN")
      : le(current, m.red) ? "RED" : le(current, m.amber) ? "AMBER" : "GREEN";
    return { ...m, current, status, live: i in live };
  });

  // ---- Risk & Hedging rows 84-93: risk limits check ----
  const minScen = Math.min(...scenRet);
  const limit = (name: string, setting: number, actual: number, ok: boolean, watch: boolean, rule: string, kind: "pct" | "usd" | "count" = "pct") =>
    ({ name, setting, actual, status: ok ? "PASS" : watch ? "WATCH" : "BREACH", rule, kind });
  const riskLimits = [
    limit("Portfolio volatility vs target", client.targetVol, vol, le(vol, client.targetVol), le(vol, client.targetVol + 0.02), "WATCH = within 2 pts of target."),
    limit("Tough-year result (1 in 20) no worse than", -0.1, risk.toughYear, ge(risk.toughYear, -0.1), ge(risk.toughYear, -0.1 - 0.02), "Medium-risk tolerance for a rare bad year."),
    limit("Share in non-daily-liquidity products at most", client.maxIlliquid, risk.nonDailyShare, le(risk.nonDailyShare, client.maxIlliquid), false, "Keep 12-month cash needs covered; see liquidity hedge."),
    limit("Largest single line at most", L.largePosition, Math.max(0, ...lines.map((l) => l.weight)), le(Math.max(0, ...lines.map((l) => l.weight)), L.largePosition), false, "Trim at next rebalance."),
    limit("Largest single-issuer bond at most", L.singleIssuer, Math.max(0, ...lines.filter((l) => l.product.type === "Bond").map((l) => l.weight)),
      le(Math.max(0, ...lines.filter((l) => l.product.type === "Bond").map((l) => l.weight)), L.singleIssuer), false, "Diversify single-name credit."),
    limit("US-situs exposure (USD) at most", L.usEstateTax, usSitusAmt, le(usSitusAmt, L.usEstateTax), false, client.usPerson === "Yes" ? "Not applicable: client is a US person." : "Estate-tax exposure for non-US persons.", "usd"),
    limit("Lines blocked by eligibility checks", 0, blocked, blocked <= 0, false, "Fix before execution.", "count"),
    limit("Lines needing review (DD / ID)", 0, review, review <= 0, true, "Complete before commitment.", "count"),
    limit("All amounts mapped to a sub-asset class", 1, 1, true, false, "A line has an unknown or missing product."), // unknown IDs never reach the engine
    limit("Worst modelled scenario above drawdown review trigger", M.drawdownTrigger, minScen, ge(minScen, M.drawdownTrigger), false, "If breached, too risky for this profile."),
  ];

  // ---- Sensitivity: first-order what-ifs from data already in the workbook ----
  const eqBeta = sum((l) => l.amount * l.product.beta);
  const sensitivity = [
    ...[-0.2, -0.1, 0.1].map((x) => ({ shock: `US stocks (S&P 500) ${spct(x)}`, basis: "each line's beta to the S&P 500", usd: eqBeta * x })),
    ...[-0.05, -0.1].map((x) => ({ shock: `Rupee falls ${pct(-x)} vs USD`, basis: "lines whose assets are in INR", usd: inrAmt * x })),
  ].map((s) => ({ ...s, pct: V ? s.usd / V : 0 }));

  // ---- Market view: risk-on / risk-off from scenario odds and the market traffic lights ----
  // ponytail: house rule (not in the workbook) - thresholds 0.3 / 0.4 and red-light counts pending sign-off
  const market = monitoring.filter((m) => !m.live && m.linked !== "Next Best Actions" && !m.indicator.includes("drawdown"));
  const pDown = probs[bearK] + probs[tailK];
  const mRed = market.filter((m) => m.status === "RED").length, mAmber = market.filter((m) => m.status === "AMBER").length;
  const marketView = {
    view: pDown >= 0.4 || mRed >= 2 ? "Risk-off" : pDown <= 0.3 && mRed === 0 && mAmber <= 1 ? "Risk-on" : "Neutral",
    pUp: 1 - pDown, pDown, red: mRed, amber: mAmber, indicators: market.length,
  };

  const actions = [...lines].sort((a, b) => b.score - a.score);
  const counts = {
    lines: lines.length, blocked, review,
    high: lines.filter((l) => l.priority === "High").length, medium: lines.filter((l) => l.priority === "Medium").length,
    hedges: rec.length, red: monitoring.filter((m) => m.status === "RED").length, amber: monitoring.filter((m) => m.status === "AMBER").length,
  };

  // ---- Client Summary rows 15/21 and 292-296: totals status and key messages ----
  const sleeveOk = mandate.filter((m) => m.status === "On target").length, geoOk = geography.filter((g) => g.status === "On target").length;
  const mandateStatus = Math.round(mandate.reduce((t, m) => t + m.actual, 0)) === Math.round(V) ? "All lines mapped" : "Unmapped sleeve";
  const geoStatus = V && lt(Math.abs(geography.reduce((t, g) => t + g.actual, 0) / V - 1), 0.001) ? "Look-through complete" : "Check look-through %";
  const sp = (x: number) => signed(x * 100, 1, "%");
  const top = actions[0];
  const keyMessages = [
    `The advisor's construction (${usd(V)}) ${sleeveOk === mandate.length && geoOk === geography.length ? "meets" : "does not yet meet"} the mandate: sleeves ${sleeveOk}/${mandate.length} and geography ${geoOk}/${geography.length} on target. Expected return is ${pct(ret, 1)} a year in USD (${pct(retInr, 1)} in INR terms) with volatility of ${pct(vol, 1)}.`,
    `In an ordinary year the portfolio should end between ${usd(V * (1 + risk.lo))} and ${usd(V * (1 + risk.hi))}; a rare tough year (about 1 in 20) could take it to about ${usd(V * (1 + risk.toughYear))}.`,
    `Next 12 months: expected ${sp(scenarios.engineWeighted)} (range ${sp(scenarioModelReport?.expected12MonthReturn?.pessimistic ?? scenarios.pessimistic)} to ${sp(scenarioModelReport?.expected12MonthReturn?.optimistic ?? scenarios.optimistic)}), using probabilities blended from prediction markets, futures, options, nowcasts, shipping and credit data - confidence ${scenarioModel?.overallConfidence ?? A.engineConfidenceLevel}.`,
    `The engine raises ${counts.high} high-priority and ${counts.medium} medium-priority actions.${top ? ` Top priority: ${top.product.name} - ${top.action}.` : ""}`,
    `${rec.length} hedges are recommended; together they move the tail-scenario result from ${sp(hedges.tailBefore)} to ${sp(hedges.tailAfter)} after one year's cost.`,
  ];

  return {
    value: V, invested: client.amount, unallocated: client.amount - V, scenarioEngine: scenarioModelReport,
    lines: lines.map((l) => ({ ...l, riskShare: lineRisk(l) })), subs, byL1, risk, scenarios, cashLadder, feeCost, why, factorExposure, factorSummary, hedges, mandate, geography, mandateStatus, geoStatus,
    monitoring, actions, counts, keyMessages, riskLimits, sensitivity, marketView,
  };
}

export type Analysis = ReturnType<typeof analyse>;

// "What each line adds": re-run the engine without each line, the rest scaled up to the same total
export function withoutEach(client: Client, input: Line[], data: Data) {
  const V = input.reduce((t, l) => t + (l.amount || 0), 0);
  return input.map((l) => {
    const rest = input.filter((x) => x !== l), left = V - (l.amount || 0);
    const r = analyse(client, rest.map((x) => ({ ...x, amount: left ? ((x.amount || 0) * V) / left : 0 })), data);
    return { uid: l.uid, ret: r.risk.ret, vol: r.risk.vol, toughYear: r.risk.toughYear };
  });
}

export function defaultClient(A: Assumptions): Client {
  const c = A.client;
  return {
    name: c.name, riskProfile: c.riskProfile, horizon: c.horizon, target: c.target, amount: c.amount,
    accredited: c.accredited === "Yes" ? "Yes" : "No", accreditedVerified: c.accreditedVerified === "Yes" ? "Yes" : "No",
    usPerson: "No", maxIlliquid: A.market.maxIlliquid, targetVol: A.market.targetVol,
    sleeves: A.sleeves.map((s) => ({ ...s })), geoTargets: A.geoTargets.map((g) => ({ ...g })),
  };
}
