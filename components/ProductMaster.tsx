"use client";

import { useMemo, useState } from "react";
import type { Product, Subclass } from "@/lib/engine";
import {
  createPublicProduct, EMPTY_PUBLIC_PRODUCT_FORM, validatePublicProductForm,
  type PublicProductForm, type StoredPublicProduct,
} from "@/lib/product-catalog";
import type { ProductMasterAssumptions } from "@/lib/product-master";

type Props = {
  open: boolean;
  products: Product[];
  subclasses: Subclass[];
  assumptions: ProductMasterAssumptions;
  onClose: () => void;
  onSave: (record: StoredPublicProduct) => void;
};

const PRODUCT_TYPES = ["UCITS ETF", "UCITS fund", "ETF (US-listed)", "ETC", "Money market fund", "Bond", "Fixed maturity plan", "Mutual fund", "FMP"];
const GEOGRAPHIES = ["Global", "United States", "India", "Emerging Markets", "Developed ex-US", "Europe", "Asia Pacific"];
const CURRENCIES = ["USD", "EUR", "GBP", "INR", "CHF", "JPY", "Multi"];
const DOMICILES = ["Ireland", "Luxembourg", "United States", "India", "India (GIFT IFSC)", "Singapore", "Jersey", "Other"];
const RATINGS = ["AAA", "AA+", "AA", "AA-", "A+", "A", "A-", "BBB+", "BBB", "BBB-", "BB+", "BB", "BB-", "B+", "B", "B-", "CCC or below", "Not rated"];
const LIQUIDITY = ["Daily", "Weekly", "Monthly", "Quarterly", "Locked (lock-up)"];
const SENIORITY = ["Senior secured", "Senior unsecured", "Senior", "Subordinated", "Preferred", "Not applicable"];

function InputField({ label, value, onChange, required, type = "text", step, placeholder, suffix }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean;
  type?: string; step?: string; placeholder?: string; suffix?: string;
}) {
  return <label className="block min-w-0">
    <span className="mb-1.5 block text-xs font-semibold text-ink-2">{label}{required ? <span className="text-red-600"> *</span> : null}</span>
    <span className="flex items-center rounded-lg border border-line bg-surface px-3 focus-within:border-accent">
      <input type={type} step={step} required={required} value={value} placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        className="min-w-0 w-full bg-transparent py-2 text-sm text-ink outline-none placeholder:text-faint" />
      {suffix ? <span className="pl-2 text-xs text-muted">{suffix}</span> : null}
    </span>
  </label>;
}

function SelectField({ label, value, onChange, options, required }: {
  label: string; value: string; onChange: (value: string) => void; options: string[]; required?: boolean;
}) {
  return <label className="block min-w-0">
    <span className="mb-1.5 block text-xs font-semibold text-ink-2">{label}{required ? <span className="text-red-600"> *</span> : null}</span>
    <select required={required} value={value} onChange={(event) => onChange(event.target.value)}
      className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-accent">
      <option value="">Select…</option>
      {options.map((option) => <option key={option} value={option}>{option}</option>)}
    </select>
  </label>;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return <section className="border-t border-line pt-5">
    <div className="mb-3"><h3 className="text-sm font-bold text-ink">{title}</h3>{description ? <p className="mt-1 text-xs text-muted">{description}</p> : null}</div>
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{children}</div>
  </section>;
}

export default function ProductMaster({ open, products, subclasses, assumptions, onClose, onSave }: Props) {
  const [form, setForm] = useState<PublicProductForm>(EMPTY_PUBLIC_PRODUCT_FORM);
  const [submitError, setSubmitError] = useState("");
  const [showAdvanced, setShowAdvanced] = useState(false);
  const errors = useMemo(() => validatePublicProductForm(form, products, subclasses), [form, products, subclasses]);
  const subclass = subclasses.find((item) => item.code === form.subclassCode);
  const bondLike = form.type.toLowerCase().includes("bond") || form.type.toLowerCase().includes("fixed maturity");
  const set = <K extends keyof PublicProductForm>(key: K, value: PublicProductForm[K]) => setForm((current) => ({ ...current, [key]: value }));

  if (!open) return null;

  const submit = () => {
    setSubmitError("");
    try {
      const record = createPublicProduct(form, products, subclasses, assumptions);
      onSave(record);
      setForm(EMPTY_PUBLIC_PRODUCT_FORM);
      setShowAdvanced(false);
      onClose();
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : "Unable to add this product.");
    }
  };

  return <div className="no-print fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-3 sm:p-6" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
    <div role="dialog" aria-modal="true" aria-labelledby="product-master-title" className="flex max-h-[94dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-line px-5 py-4 sm:px-7">
        <div><p className="eyebrow !text-accent-deep">Product Master · Public universe</p><h2 id="product-master-title" className="mt-1 text-xl font-extrabold text-ink">Add a new product</h2><p className="mt-1 text-sm text-muted">Enter independent product data. Derived risk and return values are calculated automatically.</p></div>
        <button type="button" onClick={onClose} aria-label="Close" className="rounded-full border border-line px-3 py-1.5 text-sm text-muted hover:bg-surface-2">Close</button>
      </header>

      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-7">
        <Section title="1. Identification & classification" description="Product ID is generated automatically after validation.">
          <InputField label="Product name" value={form.name} onChange={(v) => set("name", v)} required placeholder="Full legal / display name" />
          <SelectField label="Product type" value={form.type} onChange={(v) => set("type", v)} options={PRODUCT_TYPES} required />
          <InputField label="Ticker / ISIN" value={form.ticker} onChange={(v) => set("ticker", v)} required placeholder="e.g. CSPX / ISIN" />
          <SelectField label="Sub-asset class (Level 2)" value={form.subclassCode} onChange={(v) => set("subclassCode", v)} options={subclasses.map((item) => item.code + " — " + item.name)} required />
          <InputField label="Level 3 / strategy" value={form.strategy} onChange={(v) => set("strategy", v)} required placeholder="e.g. Broad market / duration bucket" />
          <SelectField label="Primary geography" value={form.geography} onChange={(v) => set("geography", v)} options={GEOGRAPHIES} required />
          <SelectField label="Currency" value={form.currency} onChange={(v) => set("currency", v)} options={CURRENCIES} required />
          <InputField label="Underlying currency" value={form.underlyingCurrency} onChange={(v) => set("underlyingCurrency", v)} required placeholder="USD, INR, EUR / Multi" />
          <InputField label="Sector / industry" value={form.sector} onChange={(v) => set("sector", v)} required placeholder="e.g. Diversified / Technology" />
          <InputField label="Segment" value={form.segment} onChange={(v) => set("segment", v)} required placeholder="e.g. Large cap / Short duration" />
          <InputField label="Style" value={form.style} onChange={(v) => set("style", v)} required placeholder="e.g. Blend / Value / Income" />
          <SelectField label="Domicile" value={form.domicile} onChange={(v) => set("domicile", v)} options={DOMICILES} required />
          <InputField label="Manager / issuer" value={form.managerIssuer} onChange={(v) => set("managerIssuer", v)} required placeholder="Fund manager or product issuer" />
        </Section>

        <Section title="2. Look-through geography" description="Enter percentages. The three regions must add up to 100%.">
          <InputField label="Look-through US" type="number" step="0.1" suffix="%" value={form.geoUs} onChange={(v) => set("geoUs", v)} required />
          <InputField label="Look-through India" type="number" step="0.1" suffix="%" value={form.geoIndia} onChange={(v) => set("geoIndia", v)} required />
          <InputField label="Look-through rest of world" type="number" step="0.1" suffix="%" value={form.geoRest} onChange={(v) => set("geoRest", v)} required />
          <SelectField label="US situs override" value={form.usSitusOverride} onChange={(v) => set("usSitusOverride", v)} options={["", "Yes", "No"]} />
          <div className="rounded-lg bg-surface-2 p-3 text-xs text-ink-2 sm:col-span-2 lg:col-span-2">
            {subclass ? <><strong>{subclass.l1Name}</strong> · {subclass.name}<br />Asset class and sub-asset class names are looked up from the master data. US situs is derived from domicile unless explicitly overridden.</> : "Choose a valid sub-asset class to preview the mapped asset class."}
          </div>
        </Section>

        <Section title="3. Fees, size, access & liquidity">
          <InputField label="Expense ratio" type="number" step="0.0001" suffix="%" value={form.expenseRatio} onChange={(v) => set("expenseRatio", v)} required placeholder="Enter as % (e.g. 0.07)" />
          <InputField label="Fund AUM (USD m)" type="number" step="0.01" value={form.aumM} onChange={(v) => set("aumM", v)} placeholder="Optional" />
          <SelectField label="Liquidity" value={form.liquidity} onChange={(v) => set("liquidity", v)} options={LIQUIDITY} required />
          <InputField label="Lock-up / term (years)" type="number" step="0.1" value={form.lockupYears} onChange={(v) => set("lockupYears", v)} />
          <InputField label="Minimum investment (USD)" type="number" step="1" value={form.minimumInvestment} onChange={(v) => set("minimumInvestment", v)} />
          <SelectField label="Accredited investors only?" value={form.accreditedOnly} onChange={(v) => set("accreditedOnly", v)} options={["Yes", "No"]} />
          <SelectField label="Distribution channel" value={form.distributionChannel} onChange={(v) => set("distributionChannel", v)} options={["Public offer", "Private placement"]} required />
          <SelectField label="Valura platform access?" value={form.platformAccess} onChange={(v) => set("platformAccess", v)} options={["Yes", "No"]} required />
        </Section>

        {bondLike ? <Section title="4. Bond / fixed maturity details" description="These fields are requested only for bond and fixed maturity products.">
          <InputField label="Bond issuer" value={form.bondIssuer} onChange={(v) => set("bondIssuer", v)} required />
          <SelectField label="Credit rating" value={form.creditRating} onChange={(v) => set("creditRating", v)} options={RATINGS} required />
          <InputField label="Coupon" type="number" step="0.0001" suffix="%" value={form.coupon} onChange={(v) => set("coupon", v)} />
          <InputField label="Maturity" type="date" value={form.maturity} onChange={(v) => set("maturity", v)} required />
          <InputField label="Yield to maturity" type="number" step="0.0001" suffix="%" value={form.yieldToMaturity} onChange={(v) => set("yieldToMaturity", v)} required />
          <InputField label="Modified duration" type="number" step="0.01" value={form.modifiedDuration} onChange={(v) => set("modifiedDuration", v)} />
          <SelectField label="Seniority" value={form.seniority} onChange={(v) => set("seniority", v)} options={SENIORITY} required />
        </Section> : null}

        <section className="border-t border-line pt-4">
          <button type="button" onClick={() => setShowAdvanced((value) => !value)} className="flex w-full items-center justify-between text-left text-sm font-bold text-ink">
            Advanced model overrides & tags <span className="text-accent">{showAdvanced ? "Hide −" : "Show +"}</span>
          </button>
          {showAdvanced ? <div className="mt-4 space-y-5">
            <Section title="Optional model overrides" description="Leave blank to use backend-derived asset-class defaults or the bond yield formula. Enter percentages as percentage points.">
              <InputField label="Expected return override" type="number" step="0.01" suffix="%" value={form.returnOverride} onChange={(v) => set("returnOverride", v)} />
              <InputField label="Volatility override" type="number" step="0.01" suffix="%" value={form.volatilityOverride} onChange={(v) => set("volatilityOverride", v)} />
              <InputField label="Beta override" type="number" step="0.01" value={form.betaOverride} onChange={(v) => set("betaOverride", v)} />
              <InputField label="Risk rating override" type="number" step="0.1" value={form.riskOverride} onChange={(v) => set("riskOverride", v)} />
              <InputField label="Base scenario override" type="number" step="0.01" suffix="%" value={form.scenarioBase} onChange={(v) => set("scenarioBase", v)} />
              <InputField label="Bull scenario override" type="number" step="0.01" suffix="%" value={form.scenarioBull} onChange={(v) => set("scenarioBull", v)} />
              <InputField label="Bear scenario override" type="number" step="0.01" suffix="%" value={form.scenarioBear} onChange={(v) => set("scenarioBear", v)} />
              <InputField label="Tail scenario override" type="number" step="0.01" suffix="%" value={form.scenarioTail} onChange={(v) => set("scenarioTail", v)} />
            </Section>
            <Section title="Tags & notes">
              <InputField label="Tag 1" value={form.tag1} onChange={(v) => set("tag1", v)} />
              <InputField label="Tag 2" value={form.tag2} onChange={(v) => set("tag2", v)} />
              <InputField label="Tag 3" value={form.tag3} onChange={(v) => set("tag3", v)} />
              <label className="block sm:col-span-2 lg:col-span-3"><span className="mb-1.5 block text-xs font-semibold text-ink-2">Notes</span><textarea value={form.notes} onChange={(event) => set("notes", event.target.value)} rows={2} className="w-full rounded-lg border border-line bg-surface px-3 py-2 text-sm outline-none focus:border-accent" /></label>
            </Section>
          </div> : null}
        </section>

        <div className="rounded-xl border border-line bg-surface-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="text-sm font-bold text-ink">Backend-calculated values</h3><span className="text-xs text-muted">Preview from master assumptions</span></div>
          <p className="mt-1 text-xs text-muted">These fields are not entered as ordinary product inputs. They are calculated and saved when the product is added.</p>
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div><span className="block text-[11px] text-muted">Asset class</span><strong className="text-sm">{subclass?.l1Name ?? "—"}</strong></div>
            <div><span className="block text-[11px] text-muted">Sub-asset class</span><strong className="text-sm">{subclass?.name ?? "—"}</strong></div>
            <div><span className="block text-[11px] text-muted">Product ID</span><strong className="text-sm">Auto-generated on save</strong></div>
            <div><span className="block text-[11px] text-muted">Geography check</span><strong className="text-sm">{Math.abs(Number(form.geoUs) + Number(form.geoIndia) + Number(form.geoRest) - 100) <= 0.1 ? "OK" : "Needs 100%"}</strong></div>
          </div>
        </div>

        {errors.length ? <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950"><strong>Complete these before adding:</strong><ul className="mt-1 list-disc pl-5">{errors.slice(0, 8).map((error) => <li key={error}>{error}</li>)}</ul>{errors.length > 8 ? <p className="mt-1">And {errors.length - 8} more validation issue(s).</p> : null}</div> : null}
        {submitError ? <p role="alert" className="rounded-lg bg-red-50 p-3 text-xs text-red-700">{submitError}</p> : null}
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-5 py-4 sm:px-7">
        <p className="text-xs text-muted">* Required independent inputs. Derived columns are calculated automatically.</p>
        <div className="flex gap-2"><button type="button" onClick={onClose} className="btn btn-soft">Cancel</button><button type="button" onClick={submit} disabled={errors.length > 0} className="btn btn-primary disabled:cursor-not-allowed disabled:opacity-40">Validate & add product</button></div>
      </footer>
    </div>
  </div>;
}
