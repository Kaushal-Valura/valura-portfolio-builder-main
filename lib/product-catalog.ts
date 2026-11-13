import type { Product, Subclass } from "./engine";
import type { ProductMasterAssumptions, PublicProductInput } from "./product-master";
import { derivePublicProduct } from "./product-master";

export type PublicProductForm = {
  name: string; type: string; ticker: string; subclassCode: string; strategy: string;
  geography: string; geoUs: string; geoIndia: string; geoRest: string;
  currency: string; underlyingCurrency: string; sector: string; segment: string; style: string;
  domicile: string; usSitusOverride: string; managerIssuer: string; expenseRatio: string; aumM: string;
  bondIssuer: string; creditRating: string; coupon: string; maturity: string; yieldToMaturity: string;
  modifiedDuration: string; seniority: string; liquidity: string; lockupYears: string;
  minimumInvestment: string; accreditedOnly: string; distributionChannel: string; platformAccess: string;
  returnOverride: string; volatilityOverride: string; betaOverride: string; riskOverride: string;
  scenarioBase: string; scenarioBull: string; scenarioBear: string; scenarioTail: string;
  tag1: string; tag2: string; tag3: string; notes: string;
};

export type StoredPublicProduct = { product: Product & { productMasterFields: PublicProductForm }; raw: PublicProductInput };

export const EMPTY_PUBLIC_PRODUCT_FORM: PublicProductForm = {
  name: "", type: "UCITS ETF", ticker: "", subclassCode: "", strategy: "",
  geography: "Global", geoUs: "0", geoIndia: "0", geoRest: "100",
  currency: "USD", underlyingCurrency: "USD", sector: "", segment: "", style: "Blend",
  domicile: "Ireland", usSitusOverride: "", managerIssuer: "", expenseRatio: "", aumM: "",
  bondIssuer: "", creditRating: "", coupon: "", maturity: "", yieldToMaturity: "",
  modifiedDuration: "", seniority: "", liquidity: "Daily", lockupYears: "0",
  minimumInvestment: "0", accreditedOnly: "No", distributionChannel: "Public offer", platformAccess: "Yes",
  returnOverride: "", volatilityOverride: "", betaOverride: "", riskOverride: "",
  scenarioBase: "", scenarioBull: "", scenarioBear: "", scenarioTail: "",
  tag1: "", tag2: "", tag3: "", notes: "",
};

const optionalNumber = (value: string): number | null =>
  value.trim() === "" ? null : Number(value);
const requiredNumber = (value: string): number => Number(value);
const finite = (value: number | null) => value === null || Number.isFinite(value);
const asPercent = (value: string) => requiredNumber(value) / 100;
const optionalPercent = (value: string) => value.trim() === "" ? null : Number(value) / 100;

export function nextPublicProductId(products: Product[]): string {
  const used = new Set(products.map((product) => product.id));
  let next = 1;
  while (used.has(`P${String(next).padStart(3, "0")}`)) next += 1;
  return `P${String(next).padStart(3, "0")}`;
}

export function validatePublicProductForm(
  form: PublicProductForm,
  products: Product[],
  subclasses: Subclass[],
): string[] {
  const errors: string[] = [];
  const allowed: Record<string, string[]> = {
    type: ["UCITS ETF", "UCITS fund", "ETF (US-listed)", "ETC", "Money market fund", "Bond", "Fixed maturity plan", "Mutual fund"],
    geography: ["Global", "United States", "India", "Emerging Markets", "Developed ex-US", "Europe", "Asia Pacific"],
    currency: ["USD", "EUR", "GBP", "INR", "CHF", "JPY", "Multi"],
    domicile: ["Ireland", "Luxembourg", "United States", "India", "India (GIFT IFSC)", "Singapore", "Jersey", "Other"],
    liquidity: ["Daily", "Weekly", "Monthly", "Quarterly", "Locked (lock-up)"],
    seniority: ["Senior secured", "Senior unsecured", "Senior", "Subordinated", "Preferred", "Not applicable"],
    creditRating: ["", "AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+", "B", "B-", "CCC or below", "Not rated"],
    distributionChannel: ["Public offer", "Private placement"],
    platformAccess: ["Yes", "No"],
    accreditedOnly: ["Yes", "No"],
    usSitusOverride: ["", "Yes", "No"],
  };
  for (const [key, values] of Object.entries(allowed)) {
    const value = form[key as keyof PublicProductForm];
    if (typeof value === "string" && !values.includes(value)) errors.push(`Invalid ${key} selection.`);
  }
  const required: [string, string][] = [
    ["name", "Product name"], ["type", "Product type"], ["ticker", "Ticker / ISIN"],
    ["subclassCode", "Sub-asset class"], ["geography", "Primary geography"],
    ["currency", "Currency"], ["underlyingCurrency", "Underlying currency"],
    ["sector", "Sector / industry"], ["segment", "Segment"], ["style", "Style"],
    ["domicile", "Domicile"], ["managerIssuer", "Manager / issuer"],
    ["expenseRatio", "Expense ratio"], ["liquidity", "Liquidity"],
    ["distributionChannel", "Distribution channel"], ["platformAccess", "Valura platform access"],
  ];
  for (const [key, label] of required) if (!form[key as keyof PublicProductForm].trim()) errors.push(`${label} is required.`);
  if (!subclasses.some((item) => item.code === form.subclassCode)) errors.push("Choose a valid sub-asset class.");
  if (products.filter((item) => item.source === "Public").length >= 80) errors.push("Product Master is full: the workbook supports 80 public products.");
  if (products.some((item) => item.source === "Public" && item.ticker.toLowerCase() === form.ticker.trim().toLowerCase())) errors.push("A public product with this ticker / ISIN already exists.");
  if (products.some((item) => item.source === "Public" && item.name.trim().toLowerCase() === form.name.trim().toLowerCase())) errors.push("A public product with this name already exists.");

  const geo = [form.geoUs, form.geoIndia, form.geoRest].map(Number);
  if (geo.some((value) => !Number.isFinite(value) || value < 0 || value > 100)) errors.push("Look-through geography values must each be between 0% and 100%.");
  else if (Math.abs(geo.reduce((sum, value) => sum + value, 0) - 100) > 0.1) errors.push("US, India and rest-of-world look-through percentages must total 100%.");

  const numericFields: [string, string, boolean][] = [
    ["expenseRatio", "Expense ratio", false], ["aumM", "Fund AUM", true],
    ["coupon", "Coupon", true], ["yieldToMaturity", "Yield to maturity", true],
    ["modifiedDuration", "Modified duration", true], ["lockupYears", "Lock-up / term", true],
    ["minimumInvestment", "Minimum investment", false], ["returnOverride", "Return override", true],
    ["volatilityOverride", "Volatility override", true], ["betaOverride", "Beta override", true],
    ["riskOverride", "Risk override", true], ["scenarioBase", "Base scenario override", true],
    ["scenarioBull", "Bull scenario override", true], ["scenarioBear", "Bear scenario override", true],
    ["scenarioTail", "Tail scenario override", true],
  ];
  for (const [key, label, optional] of numericFields) {
    const raw = form[key as keyof PublicProductForm];
    if (!raw.trim() && optional) continue;
    const value = Number(raw);
    if (!Number.isFinite(value)) errors.push(`${label} must be a valid number.`);
    else if (["expenseRatio", "coupon", "yieldToMaturity"].includes(key) && (value < 0 || value > 100)) errors.push(`${label} must be between 0% and 100%.`);
    else if (["returnOverride", "volatilityOverride", "scenarioBase", "scenarioBull", "scenarioBear", "scenarioTail"].includes(key) && (value < -100 || value > 100)) errors.push(`${label} must be between -100% and 100%.`);
    else if (["volatilityOverride", "aumM", "modifiedDuration", "lockupYears", "minimumInvestment", "riskOverride"].includes(key) && value < 0) errors.push(`${label} cannot be negative.`);
  }
  if (form.usSitusOverride && !["Yes", "No"].includes(form.usSitusOverride)) errors.push("US situs override must be Yes or No.");
  if (form.accreditedOnly && !["Yes", "No"].includes(form.accreditedOnly)) errors.push("Accredited-only must be Yes or No.");
  if (form.platformAccess && !["Yes", "No"].includes(form.platformAccess)) errors.push("Platform access must be Yes or No.");
  if (form.riskOverride.trim() && Number(form.riskOverride) > 5) errors.push("Risk rating override must be between 0 and 5.");

  const bondLike = form.type.toLowerCase().includes("bond") || form.type.toLowerCase().includes("fixed maturity");
  if (bondLike) {
    for (const [key, label] of [["bondIssuer", "Bond issuer"], ["creditRating", "Credit rating"], ["coupon", "Coupon"], ["maturity", "Maturity"], ["yieldToMaturity", "Yield to maturity"], ["modifiedDuration", "Modified duration"], ["seniority", "Seniority"]] as const) {
      if (!form[key].trim()) errors.push(`${label} is required for bonds and fixed maturity plans.`);
    }
    if (form.maturity && Number.isNaN(Date.parse(form.maturity))) errors.push("Maturity must be a valid date.");
  }
  return [...new Set(errors)];
}

export function createPublicProduct(
  form: PublicProductForm,
  products: Product[],
  subclasses: Subclass[],
  assumptions: ProductMasterAssumptions,
): StoredPublicProduct {
  const errors = validatePublicProductForm(form, products, subclasses);
  if (errors.length) throw new Error(errors.join(" "));
  const id = nextPublicProductId(products);
  const number = (value: string) => optionalNumber(value);
  const geo = { us: asPercent(form.geoUs), india: asPercent(form.geoIndia), restOfWorld: asPercent(form.geoRest) };
  const raw: PublicProductInput = {
    id, name: form.name.trim(), subclassCode: form.subclassCode, domicile: form.domicile,
    usSitusOverride: (form.usSitusOverride || "") as "Yes" | "No" | "",
    geography: geo, yieldToMaturity: optionalPercent(form.yieldToMaturity), creditRating: form.creditRating || null,
    expectedReturnOverride: optionalPercent(form.returnOverride), volatilityOverride: optionalPercent(form.volatilityOverride),
    betaOverride: number(form.betaOverride), riskOverride: number(form.riskOverride),
    scenarioOverrides: {
      base: number(form.scenarioBase), bull: number(form.scenarioBull),
      bear: number(form.scenarioBear), tail: number(form.scenarioTail),
    },
  };
  const derived = derivePublicProduct(raw, assumptions);
  const subclass = subclasses.find((item) => item.code === form.subclassCode)!;
  const percent = (value: string) => value.trim() ? `${Number(value)}%` : "";
  const facts: [string, string][] = [
    ["Level 3 / strategy", form.strategy], ["Segment", form.segment], ["Style", form.style],
    ["Manager / issuer", form.managerIssuer], ["Domicile", form.domicile],
    ["Expense ratio", percent(form.expenseRatio)], ["Fund AUM (USD m)", form.aumM],
    ["Bond issuer", form.bondIssuer], ["Credit rating", form.creditRating],
    ["Coupon", percent(form.coupon)], ["Maturity", form.maturity],
    ["Yield to maturity", percent(form.yieldToMaturity)], ["Modified duration", form.modifiedDuration],
    ["Seniority", form.seniority], ["Distribution channel", form.distributionChannel],
    ["Minimum investment (USD)", form.minimumInvestment], ["Accredited only?", form.accreditedOnly],
    ["Tag 1", form.tag1], ["Tag 2", form.tag2], ["Tag 3", form.tag3],
  ].filter(([, value]) => value !== "") as [string, string][];
  const product: Product & { productMasterFields: PublicProductForm } = {
    id, source: "Public", name: form.name.trim(), type: form.type, ticker: form.ticker.trim(),
    subclass: form.subclassCode, geography: form.geography, geo: [geo.us ?? 0, geo.india ?? 0, geo.restOfWorld ?? 0],
    ccy: form.currency, underlyingCcy: form.underlyingCurrency, domicile: form.domicile,
    usSitus: derived.usSitus, liquidity: form.liquidity, sector: form.sector, issuer: (form.bondIssuer || form.managerIssuer).trim(),
    rating: form.creditRating, yield: optionalPercent(form.yieldToMaturity) ?? 0, fee: asPercent(form.expenseRatio),
    aumM: number(form.aumM) ?? 0, platform: form.platformAccess, accreditedOnly: form.accreditedOnly,
    minAccredited: requiredNumber(form.minimumInvestment), minNonAccredited: requiredNumber(form.minimumInvestment),
    ddStatus: "", commitment: "", call1y: 0, lockupYrs: number(form.lockupYears) ?? 0,
    ret: derived.expectedReturn, vol: derived.volatility, beta: derived.beta, risk: derived.riskRating,
    factors: null,
    scen: [optionalPercent(form.scenarioBase), optionalPercent(form.scenarioBull), optionalPercent(form.scenarioBear), optionalPercent(form.scenarioTail)],
    distToBarrier: null, issuerCreditRisk: "", notes: form.notes.trim(),
    assetClassName: derived.assetClassName, subclassName: derived.subclassName, geographyCheck: derived.geographyCheck,
    facts, productMasterFields: { ...form },
  };
  // The selected subclass must exist; this also protects runtime calculations from invalid lookup keys.
  if (!subclass) throw new Error("Selected sub-asset class could not be resolved.");
  return { product, raw };
}

export function isStoredPublicProduct(value: unknown): value is StoredPublicProduct {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<StoredPublicProduct>;
  const product = candidate.product;
  const raw = candidate.raw;
  if (!product || product.source !== "Public" || typeof product.id !== "string" || !/^P\d{3}$/.test(product.id)) return false;
  if (!product.productMasterFields || typeof product.productMasterFields !== "object" || !raw) return false;
  if (raw.id !== product.id || typeof raw.subclassCode !== "string" || !raw.subclassCode.trim()) return false;
  if (![product.ret, product.vol, product.beta, product.risk, product.fee, product.aumM, product.yield, product.lockupYrs, product.minAccredited, product.minNonAccredited].every((item) => typeof item === "number" && Number.isFinite(item))) return false;
  if (!Array.isArray(product.geo) || product.geo.length !== 3 || product.geo.some((item) => typeof item !== "number" || !Number.isFinite(item) || item < 0 || item > 1)) return false;
  const geography = raw.geography;
  if (!geography || ![geography.us, geography.india, geography.restOfWorld].every((item) => item === null || (typeof item === "number" && Number.isFinite(item) && item >= 0 && item <= 1))) return false;
  const fields = product.productMasterFields;
  if (typeof fields.name !== "string" || !fields.name.trim() || typeof fields.ticker !== "string" || !fields.ticker.trim()) return false;
  if (typeof product.name !== "string" || !product.name.trim() || typeof product.ticker !== "string" || !product.ticker.trim()) return false;
  return true;
}

export function validateStoredPublicProducts(value: unknown): StoredPublicProduct[] {
  if (!Array.isArray(value)) return [];
  const valid = value.filter(isStoredPublicProduct);
  const seen = new Set<string>();
  return valid.filter((item) => {
    if (seen.has(item.product.id)) return false;
    seen.add(item.product.id);
    return true;
  });
}
