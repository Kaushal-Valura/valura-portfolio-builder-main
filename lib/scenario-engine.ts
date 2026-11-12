/**
 * Scenario Engine sheet port.
 *
 * Formula sources: Scenario Engine!D10:G12, rows 17:46, D50:G61,
 * D53:G59, D65:E67, D71:E81 and G87:G97.
 *
 * This module deliberately accepts manually refreshed evidence. It does not
 * fetch market data; providers and credentials are a separate integration.
 */

export const SCENARIOS = ["base", "bull", "bear", "tail"] as const;
export type ScenarioKey = (typeof SCENARIOS)[number];

export type ScenarioVector = Record<ScenarioKey, number>;

export type ScenarioSignal = {
  id?: string;
  name: string;
  family: string;
  source?: string;
  reading?: string;
  observedAt?: string | Date | null;
  probabilities: ScenarioVector;
  reliability: number;
  translation?: string;
};

export type CalibrationEntry = {
  statement?: string;
  probability?: number | null;
  outcome?: 0 | 1 | null;
};

export type ScenarioEngineInput = {
  asOf: string | Date;
  housePrior: ScenarioVector;
  evidenceWeight: number;
  freshnessHalfLifeDays: number;
  signals: ScenarioSignal[];
  calibration?: CalibrationEntry[];
  scenarioReturns?: ScenarioVector;
  portfolioValue?: number;
};

export type SignalResult = ScenarioSignal & {
  rowTotal: number;
  ageDays: number;
  freshnessWeight: number;
  effectiveWeight: number;
  accepted: boolean;
  issues: string[];
};

export type ScenarioEngineResult = {
  evidenceBlend: ScenarioVector;
  disagreement: ScenarioVector;
  housePrior: ScenarioVector;
  finalProbabilities: ScenarioVector;
  pessimisticProbabilities: ScenarioVector;
  optimisticProbabilities: ScenarioVector;
  confidenceByScenario: Record<ScenarioKey, "High" | "Medium" | "Low">;
  overallConfidenceScore: number;
  overallConfidence: "High" | "Medium" | "Low";
  totalEffectiveWeight: number;
  signalsUpdatedLast30Days: number;
  signals: SignalResult[];
  familyWeights: Record<string, { effectiveWeight: number; share: number }>;
  expected12MonthReturn?: { central: number; pessimistic: number; optimistic: number };
  projectedPortfolioValue?: { central: number; pessimistic: number; optimistic: number };
  brierScore: number | null;
  calibration: { statement?: string; probability: number; outcome: 0 | 1; squaredError: number }[];
  warnings: string[];
};

const sum = (v: ScenarioVector) => SCENARIOS.reduce((n, k) => n + v[k], 0);
const vector = (values: number[]): ScenarioVector => ({
  base: values[0], bull: values[1], bear: values[2], tail: values[3],
});
const clampZero = (n: number) => Math.max(0, n);
const confidence = (sd: number): "High" | "Medium" | "Low" =>
  sd <= 0.05 ? "High" : sd <= 0.1 ? "Medium" : "Low";

function dayNumber(value: string | Date, field: string): number {
  const date = value instanceof Date ? value : new Date(value);
  const ms = date.getTime();
  if (!Number.isFinite(ms)) throw new Error(`Invalid ${field} date: ${String(value)}`);
  return ms / 86_400_000;
}

function validateProbabilityVector(value: ScenarioVector, label: string, warnings: string[]) {
  const total = sum(value);
  if (SCENARIOS.some((key) => !Number.isFinite(value[key]))) {
    throw new Error(`${label} must contain four finite probabilities`);
  }
  if (Math.abs(total - 1) > 0.001) {
    warnings.push(`${label} totals ${total.toFixed(6)} rather than 1.000000`);
  }
}

export function calculateScenarioEngine(input: ScenarioEngineInput): ScenarioEngineResult {
  if (!Number.isFinite(input.evidenceWeight) || input.evidenceWeight < 0 || input.evidenceWeight > 1) {
    throw new Error("evidenceWeight must be between 0 and 1");
  }
  if (!Number.isFinite(input.freshnessHalfLifeDays) || input.freshnessHalfLifeDays <= 0) {
    throw new Error("freshnessHalfLifeDays must be greater than zero");
  }

  const warnings: string[] = [];
  validateProbabilityVector(input.housePrior, "House prior", warnings);
  const asOfDay = dayNumber(input.asOf, "valuation");
  const signals: SignalResult[] = input.signals.map((signal) => {
    const issues: string[] = [];
    const rowTotal = sum(signal.probabilities);
    const named = signal.name.trim().length > 0;
    const validTotal = Number.isFinite(rowTotal) && Math.abs(rowTotal - 1) <= 0.001;
    if (!named) issues.push("Signal name is blank; excluded from evidence");
    if (!validTotal) issues.push("Scenario probabilities do not sum to 100%; excluded from evidence");
    if (!Number.isFinite(signal.reliability)) {
      issues.push("Reliability is non-numeric and contributes zero, matching Excel N()");
    } else if (signal.reliability < 1 || signal.reliability > 5) {
      // The sheet describes a 1–5 scale but its formula uses the entered
      // numeric value directly; preserve that formula rather than clamping.
      warnings.push(`Signal "${signal.name}" has reliability outside the suggested 1–5 range`);
    }
    if (SCENARIOS.some((key) => !Number.isFinite(signal.probabilities[key]))) {
      issues.push("Signal probabilities must be finite");
    }

    const hasDate = signal.observedAt !== undefined && signal.observedAt !== null && signal.observedAt !== "";
    const ageDays = hasDate ? Math.max(0, asOfDay - dayNumber(signal.observedAt as string | Date, "signal")) : 0;
    const freshnessWeight = hasDate ? Math.pow(0.5, ageDays / input.freshnessHalfLifeDays) : 0;
    const accepted = named && validTotal && issues.length === 0;
    const effectiveWeight = accepted ? signal.reliability * freshnessWeight : 0;
    if (named && !hasDate) issues.push("Signal has no date; freshness weight is zero");
    return { ...signal, rowTotal, ageDays, freshnessWeight, effectiveWeight, accepted, issues };
  });

  const totalEffectiveWeight = signals.reduce((n, signal) => n + signal.effectiveWeight, 0);
  const evidenceBlend = totalEffectiveWeight === 0
    ? { ...input.housePrior }
    : vector(SCENARIOS.map((key) =>
        signals.reduce((n, signal) => n + signal.effectiveWeight * signal.probabilities[key], 0) /
        totalEffectiveWeight,
      ));

  const disagreement = vector(SCENARIOS.map((key) => totalEffectiveWeight === 0 ? 0 : Math.sqrt(
    signals.reduce((n, signal) => n + signal.effectiveWeight * Math.pow(signal.probabilities[key] - evidenceBlend[key], 2), 0) /
    totalEffectiveWeight,
  )));

  const mixed = vector(SCENARIOS.map((key) =>
    input.evidenceWeight * evidenceBlend[key] + (1 - input.evidenceWeight) * input.housePrior[key],
  ));
  const mixedTotal = sum(mixed);
  const finalProbabilities = mixedTotal === 0 ? { ...input.housePrior } : vector(SCENARIOS.map((key) => mixed[key] / mixedTotal));

  // Excel formulas D54:G55: deliberately preserve the sheet's exact +/- one-SD
  // construction. The resulting bands can exceed 100% when the adjustments do.
  const pessimisticValues = [
    Math.max(0, finalProbabilities.bull - disagreement.bull),
    finalProbabilities.bear + disagreement.bear,
    finalProbabilities.tail + disagreement.tail,
  ];
  const pessimisticProbabilities = {
    base: clampZero(1 - pessimisticValues.reduce((a, b) => a + b, 0)),
    bull: pessimisticValues[0], bear: pessimisticValues[1], tail: pessimisticValues[2],
  };
  const optimisticValues = [
    finalProbabilities.bull + disagreement.bull,
    Math.max(0, finalProbabilities.bear - disagreement.bear),
    Math.max(0, finalProbabilities.tail - disagreement.tail),
  ];
  const optimisticProbabilities = {
    base: clampZero(1 - optimisticValues.reduce((a, b) => a + b, 0)),
    bull: optimisticValues[0], bear: optimisticValues[1], tail: optimisticValues[2],
  };

  const averageDisagreement = SCENARIOS.reduce((n, key) => n + disagreement[key], 0) / 4;
  const overallConfidenceScore = Math.max(0, 1 - averageDisagreement / 0.15);
  const confidenceByScenario = Object.fromEntries(
    SCENARIOS.map((key) => [key, confidence(disagreement[key])]),
  ) as Record<ScenarioKey, "High" | "Medium" | "Low">;
  const overallConfidence = overallConfidenceScore >= 0.7 ? "High" : overallConfidenceScore >= 0.5 ? "Medium" : "Low";

  const familyWeights: ScenarioEngineResult["familyWeights"] = {};
  for (const signal of signals) {
    const family = signal.family || "Unclassified";
    familyWeights[family] ??= { effectiveWeight: 0, share: 0 };
    familyWeights[family].effectiveWeight += signal.effectiveWeight;
  }
  for (const item of Object.values(familyWeights)) {
    item.share = totalEffectiveWeight === 0 ? 0 : item.effectiveWeight / totalEffectiveWeight;
  }

  let expected12MonthReturn: ScenarioEngineResult["expected12MonthReturn"];
  let projectedPortfolioValue: ScenarioEngineResult["projectedPortfolioValue"];
  if (input.scenarioReturns) {
    expected12MonthReturn = {
      central: sumProducts(finalProbabilities, input.scenarioReturns),
      pessimistic: sumProducts(pessimisticProbabilities, input.scenarioReturns),
      optimistic: sumProducts(optimisticProbabilities, input.scenarioReturns),
    };
    if (input.portfolioValue !== undefined) {
      projectedPortfolioValue = {
        central: input.portfolioValue * (1 + expected12MonthReturn.central),
        pessimistic: input.portfolioValue * (1 + expected12MonthReturn.pessimistic),
        optimistic: input.portfolioValue * (1 + expected12MonthReturn.optimistic),
      };
    }
  }

  const calibration = (input.calibration ?? []).flatMap((entry) => {
    if (entry.probability === undefined || entry.probability === null || entry.outcome === undefined || entry.outcome === null) return [];
    if (!Number.isFinite(entry.probability) || entry.probability < 0 || entry.probability > 1) {
      warnings.push("A calibration probability outside 0–1 was excluded");
      return [];
    }
    const squaredError = Math.pow(entry.probability - entry.outcome, 2);
    return [{ statement: entry.statement, probability: entry.probability, outcome: entry.outcome, squaredError }];
  });
  const brierScore = calibration.length
    ? calibration.reduce((n, entry) => n + entry.squaredError, 0) / calibration.length
    : null;

  const signalsUpdatedLast30Days = signals.filter((signal) =>
    signal.name.trim() !== "" && signal.ageDays <= 30,
  ).length;

  if (pessimisticProbabilities.base + pessimisticProbabilities.bull + pessimisticProbabilities.bear + pessimisticProbabilities.tail > 1.0000001) {
    warnings.push("Pessimistic probability band exceeds 100%, matching the workbook's unnormalised +/- standard-deviation formula");
  }
  if (optimisticProbabilities.base + optimisticProbabilities.bull + optimisticProbabilities.bear + optimisticProbabilities.tail > 1.0000001) {
    warnings.push("Optimistic probability band exceeds 100%, matching the workbook's unnormalised +/- standard-deviation formula");
  }

  return {
    evidenceBlend, disagreement, housePrior: { ...input.housePrior }, finalProbabilities,
    pessimisticProbabilities, optimisticProbabilities, confidenceByScenario,
    overallConfidenceScore, overallConfidence, totalEffectiveWeight, signalsUpdatedLast30Days,
    signals, familyWeights, expected12MonthReturn, projectedPortfolioValue,
    brierScore, calibration, warnings,
  };
}

function sumProducts(a: ScenarioVector, b: ScenarioVector): number {
  return SCENARIOS.reduce((n, key) => n + a[key] * b[key], 0);
}
