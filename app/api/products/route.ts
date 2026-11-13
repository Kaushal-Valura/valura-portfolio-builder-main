import { NextResponse } from "next/server";
import products from "@/data/products.json";
import subclasses from "@/data/subclasses.json";
import masterInputs from "@/data/master-inputs.json";
import type { Product, Subclass } from "@/lib/engine";
import type { MasterInputs } from "@/lib/master-data";
import type { ProductMasterAssumptions } from "@/lib/product-master";
import { createPublicProduct, type PublicProductForm } from "@/lib/product-catalog";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { form?: PublicProductForm; existingProducts?: Product[] };
    if (!body.form || typeof body.form !== "object") {
      return NextResponse.json({ error: "Product form data is required." }, { status: 400 });
    }

    const master = masterInputs as unknown as MasterInputs;
    const baseProducts = products as Product[];
    const requestedProducts = Array.isArray(body.existingProducts) ? body.existingProducts : baseProducts;
    const baseIds = new Set(baseProducts.map((item) => item.id));
    const existingProducts = [
      ...baseProducts,
      ...requestedProducts.filter((item) => item && typeof item.id === "string" && !baseIds.has(item.id)),
    ];
    const assetClasses = (subclasses as Subclass[]).map((item) => ({
      code: item.code, level1Name: item.l1Name, name: item.name,
      expectedReturn: item.ret, volatility: item.vol, beta: item.beta, riskRating: item.risk,
    }));
    const assumptions: ProductMasterAssumptions = { ...master.productAssumptions, assetClasses };
    const record = createPublicProduct(body.form, existingProducts, subclasses as Subclass[], assumptions);
    return NextResponse.json({ record }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to validate or calculate this product.";
    return NextResponse.json({ error: message }, { status: 422 });
  }
}
