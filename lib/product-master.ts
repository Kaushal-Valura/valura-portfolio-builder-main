/**
 * Product Master sheet formula port (public product rows 9:88).
 *
 * Formula sources: Product Master!G:H, U, AT:AX.
 * Master defaults and credit assumptions are injected, not duplicated here.
 */

export type AssetClassDefaults = {
  code: string;
  level1: string;
  name: string;
  expectedReturn: number;
  volatility: number;
  beta: number;
  riskRating: number;
};

export type CreditDefault = { rating: string; annualDefaultProbability: number };

export type PublicProductInput = {
  id: string;
  name?: string;
  subclassCode: string;
  domicile?: string | null;
  usSitusOverride?: "Yes" | "No" | "" | null;
  geography: { us: number | null; india: number | null; restOfWorld: number | null };
  yieldToMaturity?: number | null;
  creditRating?: string | null;
  expectedReturnOverride?: number | null;
  volatilityOverride?: number | null;
  betaOverride?: number | null;
  riskOverride?: number | null;
  scenarioOverrides?: Partial<Record<"base" | "bull" | "bear" | "tail", number | null>>;
};

export type ProductMasterAssumptions = {
  fiveYearTreasuryYield: number;
  lossGivenDefault: number;
  creditSpreadExpectedLossShare: number;
  assetClasses: AssetClassDefaults[];
  creditDefaults: CreditDefault[];
};

export type DerivedPublicProduct = {
  id: string;
  assetClassCode: string;
  subclassName: string;
  usSitus: "Yes" | "No" | "";
  expectedReturn: number;
  volatility: number;
  beta: number;
  riskRating: number;
  geographyCheck: "OK" | "CHECK" | "";
  scenarioOverrides: PublicProductInput["scenarioOverrides"];
  warnings: string[];
};

const isSet = (value: number | null | undefined) => value !== null && value !== undefined;

export function derivePublicProduct(
  product: PublicProductInput,
  assumptions: ProductMasterAssumptions,
): DerivedPublicProduct {
  const warnings: string[] = [];
  const assetClass = assumptions.assetClasses.find((item) => item.code === product.subclassCode);
  const hasSubclass = product.subclassCode.trim() !== "";

  if (hasSubclass && !assetClass) warnings.push(`Unknown sub-asset class code: ${product.subclassCode}`);

  // Product Master!U: explicit override wins; otherwise US domicile implies US situs.
  const usSitus = !product.domicile ? "" :
    product.usSitusOverride !== null && product.usSitusOverride !== undefined && product.usSitusOverride !== ""
      ? product.usSitusOverride
      : product.domicile === "United States" ? "Yes" : "No";

  // Product Master!AT: override > bond/YTM expected return > asset-class default.
  let expectedReturn = 0;
  if (hasSubclass) {
    if (isSet(product.expectedReturnOverride)) {
      expectedReturn = product.expectedReturnOverride!;
    } else if (isSet(product.yieldToMaturity)) {
      const rating = assumptions.creditDefaults.find((item) => item.rating === (product.creditRating ?? ""));
      const ratingDefaultProbability = rating?.annualDefaultProbability ?? 0.02;
      const ratingLoss = ratingDefaultProbability * assumptions.lossGivenDefault;
      const spreadLoss = Math.max(0, product.yieldToMaturity! - assumptions.fiveYearTreasuryYield) *
        assumptions.creditSpreadExpectedLossShare;
      expectedReturn = product.yieldToMaturity! - Math.max(ratingLoss, spreadLoss);
    } else {
      expectedReturn = assetClass?.expectedReturn ?? 0;
    }
  }

  const volatility = !hasSubclass ? 0 :
    isSet(product.volatilityOverride) ? product.volatilityOverride! : assetClass?.volatility ?? 0;
  const beta = !hasSubclass ? 0 :
    isSet(product.betaOverride) ? product.betaOverride! : assetClass?.beta ?? 0;
  const riskRating = !hasSubclass ? 0 :
    isSet(product.riskOverride) ? product.riskOverride! : assetClass?.riskRating ?? 0;

  // Product Master!AX: Excel N() treats blank geography cells as zero.
  const geoValues = [product.geography.us, product.geography.india, product.geography.restOfWorld];
  const geographyCheck = !product.id ? "" :
    Math.abs(geoValues.reduce((total, value) => total + (value ?? 0), 0) - 1) < 0.001 ? "OK" : "CHECK";
  if (geographyCheck === "CHECK") warnings.push("Look-through geography does not sum to 100%");

  return {
    id: product.id,
    assetClassCode: assetClass?.level1 ?? (hasSubclass ? "Unknown code" : ""),
    subclassName: assetClass?.name ?? (hasSubclass ? "Unknown code" : ""),
    usSitus,
    expectedReturn,
    volatility,
    beta,
    riskRating,
    geographyCheck,
    scenarioOverrides: product.scenarioOverrides,
    warnings,
  };
}

export function derivePublicProducts(
  products: PublicProductInput[],
  assumptions: ProductMasterAssumptions,
): DerivedPublicProduct[] {
  return products.map((product) => derivePublicProduct(product, assumptions));
}
