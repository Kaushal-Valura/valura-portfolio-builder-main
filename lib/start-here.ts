/**
 * Start Here sheet status formulas.
 *
 * Workbook formulas: Start Here!F6:F11. This is a dashboard-only sheet:
 * it aggregates counts and formatted outputs from the master, portfolio,
 * risk, scenario, and next-best-action sheets; it does not introduce new
 * investment assumptions.
 */

export type StartHereDashboardInput = {
  publicProductIds: readonly (string | null | undefined)[];
  privateAssetIds: readonly (string | null | undefined)[];
  privateDueDiligenceStatuses: readonly (string | null | undefined)[];
  structuredNoteIds: readonly (string | null | undefined)[];
  portfolioLineNames: readonly (string | null | undefined)[];
  portfolioValue: number;
  sleeveStatuses: readonly (string | null | undefined)[];
  geographyStatuses: readonly (string | null | undefined)[];
  eligibilityStatuses: readonly (string | null | undefined)[];
  annualReturn: number;
  annualVolatility: number;
  expected12MonthReturn: number;
  scenarioConfidence: string;
  actionPriorities: readonly (string | null | undefined)[];
  hedgeStatuses: readonly (string | null | undefined)[];
};

export type StartHereDashboard = {
  productAvailability: string;
  portfolioConstruction: string;
  eligibility: string;
  riskAndScenarios: string;
  actionsAndHedges: string;
  clientPresentation: "Ready";
};

const countText = (values: readonly (string | null | undefined)[]) =>
  values.filter((value) => typeof value === "string" && value.length > 0).length;

const countExact = (values: readonly (string | null | undefined)[], expected: string) =>
  values.filter((value) => typeof value === "string" && value.toLocaleUpperCase() === expected.toLocaleUpperCase()).length;

const countPrefix = (values: readonly (string | null | undefined)[], prefix: string) =>
  values.filter((value) => typeof value === "string" && value.slice(0, prefix.length).toLocaleUpperCase() === prefix.toLocaleUpperCase()).length;

// Excel TEXT uses decimal half-away-from-zero rounding, not JS toFixed's binary rounding.
function excelRound(value: number, decimals: number): number {
  const scale = 10 ** decimals;
  return Math.sign(value) * Math.round(Number((Math.abs(value) * scale).toPrecision(15))) / scale;
}

function percent(value: number): string {
  const rounded = excelRound(value * 100, 1);
  return `${rounded.toFixed(1)}%`;
}

function signedPercent(value: number): string {
  const rounded = excelRound(value * 100, 1);
  return `${rounded >= 0 ? "+" : ""}${rounded.toFixed(1)}%`;
}

function dollars(value: number): string {
  const rounded = excelRound(value, 0);
  return `${rounded < 0 ? "-" : ""}$${Math.abs(rounded).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) throw new Error(`${field} must be finite`);
}

/** Exact Start Here!F6:F11 status strings, with the workbook's fixed row ranges supplied by the caller. */
export function deriveStartHereDashboard(input: StartHereDashboardInput): StartHereDashboard {
  assertFinite(input.portfolioValue, "Portfolio Builder!E64");
  assertFinite(input.annualReturn, "Risk & Hedging!C6");
  assertFinite(input.annualVolatility, "Risk & Hedging!C8");
  assertFinite(input.expected12MonthReturn, "Scenario Engine!D65");

  return {
    // Start Here!F6
    productAvailability:
      `${countText(input.publicProductIds)} public | ${countText(input.privateAssetIds)} private (${countExact(input.privateDueDiligenceStatuses, "Approved")} DD-approved) | ${countText(input.structuredNoteIds)} notes`,
    // Start Here!F7
    portfolioConstruction:
      `${countText(input.portfolioLineNames)} lines | ${dollars(input.portfolioValue)} | sleeves on target ${countExact(input.sleeveStatuses, "On target")}/5 | geography ${countExact(input.geographyStatuses, "On target")}/3`,
    // Start Here!F8
    eligibility:
      `${countPrefix(input.eligibilityStatuses, "BLOCKED")} blocked | ${countPrefix(input.eligibilityStatuses, "REVIEW")} under review`,
    // Start Here!F9
    riskAndScenarios:
      `Return ${percent(input.annualReturn)} | volatility ${percent(input.annualVolatility)} | 12m expected ${signedPercent(input.expected12MonthReturn)} | confidence ${input.scenarioConfidence}`,
    // Start Here!F10
    actionsAndHedges:
      `${countExact(input.actionPriorities, "High")} high / ${countExact(input.actionPriorities, "Medium")} medium actions | ${countExact(input.hedgeStatuses, "RECOMMENDED")} hedges recommended`,
    // Start Here!F11
    clientPresentation: "Ready",
  };
}
