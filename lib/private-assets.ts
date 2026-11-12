/**
 * Private Assets Master sheet formula port (rows 9:48).
 *
 * Formula sources: Private Assets Master!I:J, AX:BE and D5.
 * Access eligibility is evaluated by the existing portfolio engine; this
 * module derives the master-sheet model parameters and transparent checks.
 */

export type PrivateAssetDefaults = {
  code: string;
  level1: string;
  name: string;
  expectedReturn: number;
  volatility: number;
  beta: number;
  riskRating: number;
};

export type PrivateAssetInput = {
  id: string;
  subclassCode: string;
  domicile?: string | null;
  structure?: string | null;
  redemptionFrequency?: string | null;
  managementFee?: number | null;
  performanceFee?: number | null;
  hurdle?: number | null;
  targetGrossIrr?: number | null;
  targetNetIrr?: number | null;
  reportedVolatility?: number | null;
  desmoothingFactor?: number | null;
  betaToListedMarkets?: number | null;
  dueDiligenceRating?: number | null;
  geography: { us: number | null; india: number | null; restOfWorld: number | null };
  scenarioOverrides?: Partial<Record<"base" | "bull" | "bear" | "tail", number | null>>;
};

export type PrivateAssetAssumptions = {
  realisationFactor: number;
  assetClasses: PrivateAssetDefaults[];
};

export type DerivedPrivateAsset = {
  id: string;
  assetClassCode: string;
  subclassName: string;
  expectedReturn: number;
  volatility: number;
  beta: number;
  riskRating: number;
  liquidityClass: string;
  feeDrag: number;
  usSitus: "Yes" | "No" | "";
  geographyCheck: "OK" | "CHECK" | "";
  scenarioOverrides: PrivateAssetInput["scenarioOverrides"];
  warnings: string[];
};

const numeric = (value: number | null | undefined): value is number =>
  value !== null && value !== undefined && Number.isFinite(value);

export function derivePrivateAsset(
  fund: PrivateAssetInput,
  assumptions: PrivateAssetAssumptions,
): DerivedPrivateAsset {
  const warnings: string[] = [];
  const hasSubclass = fund.subclassCode.trim() !== "";
  const assetClass = assumptions.assetClasses.find((item) => item.code === fund.subclassCode);
  if (hasSubclass && !assetClass) warnings.push(`Unknown sub-asset class code: ${fund.subclassCode}`);

  // Private Assets Master!AX: net target IRR is discounted by the house realisation factor.
  const expectedReturn = !hasSubclass ? 0 :
    numeric(fund.targetNetIrr) ? fund.targetNetIrr * assumptions.realisationFactor :
    assetClass?.expectedReturn ?? 0;

  // Private Assets Master!AY: de-smooth reported volatility where supplied.
  const volatility = !hasSubclass ? 0 :
    numeric(fund.reportedVolatility)
      ? fund.reportedVolatility * (numeric(fund.desmoothingFactor) ? fund.desmoothingFactor : 1)
      : assetClass?.volatility ?? 0;
  const beta = !hasSubclass ? 0 :
    numeric(fund.betaToListedMarkets) ? fund.betaToListedMarkets : assetClass?.beta ?? 0;

  // Private Assets Master!BA: base class risk, +1 for DD rating 1 or 2, capped at 5.
  const baseRisk = assetClass?.riskRating ?? 3;
  const ddPenalty = numeric(fund.dueDiligenceRating) && fund.dueDiligenceRating > 0 && fund.dueDiligenceRating <= 2 ? 1 : 0;
  const riskRating = !hasSubclass ? 0 : Math.min(5, baseRisk + ddPenalty);

  // Private Assets Master!BB: only the listed redemption frequencies are liquid buckets.
  const frequency = fund.redemptionFrequency ?? "";
  const liquidityClass = !fund.id ? "" :
    fund.structure === "Closed-ended" ? "Locked (lock-up)" :
    ["Daily", "Weekly", "Monthly", "Quarterly"].includes(frequency) ? frequency : "Locked (lock-up)";

  // Private Assets Master!BC: approximate annual fee drag, not an IRR waterfall.
  const feeDrag = !fund.id ? 0 :
    (fund.managementFee ?? 0) +
    (fund.performanceFee ?? 0) * Math.max(0, (fund.targetGrossIrr ?? 0) - (fund.hurdle ?? 0));

  const usSitus = !fund.domicile ? "" : fund.domicile === "United States" ? "Yes" : "No";
  const geoTotal = [fund.geography.us, fund.geography.india, fund.geography.restOfWorld]
    .reduce<number>((total, value) => total + (value ?? 0), 0);
  const geographyCheck = !fund.id ? "" : Math.abs(geoTotal - 1) < 0.001 ? "OK" : "CHECK";
  if (geographyCheck === "CHECK") warnings.push("Look-through geography does not sum to 100%");

  return {
    id: fund.id,
    assetClassCode: assetClass?.level1 ?? (hasSubclass ? "Unknown code" : ""),
    subclassName: assetClass?.name ?? (hasSubclass ? "Unknown code" : ""),
    expectedReturn, volatility, beta, riskRating, liquidityClass, feeDrag, usSitus,
    geographyCheck, scenarioOverrides: fund.scenarioOverrides, warnings,
  };
}

export function derivePrivateAssets(
  funds: PrivateAssetInput[],
  assumptions: PrivateAssetAssumptions,
): DerivedPrivateAsset[] {
  return funds.map((fund) => derivePrivateAsset(fund, assumptions));
}
