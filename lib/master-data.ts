/**
 * Rebuilds runtime product parameters from the workbook's raw master-sheet
 * inputs. This is the adapter between the sheet-specific formula modules and
 * the existing portfolio engine's Product contract.
 */
import type { Product, Subclass } from "./engine";
import { derivePublicProduct, type PublicProductInput, type ProductMasterAssumptions } from "./product-master";
import { derivePrivateAsset, type PrivateAssetInput, type PrivateAssetAssumptions } from "./private-assets";
import { deriveStructuredNote, type StructuredNoteInput, type StructuredNoteAssumptions } from "./structured-notes";

export type MasterInputs = {
  productAssumptions: Omit<ProductMasterAssumptions, "assetClasses">;
  privateAssetAssumptions: PrivateAssetAssumptions;
  structuredNoteAssumptions: Omit<StructuredNoteAssumptions, "assetClasses">;
  public: PublicProductInput[];
  private: PrivateAssetInput[];
  structured: StructuredNoteInput[];
};

const scenarioKeys = ["base", "bull", "bear", "tail"] as const;
const assetClassDefaults = (subclasses: Subclass[]) => subclasses.map((item) => ({
  code: item.code, level1: item.l1, name: item.name, expectedReturn: item.ret,
  volatility: item.vol, beta: item.beta, riskRating: item.risk,
}));

export function deriveMasterProducts(
  products: Product[],
  subclasses: Subclass[],
  inputs: MasterInputs,
): Product[] {
  const defaults = assetClassDefaults(subclasses);
  const productAssumptions: ProductMasterAssumptions = {
    ...inputs.productAssumptions, assetClasses: defaults,
  };
  const privateAssumptions: PrivateAssetAssumptions = {
    ...inputs.privateAssetAssumptions, assetClasses: defaults,
  };
  const structuredAssumptions: StructuredNoteAssumptions = {
    ...inputs.structuredNoteAssumptions, assetClasses: defaults,
  };
  const subclassByCode = new Map(subclasses.map((item) => [item.code, item]));
  const publicById = new Map(inputs.public.map((item) => [item.id, item]));
  const privateById = new Map(inputs.private.map((item) => [item.id, item]));
  const structuredById = new Map(inputs.structured.map((item) => [item.id, item]));

  return products.map((product) => {
    if (product.source === "Public") {
      const raw = publicById.get(product.id);
      if (!raw) throw new Error(`Missing Product Master raw inputs for ${product.id}`);
      const derived = derivePublicProduct(raw, productAssumptions);
      return {
        ...product, ret: derived.expectedReturn, vol: derived.volatility,
        beta: derived.beta, risk: derived.riskRating, usSitus: derived.usSitus || product.usSitus,
        scen: scenarioKeys.map((key) => raw.scenarioOverrides?.[key] ?? null),
      };
    }

    if (product.source === "Private") {
      const raw = privateById.get(product.id);
      if (!raw) throw new Error(`Missing Private Assets Master raw inputs for ${product.id}`);
      const derived = derivePrivateAsset(raw, privateAssumptions);
      return {
        ...product, ret: derived.expectedReturn, vol: derived.volatility,
        beta: derived.beta, risk: derived.riskRating,
        liquidity: derived.liquidityClass || product.liquidity,
        usSitus: derived.usSitus || product.usSitus,
        scen: scenarioKeys.map((key) => raw.scenarioOverrides?.[key] ?? null),
      };
    }

    const raw = structuredById.get(product.id);
    if (!raw) throw new Error(`Missing Structured Notes raw inputs for ${product.id}`);
    const underlying = subclassByCode.get(raw.underlyingSubclassCode ?? "");
    const derived = deriveStructuredNote({
      ...raw,
      factorScores: underlying?.factors ?? [],
      underlyingScenarioReturns: underlying ? {
        base: underlying.scen[0], bull: underlying.scen[1],
        bear: underlying.scen[2], tail: underlying.scen[3],
      } : undefined,
    }, structuredAssumptions);
    return {
      ...product, ret: derived.expectedReturn, vol: derived.volatility,
      beta: derived.beta, risk: derived.riskRating, factors: derived.factorScores,
      scen: scenarioKeys.map((key) => derived.noteScenarioReturns[key]),
      distToBarrier: typeof derived.distanceToBarrier === "number" ? derived.distanceToBarrier : null,
      issuerCreditRisk: derived.issuerCreditRisk, usSitus: derived.usSitus || product.usSitus,
    };
  });
}
