import test from "node:test";
import assert from "node:assert/strict";
import { deriveStartHereDashboard, type StartHereDashboardInput } from "./start-here";

const workbookSnapshot: StartHereDashboardInput = {
  publicProductIds: Array.from({ length: 27 }, (_, i) => `P${i + 1}`),
  privateAssetIds: Array.from({ length: 6 }, (_, i) => `PR${i + 1}`),
  privateDueDiligenceStatuses: ["Approved", "Approved", "Approved", "Approved", "Review", "Pending"],
  structuredNoteIds: ["SN1", "SN2", "SN3", "SN4"],
  portfolioLineNames: Array.from({ length: 13 }, (_, i) => `Line ${i + 1}`),
  portfolioValue: 1_000_000,
  sleeveStatuses: ["On target", "On target", "On target", "On target", "On target"],
  geographyStatuses: ["On target", "On target", "On target"],
  eligibilityStatuses: ["OK", "REVIEW: due diligence pending", "OK"],
  annualReturn: 0.072,
  annualVolatility: 0.064,
  expected12MonthReturn: 0.043,
  scenarioConfidence: "Medium",
  actionPriorities: ["High", ...Array(7).fill("Medium")],
  hedgeStatuses: Array(6).fill("RECOMMENDED"),
};

test("Start Here dashboard matches all six saved Excel formula outputs", () => {
  assert.deepEqual(deriveStartHereDashboard(workbookSnapshot), {
    productAvailability: "27 public | 6 private (4 DD-approved) | 4 notes",
    portfolioConstruction: "13 lines | $1,000,000 | sleeves on target 5/5 | geography 3/3",
    eligibility: "0 blocked | 1 under review",
    riskAndScenarios: "Return 7.2% | volatility 6.4% | 12m expected +4.3% | confidence Medium",
    actionsAndHedges: "1 high / 7 medium actions | 6 hedges recommended",
    clientPresentation: "Ready",
  });
});

test("Start Here uses case-insensitive COUNTIF and prefix checks and treats blanks as absent", () => {
  const result = deriveStartHereDashboard({
    ...workbookSnapshot,
    publicProductIds: ["P1", "", null, undefined, "P2"],
    privateDueDiligenceStatuses: ["approved", "APPROVED", "Review"],
    sleeveStatuses: ["on target", "Off target", null],
    geographyStatuses: ["ON TARGET", "", "On target"],
    eligibilityStatuses: ["blocked: platform", "Blocked: minimum", "review: DD", "OK", null],
    actionPriorities: ["high", "MEDIUM", "medium", null],
    hedgeStatuses: ["recommended", "RECOMMENDED", "No"],
  });
  assert.equal(result.productAvailability, "2 public | 6 private (2 DD-approved) | 4 notes");
  assert.equal(result.portfolioConstruction, "13 lines | $1,000,000 | sleeves on target 1/5 | geography 2/3");
  assert.equal(result.eligibility, "2 blocked | 1 under review");
  assert.equal(result.actionsAndHedges, "1 high / 2 medium actions | 2 hedges recommended");
});

test("Start Here formats negative expected return with Excel's signed percent convention", () => {
  const result = deriveStartHereDashboard({ ...workbookSnapshot, expected12MonthReturn: -0.025 });
  assert.match(result.riskAndScenarios, /12m expected -2\.5%/);
});

test("Start Here rejects non-finite linked numeric outputs", () => {
  assert.throws(
    () => deriveStartHereDashboard({ ...workbookSnapshot, portfolioValue: Number.NaN }),
    /Portfolio Builder!E64 must be finite/,
  );
});
