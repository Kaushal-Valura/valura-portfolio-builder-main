"use client";
import { useEffect, useMemo, useState } from "react";
import { analyse, defaultClient, type Client, type Data, type Line } from "@/lib/engine";
import products from "@/data/products.json";
import subclasses from "@/data/subclasses.json";
import assumptions from "@/data/assumptions.json";
import scenarioEvidence from "@/data/scenario-evidence.json";
import masterInputs from "@/data/master-inputs.json";
import { deriveMasterProducts, type MasterInputs } from "@/lib/master-data";
import type { Product, Subclass } from "@/lib/engine";
import sample from "@/data/sample.json";
import Setup, { setupErrors } from "@/components/Setup";
import Builder, { suggestSleeve } from "@/components/Builder";
import LeverDesk, { type RunSummary } from "@/components/Levers";
import { DEF_LEVERS, recommend, type Levers } from "@/lib/optimiser";
import { addLine, capBudget, isEdited, linesFromWeights, rebalancePreservingEdits, removeLine, updateLine } from "@/lib/builder";
import Analysis, { TABS as REPORT_TABS } from "@/components/Analysis";
import { usdK } from "@/components/ui";
import ProductMaster from "@/components/ProductMaster";
import { validateStoredPublicProducts, type StoredPublicProduct } from "@/lib/product-catalog";
import type { MasterInputs } from "@/lib/master-data";
import type { ProductMasterAssumptions } from "@/lib/product-master";

const data = {
  products: deriveMasterProducts(
    products as unknown as Product[],
    subclasses as unknown as Subclass[],
    masterInputs as unknown as MasterInputs,
  ),
  subclasses, assumptions, scenarioEvidence,
} as unknown as Data;
const uid = () => Math.random().toString(36).slice(2, 10);
const TABS = ["Client", "Build", ...REPORT_TABS] as const;
type Tab = (typeof TABS)[number];
// journey rail: caption under each step, and the question each step answers
const STEPS: Record<Tab, [string, string]> = {
  Client: ["The brief", "Who is the client, and how much?"],
  Build: ["What to hold", "What should the client hold?"],
  "Why this mix": ["The reasoning", "Why this portfolio, and not another?"],
  Risk: ["How risky", "How much risk are we taking?"],
  Scenarios: ["Four futures", "What could the next 12 months bring?"],
  "Actions & hedges": ["What to do", "What should we do now?"],
  Monitoring: ["On track", "What are we watching?"],
  "Client summary": ["The report", "The client report"],
};

export default function Page() {
  const [tab, setTab] = useState<Tab>("Client");
  const [customProducts, setCustomProducts] = useState<StoredPublicProduct[]>([]);
  const [customProductsLoaded, setCustomProductsLoaded] = useState(false);
  const [productMasterOpen, setProductMasterOpen] = useState(false);
  const data = useMemo(() => ({
    ...baseData,
    products: deriveMasterProducts(
      [...baseData.products, ...customProducts.map((item) => item.product)],
      baseData.subclasses,
      { ...(masterInputs as unknown as MasterInputs), public: [...(masterInputs as unknown as MasterInputs).public, ...customProducts.map((item) => item.raw)] },
    ),
  }), [customProducts]);
  const productMasterAssumptions = useMemo<ProductMasterAssumptions>(() => ({
    ...(masterInputs as unknown as MasterInputs).productAssumptions,
    assetClasses: data.subclasses.map((item) => ({
      code: item.code, level1Name: item.l1Name, name: item.name,
      expectedReturn: item.ret, volatility: item.vol, beta: item.beta, riskRating: item.risk,
    })),
  }), [data.subclasses]);
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem("valura:custom-public-products:v1");
      setCustomProducts(validateStoredPublicProducts(stored ? JSON.parse(stored) : []));
    } catch (error) {
      console.error("Could not load saved Product Master additions", error);
      setCustomProducts([]);
    } finally {
      setCustomProductsLoaded(true);
    }
  }, []);
  useEffect(() => {
    if (!customProductsLoaded) return;
    try {
      window.localStorage.setItem("valura:custom-public-products:v1", JSON.stringify(customProducts));
    } catch (error) {
      console.error("Could not persist Product Master additions", error);
      window.alert("The product was added for this session, but browser storage could not save it. Check available browser storage.");
    }
  }, [customProducts, customProductsLoaded]);
  const [client, setClient] = useState<Client>(() => ({ ...defaultClient(data.assumptions), name: "", amount: 0 }));
  const [lines, setLines] = useState<Line[]>([]);
  const [levers, setLevers] = useState<Levers>(DEF_LEVERS);
  const [ran, setRan] = useState<Levers | null>(null); // desk as of the last Optimise
  const [run, setRun] = useState<RunSummary | null>(null);
  const [busy, setBusy] = useState(false);
  const result = useMemo(() => analyse(client, lines, data), [client, lines]);
  const errors = setupErrors(client);
  // Build needs a valid client; report tabs also need at least one product. A locked tab falls back to the nearest open one.
  const locked = (t: Tab) => (t !== "Client" && errors.length > 0) || (t !== "Client" && t !== "Build" && lines.length === 0);
  const shown: Tab = locked(tab) ? (errors.length ? "Client" : "Build") : tab;
  const print = () => { setTab("Client summary"); setTimeout(() => window.print(), 100); };

  // The desk shows the client fields it shares with the Client step; they live on `client` only.
  const desk: Levers = { ...levers, value: client.amount, horizon: client.horizon, returnTarget: client.target, targetVol: client.targetVol, lockedMax: client.maxIlliquid, accredited: client.accredited === "Yes" };
  const setDesk = (d: Levers) => {
    setLevers(d);
    setClient((c) => ({ ...c, amount: d.value, horizon: d.horizon, target: d.returnTarget, targetVol: d.targetVol, maxIlliquid: d.lockedMax, accredited: d.accredited ? "Yes" : "No" }));
  };

  // Optimise: the recommendation fills the builder, and its sleeve / look-through split becomes the mandate,
  // so the mandate check shows how far the advisor's later edits drift from the recommendation.
  const optimiseNow = () => {
    if (lines.some(isEdited) && !window.confirm("Optimise replaces the builder, including the advisor's own edits. Continue?")) return;
    setBusy(true);
    setTimeout(() => { // let "Optimising…" paint before the solve blocks the thread
      try {
      const r = recommend({ ...desk, situsCap: client.usPerson === "Yes" ? 1e12 : desk.situsCap }); // US persons: no estate-tax limit
      const byId = new Map(data.products.map((p) => [p.id, p])), l1 = new Map(data.subclasses.map((x) => [x.code, x.l1]));
      const names = client.sleeves.map((x) => x.name);
      const sleeveOf = (id: string) => { const p = byId.get(id)!; return suggestSleeve(p, l1.get(p.subclass)!, names); };
      const ls: Line[] = linesFromWeights(r.weights, client.amount, sleeveOf, uid);
      const a = analyse(client, ls, data);
      setClient((c) => ({ ...c, sleeves: a.mandate.map((m) => ({ name: m.name, target: m.actualPct })), geoTargets: a.geography.map((g) => ({ name: g.name, target: g.actualPct })) }));
      setLines(ls);
      setRan(desk);
      setRun({ er: r.er, sd: r.sd, target: desk.targetVol, lines: ls.length, ms: r.ms });
      } catch (error) {
        console.error("Portfolio optimisation failed", error);
        window.alert(error instanceof Error ? `Could not optimise this portfolio: ${error.message}` : "Could not optimise this portfolio. Please review the constraints and try again.");
      } finally {
        setBusy(false);
      }
    }, 30);
  };

  // The builder is never blank: the first visit to Build runs Optimise.
  useEffect(() => { if (shown === "Build" && lines.length === 0 && !busy) optimiseNow(); }, [shown]); // eslint-disable-line react-hooks/exhaustive-deps

  const loadSample = () => {
    setClient(defaultClient(data.assumptions));
    setLines(sample.lines.map((l) => ({ ...l, uid: uid() })));
    setLevers(DEF_LEVERS);
    setRan(null);
    setRun(null);
    setBusy(false);
    setTab("Build");
  };

  // Build fits the window on wide screens: the page stops scrolling and its panels scroll inside.
  const fit = shown === "Build";
  return (
    <div className={fit ? "lg:flex lg:h-dvh lg:flex-col" : undefined}>
      <header className="no-print sticky top-0 z-50 border-b border-line bg-surface/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1560px] flex-wrap items-center gap-3 px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <img src="/valura-logo.png" alt="Valura" className="logo h-7 w-auto" />
            <span className="whitespace-nowrap text-base font-medium tracking-tight text-muted">Portfolio Builder</span>
          </div>
          <div className="flex min-w-0 flex-wrap gap-1.5">
            {[client.name || "New client", client.amount ? usdK(client.amount) : "", client.riskProfile && `${client.riskProfile} risk`, `${client.horizon} years`]
              .filter(Boolean).map((c) => <span key={c} className="rounded-full bg-surface-2 px-2.5 py-1 text-xs font-semibold text-ink-2">{c}</span>)}
          </div>
          <div className="ml-auto flex gap-2">
            <button onClick={() => setProductMasterOpen(true)} className="btn btn-soft">Manage products</button>
            <button onClick={loadSample} className="btn btn-soft">Load sample client</button>
            <button onClick={print} disabled={locked("Client summary")} className="btn btn-primary">Print / save PDF</button>
          </div>
        </div>
      </header>

    <ProductMaster
      open={productMasterOpen} products={data.products} subclasses={data.subclasses} assumptions={productMasterAssumptions}
      onClose={() => setProductMasterOpen(false)} onSave={(record) => setCustomProducts((current) => [...current, record])}
    />
    <main className={`mx-auto max-w-[1560px] px-4 pb-16 pt-4 ${fit ? "lg:flex lg:min-h-0 lg:w-full lg:flex-1 lg:flex-col lg:pb-4" : ""}`}>
      <nav className={`no-print sticky top-[60px] z-30 grid ${fit ? "mb-5 lg:mb-3" : "mb-5"} grid-cols-2 gap-1 rounded-[20px] border border-line bg-surface/95 p-2 shadow-[var(--shadow)] backdrop-blur-md sm:grid-cols-4 lg:grid-cols-8`} role="tablist">
        {TABS.map((t, i) => (
          <button key={t} role="tab" aria-selected={shown === t} disabled={locked(t)} onClick={() => setTab(t)}
            title={locked(t) ? (errors.length ? "Complete the client details first" : "Add products in Build first") : undefined}
            className={`flex items-center gap-2.5 rounded-[14px] px-3 py-2 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${shown === t ? "bg-mint" : "hover:bg-surface-2"}`}>
            <span className={`num grid h-6 w-6 flex-none place-items-center rounded-full text-[11px] font-bold ${shown === t ? "bg-accent text-white" : "border border-line text-muted"}`}>{i + 1}</span>
            <span className="min-w-0"><span className="block truncate text-[13px] font-bold text-ink">{t}</span><span className="block truncate text-[11px] text-faint">{STEPS[t][0]}</span></span>
          </button>
        ))}
      </nav>

      <div className={`no-print mb-4 ${fit ? "lg:hidden" : ""}`}>
        <div className="eyebrow !text-accent-deep">Step {TABS.indexOf(shown) + 1} of {TABS.length} · {shown}</div>
        <h2 className="mt-1 text-[26px] font-extrabold">{STEPS[shown][1]}</h2>
      </div>

      {shown === "Client" ? (
        <Setup client={client} onChange={(nextClient) => {
          if (nextClient.amount !== client.amount && nextClient.amount >= 0) {
            // A lower client budget must never leave existing holdings above the new ceiling.
            setLines((current) => capBudget(current, nextClient.amount));
          }
          setClient(nextClient);
        }} onNext={() => setTab("Build")} />
      ) : shown === "Build" ? (
        <Builder
          data={data} client={client} result={result} lines={lines}
          desk={<LeverDesk desk={desk} ran={ran} usPerson={client.usPerson === "Yes"} busy={busy} run={run} onChange={setDesk} onOptimise={optimiseNow} />}
          onAdd={(l) => {
            const target = client.sleeves.find((sleeve) => sleeve.name === l.sleeve);
            const nextLine = { ...l, uid: uid() };
            if (target && target.target <= 0) {
              const active = client.sleeves.filter((sleeve) => sleeve.target > 0);
              const activeTotal = active.reduce((sum, sleeve) => sum + sleeve.target, 0);
              const sleeves = client.sleeves.map((sleeve) => ({
                ...sleeve,
                target: sleeve.name === l.sleeve
                  ? 1 / (active.length + 1)
                  : sleeve.target > 0
                    ? (activeTotal > 0 ? sleeve.target / activeTotal : 1 / Math.max(1, active.length)) * active.length / (active.length + 1)
                    : 0,
              }));
              const revised = { ...client, sleeves };
              setClient((current) => ({ ...current, sleeves }));
              // Rebalance every active sleeve, not just the restored one. Otherwise the new
              // sleeve is added on top of existing amounts and capBudget scales all holdings
              // proportionally, breaking the displayed sleeve targets.
              setLines((current) => rebalancePreservingEdits([...current, nextLine], revised, new Set(current.filter(isEdited).map((line) => line.uid ?? ""))));
            } else {
              // Rebalance all active sleeves on every addition. Splitting only the destination
              // sleeve can push the total over budget and cause capBudget to distort every weight.
              setLines((current) => rebalancePreservingEdits([...current, nextLine], client, new Set(current.filter(isEdited).map((line) => line.uid ?? ""))));
            }
          }}
          onUpdate={(id, patch) => setLines((ls) => {
            const current = ls.find((line) => line.uid === id);
            if (!current || patch.amount === undefined) return updateLine(ls, id, patch);
            const others = ls.reduce((sum, line) => sum + (line.uid === id ? 0 : line.amount), 0);
            const safeAmount = Math.min(Math.max(0, patch.amount), Math.max(0, client.amount - others));
            return updateLine(ls, id, { ...patch, amount: safeAmount });
          })}
          onRemove={(id) => {
            const gone = lines.find((line) => line.uid === id);
            const preserve = new Set(lines.filter((line) => line.uid !== id && isEdited(line)).map((line) => line.uid ?? ""));
            const next = removeLine(lines, id, client, preserve);
            if (gone && !next.some((line) => line.sleeve === gone.sleeve)) {
              const active = client.sleeves.filter((sleeve) => next.some((line) => line.sleeve === sleeve.name));
              const activeTotal = active.reduce((sum, sleeve) => sum + sleeve.target, 0);
              const sleeves = client.sleeves.map((sleeve) => ({
                ...sleeve,
                target: active.some((item) => item.name === sleeve.name)
                  ? (activeTotal > 0 ? sleeve.target / activeTotal : 1 / Math.max(1, active.length))
                  : 0,
              }));
              const revised = { ...client, sleeves };
              setClient((current) => ({ ...current, sleeves }));
              setLines(rebalancePreservingEdits(next, revised, new Set(next.filter(isEdited).map((line) => line.uid ?? ""))));
            } else setLines(next);
          }}
          onRestore={(name) => {
            const active = client.sleeves.filter((sleeve) => sleeve.target > 0);
            const activeTotal = active.reduce((sum, sleeve) => sum + sleeve.target, 0);
            const restoreWeight = active.length ? (activeTotal / active.length) : 1;
            const sleeves = client.sleeves.map((sleeve) => {
              const target = sleeve.name === name ? restoreWeight : sleeve.target;
              return { ...sleeve, target };
            });
            const total = sleeves.reduce((sum, sleeve) => sum + sleeve.target, 0);
            const normalised = sleeves.map((sleeve) => ({ ...sleeve, target: sleeve.target / total }));
            setClient((current) => ({ ...current, sleeves: normalised }));
            setLines((current) => rebalancePreservingEdits(current, { amount: client.amount, sleeves: normalised }, new Set(current.filter(isEdited).map((line) => line.uid ?? ""))));
          }}
        />
      ) : (
        <Analysis tab={shown} client={client} result={result} onClient={setClient} data={data} />
      )}

      {/* next-step card (the Client tab has its own Continue button) */}
      {shown !== "Client" && TABS.indexOf(shown) < TABS.length - 1 && (() => {
        const i = TABS.indexOf(shown), next = TABS[i + 1];
        return (
          <button onClick={() => { setTab(next); window.scrollTo({ top: 0 }); }} disabled={locked(next)}
            className={`no-print mt-6 flex w-full items-center ${fit ? "lg:hidden" : ""} justify-between gap-4 rounded-[20px] border border-line bg-mint p-5 text-left transition-transform hover:-translate-y-0.5 disabled:opacity-50`}>
            <span><span className="eyebrow block !text-accent-deep">Next · step {i + 2} of {TABS.length}</span><span className="mt-1 block text-lg font-bold text-ink">{STEPS[next][1]}</span></span>
            <span aria-hidden className="grid h-11 w-11 flex-none place-items-center rounded-full bg-accent text-[var(--on-accent)] shadow-[var(--shadow-brand)]">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </span>
          </button>
        );
      })()}
    </main>
    </div>
  );
}
