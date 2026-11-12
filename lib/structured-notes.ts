/**
 * Structured Notes sheet formula port (term-sheet rows 9:38).
 *
 * Formula sources: Structured Notes!H:K, AO:BI, BJ:BQ and rules D43:D54.
 * Factor scores and scenario returns are injected from the factor/scenario
 * engines so this module stays deterministic and does not duplicate lookups.
 */
import { normCdf, xround } from "./engine";

export type NoteScenario = { base: number; bull: number; bear: number; tail: number };
export type StructuredNoteDefaults = {
  code: string;
  level1: string;
  name: string;
  expectedReturn: number;
  volatility: number;
  beta: number;
  riskRating: number;
};
export type StructuredNoteInput = {
  id: string;
  structureType: string;
  issuerRating?: string | null;
  issuerDomicile?: string | null;
  underlyingSubclassCode?: string | null;
  tenorYears?: number | null;
  couponYield?: number | null;
  participation?: number | null;
  cap?: number | null;
  capitalProtection?: number | null;
  barrierStrike?: number | null;
  barrierObservation?: string | null;
  underlyingInitialLevel?: number | null;
  underlyingCurrentLevel?: number | null;
  annualFee?: number | null;
  factorScores?: number[] | null;
  underlyingScenarioReturns?: Partial<NoteScenario> | null;
};
export type StructuredNoteAssumptions = {
  assetClasses: StructuredNoteDefaults[];
  barrierIncomeBaseRisk: number;
  barrierIncomeBarrierSlope: number;
  protectedResidualExposure: number;
  protectedIncomeBaseRisk: number;
  lossGivenBreachFactor: number;
  protectedUpsideCapture: number;
  issuerCreditAdjustment: { low: number; medium: number; high: number };
  highIssuerRiskRatingAddon: number;
  americanBarrierRiskAddon: number;
  defaultIncomeCoupon: number;
};
export type DerivedStructuredNote = {
  id: string;
  subclassCode: string;
  assetClassCode: string;
  subclassName: string;
  payoffFamily: string;
  riskEquivalent: number;
  distanceToBarrier: number | "n/a";
  probabilityBelowBarrier: number;
  maximumLoss: number;
  expectedReturn: number;
  volatility: number;
  beta: number;
  riskRating: number;
  issuerCreditRisk: "Low" | "Medium" | "High" | "";
  usSitus: "Yes" | "No" | "";
  factorScores: number[];
  underlyingScenarioReturns: NoteScenario;
  noteScenarioReturns: NoteScenario;
  warnings: string[];
};

const isSet = (value: number | null | undefined) => value !== null && value !== undefined && Number.isFinite(value);
const valueOr = (value: number | null | undefined, fallback: number) => isSet(value) ? value! : fallback;
const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));
const scenarioKeys = ["base", "bull", "bear", "tail"] as const;

export function classifyStructuredNote(structureType: string): { subclassCode: string; payoffFamily: string } {
  if (["Capital Protected Note", "Protected Income Note"].includes(structureType)) {
    return { subclassCode: "SP-CPN", payoffFamily: structureType === "Protected Income Note" ? "Protected income" : "Protection / participation" };
  }
  if (["Reverse Convertible", "Autocallable", "Phoenix Autocallable"].includes(structureType)) {
    return { subclassCode: "SP-YLD", payoffFamily: "Income" };
  }
  if (["Participation Note", "Booster Note"].includes(structureType)) {
    return { subclassCode: "SP-PRT", payoffFamily: "Protection / participation" };
  }
  if (["AMC", "Tracker Certificate"].includes(structureType)) {
    return { subclassCode: "SP-AMC", payoffFamily: "Tracker" };
  }
  return { subclassCode: "", payoffFamily: "" };
}

export function deriveStructuredNote(
  note: StructuredNoteInput,
  assumptions: StructuredNoteAssumptions,
): DerivedStructuredNote {
  const warnings: string[] = [];
  const classification = classifyStructuredNote(note.structureType);
  const subclassCode = classification.subclassCode;
  const payoffFamily = classification.payoffFamily;
  const assetClass = assumptions.assetClasses.find((item) => item.code === (note.underlyingSubclassCode ?? ""));
  if (note.underlyingSubclassCode && !assetClass) warnings.push(`Unknown underlying sub-asset class code: ${note.underlyingSubclassCode}`);

  const underlyingExpectedReturn = assetClass?.expectedReturn ?? 0;
  const underlyingVolatility = assetClass?.volatility ?? 0;
  const underlyingBeta = assetClass?.beta ?? 0;
  const underlyingRisk = assetClass?.riskRating ?? 0;
  const barrier = valueOr(note.barrierStrike, 1);
  const protection = valueOr(note.capitalProtection, 0);
  const participation = valueOr(note.participation, 1);
  const tenor = valueOr(note.tenorYears, 0) > 0 ? valueOr(note.tenorYears, 1) : 1;

  // Structured Notes!AS: risk-equivalent factor by payoff family.
  let riskEquivalent = 0;
  if (subclassCode) {
    if (payoffFamily === "Income") {
      riskEquivalent = Math.min(1, assumptions.barrierIncomeBaseRisk + assumptions.barrierIncomeBarrierSlope * barrier);
    } else if (payoffFamily === "Tracker") {
      riskEquivalent = 1;
    } else if (payoffFamily === "Protected income") {
      riskEquivalent = Math.min(1, assumptions.protectedIncomeBaseRisk + 2 * (1 - protection));
    } else {
      riskEquivalent = Math.max(0, participation * ((1 - protection) + assumptions.protectedResidualExposure * protection));
    }
  }

  const initial = valueOr(note.underlyingInitialLevel, 0);
  const current = valueOr(note.underlyingCurrentLevel, 0);
  const validLevels = initial !== 0 && current !== 0;
  const distanceToBarrier = payoffFamily !== "Income" || !isSet(note.barrierStrike) || !validLevels
    ? "n/a" as const : current / initial - barrier;

  // Structured Notes!AU: lognormal probability of ending below the barrier.
  let probabilityBelowBarrier = 0;
  if ((payoffFamily === "Income" || payoffFamily === "Protected income") && underlyingVolatility !== 0) {
    const ratio = validLevels ? current / initial : 1;
    const z = (Math.log(barrier / ratio) -
      (underlyingExpectedReturn - 0.5 * underlyingVolatility ** 2) * tenor) /
      (underlyingVolatility * Math.sqrt(tenor));
    probabilityBelowBarrier = normCdf(z);
  }

  // Structured Notes!AV: maximum principal loss at maturity.
  const maximumLoss = !subclassCode ? 0 :
    payoffFamily === "Income" || payoffFamily === "Tracker" ? 1 : 1 - protection;

  // Structured Notes!AW: annualised expected return approximation by payoff family.
  const coupon = valueOr(note.couponYield, 0);
  const annualFee = valueOr(note.annualFee, 0);
  let expectedReturn = 0;
  if (subclassCode) {
    if (payoffFamily === "Income") {
      expectedReturn = coupon - probabilityBelowBarrier *
        (1 - assumptions.lossGivenBreachFactor * barrier) / tenor;
    } else if (payoffFamily === "Protected income") {
      expectedReturn = coupon - probabilityBelowBarrier * (1 - protection) *
        assumptions.lossGivenBreachFactor / tenor;
    } else if (payoffFamily === "Tracker") {
      expectedReturn = underlyingExpectedReturn - annualFee;
    } else {
      const participationReturn = participation * underlyingExpectedReturn *
        ((1 - protection) + assumptions.protectedUpsideCapture * protection);
      expectedReturn = !isSet(note.cap) ? participationReturn : Math.min(participationReturn, note.cap! / tenor);
    }
  }

  const volatility = riskEquivalent * underlyingVolatility;
  const beta = riskEquivalent * underlyingBeta;
  const issuerRating = note.issuerRating ?? "";
  const issuerCreditRisk = !issuerRating ? "" :
    ["AAA", "AA+", "AA", "AA-"].includes(issuerRating) ? "Low" :
    ["A+", "A", "A-"].includes(issuerRating) ? "Medium" : "High";
  const roundedRisk = xround(riskEquivalent * underlyingRisk) +
    (issuerCreditRisk === "High" ? assumptions.highIssuerRiskRatingAddon : 0) +
    (note.barrierObservation === "American (daily)" ? assumptions.americanBarrierRiskAddon : 0);
  const riskRating = !subclassCode ? 0 : clamp(roundedRisk, 1, 5);
  const usSitus = !note.issuerDomicile ? "" : note.issuerDomicile === "United States" ? "Yes" : "No";

  const rawFactors = note.factorScores ?? [];
  const factorScores = Array.from({ length: 7 }, (_, index) => {
    const underlyingScore = rawFactors[index] ?? 0;
    const creditAdjustment = index === 6
      ? issuerCreditRisk === "Low" ? assumptions.issuerCreditAdjustment.low
        : issuerCreditRisk === "Medium" ? assumptions.issuerCreditAdjustment.medium
        : issuerCreditRisk === "High" ? assumptions.issuerCreditAdjustment.high : 0
      : 0;
    return subclassCode && note.underlyingSubclassCode
      ? clamp(riskEquivalent * (underlyingScore + creditAdjustment), -2, 2)
      : 0;
  });

  const underlyingScenarioReturns = Object.fromEntries(
    scenarioKeys.map((key) => [key, valueOr(note.underlyingScenarioReturns?.[key], 0)]),
  ) as NoteScenario;
  const noteScenarioReturns = {} as NoteScenario;
  for (const key of scenarioKeys) {
    const underlying = underlyingScenarioReturns[key];
    if (!subclassCode) noteScenarioReturns[key] = 0;
    else if (payoffFamily === "Income") {
      noteScenarioReturns[key] = underlying < barrier - 1
        ? underlying : coupon + riskEquivalent * Math.min(0, underlying);
    } else if (payoffFamily === "Protected income") {
      noteScenarioReturns[key] = coupon + Math.max(protection - 1, Math.min(0, underlying));
    } else if (payoffFamily === "Tracker") {
      noteScenarioReturns[key] = underlying - annualFee;
    } else if (underlying >= 0) {
      noteScenarioReturns[key] = Math.min(
        isSet(note.cap) ? note.cap! : 9.99,
        participation * underlying * (protection > 0.5 ? assumptions.protectedUpsideCapture : 1),
      );
    } else {
      noteScenarioReturns[key] = Math.max(protection - 1, riskEquivalent * underlying);
    }
  }

  if (!subclassCode) warnings.push(`Unsupported structured-note type: ${note.structureType}`);
  if ((payoffFamily === "Income" || payoffFamily === "Protected income") && underlyingVolatility === 0) {
    warnings.push("Underlying volatility is zero; barrier probability is set to zero");
  }
  return {
    id: note.id, subclassCode, assetClassCode: subclassCode ? "SP" : "",
    subclassName: subclassCode, payoffFamily, riskEquivalent, distanceToBarrier,
    probabilityBelowBarrier, maximumLoss, expectedReturn, volatility, beta, riskRating,
    issuerCreditRisk, usSitus, factorScores, underlyingScenarioReturns, noteScenarioReturns, warnings,
  };
}
