/**
 * Product Master sheet formula port (public product rows 9:88).
 *
 * Excel formula outputs:
 *   G  -> Asset Class Master!D lookup (Level 1)
 *   H  -> Asset Class Master!E lookup (sub-asset-class name)
 *   U  -> domicile / explicit US-situs override
 *   AT -> return override, bond credit-loss calculation, or asset-class default
 *   AU -> volatility override or asset-class default
 *   AV -> beta override or asset-class default
 *   AW -> risk override or asset-class default
 *   AX -> look-through geography sum check
 *
 * The repeated row formulas are represented once here. All workbook assumptions
 * (Treasury yield, LGD, credit-spread loss share, rating defaults and asset-class
 * defaults) are injected from the master-data adapter; no business constants
 * are duplicated in this module.
 */

export const PRODUCT_MASTER_FIRST_ROW = 9;
export const PRODUCT_MASTER_LAST_ROW = 88;
export const PRODUCT_MASTER_CAPACITY = PRODUCT_MASTER_LAST_ROW - PRODUCT_MASTER_FIRST_ROW + 1;

export const PRODUCT_MASTER_FORMULA_MAP = {
  G: { output: "assetClassName", formula: "IF(Frow=\"\",\"\",IFERROR(lookup(Frow,AssetClassMaster.B7:B39,AssetClassMaster.D7:D39),\"Unknown code\"))", dependencies: ["F", "Asset Class Master!B7:B39", "Asset Class Master!D7:D39"] },
  H: { output: "subclassName", formula: "IF(Frow=\"\",\"\",IFERROR(lookup(Frow,AssetClassMaster.B7:B39,AssetClassMaster.E7:E39),\"Unknown code\"))", dependencies: ["F", "Asset Class Master!B7:B39", "Asset Class Master!E7:E39"] },
  U: { output: "usSitus", formula: "IF(Srow=\"\",\"\",IF(Trow<>\"\",Trow,IF(Srow=\"United States\",\"Yes\",\"No\")))", dependencies: ["S", "T"] },
  AT: { output: "expectedReturn", formula: "IF(Frow=\"\",0,IF(ALrow<>\"\",ALrow,IF(ISNUMBER(ACrow),ACrow-MAX(ratingDefault*LGD,MAX(0,ACrow-Treasury5Y)*spreadLossShare),assetClassReturn)))", dependencies: ["F", "AL", "AC", "Z", "Product Master!C93:D110", "Inputs!D45", "Inputs!D51", "Inputs!D52", "Asset Class Master!B7:B39", "Asset Class Master!N7:N39"] },
  AU: { output: "volatility", formula: "IF(Frow=\"\",0,IF(AMrow<>\"\",AMrow,assetClassVolatility))", dependencies: ["F", "AM", "Asset Class Master!B7:B39", "Asset Class Master!O7:O39"] },
  AV: { output: "beta", formula: "IF(Frow=\"\",0,IF(ANrow<>\"\",ANrow,assetClassBeta))", dependencies: ["F", "AN", "Asset Class Master!B7:B39", "Asset Class Master!P7:P39"] },
  AW: { output: "riskRating", formula: "IF(Frow=\"\",0,IF(AOrow<>\"\",AOrow,assetClassRisk))", dependencies: ["F", "AO", "Asset Class Master!B7:B39", "Asset Class Master!Q7:Q39"] },
  AX: { output: "geographyCheck", formula: "IF(Brow=\"\",\"\",IF(ABS(N(Krow)+N(Lrow)+N(Mrow)-1)<0.001,\"OK\",\"CHECK\"))", dependencies: ["B", "K", "L", "M"] },
} as const;

export type AssetClassDefaults = {
  code: string;
  level1Name: string;
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
  assetClassName: string;
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

  // Product Master!AX: Excel N() treats blank and text geography cells as zero.
  const geoValues = [product.geography.us, product.geography.india, product.geography.restOfWorld];
  const geographyCheck = !product.id ? "" :
    Math.abs(geoValues.reduce<number>((total, value) => total + (typeof value === "number" ? value : 0), 0) - 1) < 0.001 ? "OK" : "CHECK";
  if (geographyCheck === "CHECK") warnings.push("Look-through geography does not sum to 100%");

  return {
    id: product.id,
    assetClassName: assetClass?.level1Name ?? (hasSubclass ? "Unknown code" : ""),
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

/** Return all 80 Excel product slots, including blank rows whose formulas resolve to blanks/zero. */
export function derivePublicProductSlots(
  products: PublicProductInput[],
  assumptions: ProductMasterAssumptions,
): DerivedPublicProduct[] {
  if (products.length > PRODUCT_MASTER_CAPACITY) {
    throw new Error(`Product Master supports ${PRODUCT_MASTER_CAPACITY} rows; received ${products.length}`);
  }
  const ids = products.map((product) => product.id).filter(Boolean);
  if (new Set(ids).size !== ids.length) throw new Error("Duplicate Product Master product ID");
  const rows = [...products, ...Array.from({ length: PRODUCT_MASTER_CAPACITY - products.length }, (_, index): PublicProductInput => ({
    id: "", name: `Blank Product Master slot ${products.length + index + 1}`, subclassCode: "",
    domicile: "", geography: { us: null, india: null, restOfWorld: null },
  }))];
  return rows.map((product) => derivePublicProduct(product, assumptions));
}

/** Validate linked master assumptions before calculating any Product Master rows. */
export function validateProductMasterAssumptions(assumptions: ProductMasterAssumptions): string[] {
  const errors: string[] = [];
  const finite = (value: number) => Number.isFinite(value);
  if (!finite(assumptions.fiveYearTreasuryYield)) errors.push("Inputs!D45 must be finite");
  if (!finite(assumptions.lossGivenDefault)) errors.push("Inputs!D51 must be finite");
  if (!finite(assumptions.creditSpreadExpectedLossShare)) errors.push("Inputs!D52 must be finite");
  if (new Set(assumptions.assetClasses.map((item) => item.code)).size !== assumptions.assetClasses.length) errors.push("Asset Class Master contains duplicate sub-asset-class codes");
  if (new Set(assumptions.creditDefaults.map((item) => item.rating)).size !== assumptions.creditDefaults.length) errors.push("Product Master default-probability table contains duplicate ratings");
  for (const item of assumptions.assetClasses) {
    if (![item.expectedReturn, item.volatility, item.beta, item.riskRating].every(finite)) errors.push(`Asset Class Master defaults must be finite for ${item.code}`);
  }
  for (const item of assumptions.creditDefaults) {
    if (!finite(item.annualDefaultProbability)) errors.push(`Default probability must be finite for ${item.rating}`);
  }
  return errors;
}
