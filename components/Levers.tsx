"use client";
// The lever desk from the manager's prototype: client wishes as sliders and switches, then Optimise.
import { useRef, useState } from "react";
import { DEF_LEVERS, carry, type Levers } from "@/lib/optimiser";
import optimiserData from "@/data/optimiser.json";
import { pct, usdK } from "./ui";
import { fixed } from "@/lib/engine";

const M = optimiserData.market;
const pt = (v: number, d = 1) => `${v >= 0 ? "+" : "−"}${fixed(Math.abs(v * 100), d)}pt`;
const view = (v: number) => (v ? `${pt(v, 2)}/yr` : "neutral");
type Item = { k: keyof Levers; label: string; sub?: string; hint?: string; dep?: keyof Levers } &
  ({ type: "switch" } | { type: "range"; min: number; max: number; step: number; fmt: (v: number) => string });

const GROUPS: { grp: string; note?: string; items: Item[] }[] = [
  { grp: "Client", items: [
    { k: "horizon", type: "range", label: "Horizon", min: 1, max: 15, step: 1, fmt: (v) => `${v} years` },
    { k: "returnTarget", type: "range", label: "Return the client hopes for", min: 0.04, max: 0.14, step: 0.005, fmt: (v) => `${pct(v, 1)} a year` }] },
  { grp: "Risk", items: [
    { k: "targetVol", type: "range", label: "Target volatility", min: 0.03, max: 0.16, step: 0.0025, fmt: (v) => pct(v, 1), hint: "Typical yearly swing · S&P 500 runs near 15%" }] },
  { grp: "Where the money goes", items: [
    { k: "indiaOn", type: "switch", label: "Steer India exposure", sub: "Look-through: counts India inside EM funds and AIFs" },
    { k: "india", type: "range", label: "India look-through", min: 0, max: 0.5, step: 0.01, fmt: (v) => `${pct(v, 0)} ±1.5pt`, dep: "indiaOn" },
    { k: "usMax", type: "range", label: "US exposure, at most", min: 0.3, max: 1, step: 0.05, fmt: (v) => (v >= 1 ? "no cap" : pct(v, 0)) }] },
  { grp: "Liquidity", items: [
    { k: "lockedMax", type: "range", label: "Locked for over a month, at most", min: 0, max: 0.5, step: 0.01, fmt: (v) => pct(v, 0) },
    { k: "privateMax", type: "range", label: "Private markets, at most", min: 0, max: 0.4, step: 0.01, fmt: (v) => pct(v, 0) },
    { k: "callBuffer", type: "switch", label: "Cash covers next year's capital calls", sub: "No forced selling to meet AIF drawdowns" }] },
  { grp: "Access & tax", items: [
    { k: "privates", type: "switch", label: "GIFT City AIFs", sub: "Cat II / III private funds" },
    { k: "notes", type: "switch", label: "Structured notes" },
    { k: "ddOnly", type: "switch", label: "Due-diligence-approved only" },
    { k: "accredited", type: "switch", label: "IFSCA accredited investor", sub: "Lowers AIF minimums to $25–50k" },
    { k: "situsCap", type: "range", label: "US-situs assets, at most", min: 0, max: 300000, step: 5000, fmt: (v) => usdK(v), hint: "US estate tax reaches non-US persons above $60k" }] },
  { grp: "Income", items: [
    { k: "yieldMin", type: "range", label: "Income yield, at least", min: 0, max: 0.06, step: 0.0025, fmt: (v) => (v ? pct(v, 2) : "off") }] },
  { grp: "House views", note: "Black-Litterman", items: [
    { k: "vIndia", type: "range", label: "India equities vs house", min: -0.03, max: 0.03, step: 0.0025, fmt: view },
    { k: "vUS", type: "range", label: "US over developed ex-US", min: -0.03, max: 0.03, step: 0.0025, fmt: view },
    { k: "vAI", type: "range", label: "Tech & AI over US market", min: -0.04, max: 0.03, step: 0.0025, fmt: view },
    { k: "vGold", type: "range", label: "Gold vs house", min: -0.03, max: 0.03, step: 0.0025, fmt: view },
    { k: "viewConf", type: "range", label: "Confidence in these views", min: 0.1, max: 0.9, step: 0.05, fmt: (v) => pct(v, 0) },
    { k: "alphaConf", type: "range", label: "Credit for manager alpha", min: 0, max: 1, step: 0.05, fmt: (v) => pct(v, 0), hint: "Share of a fund's edge beyond its market exposure we believe" }] },
  { grp: "Currency", items: [
    { k: "hedge", type: "range", label: "Rupee hedge ratio", min: 0, max: 1, step: 0.05, fmt: (v) => pct(v, 0), hint: `Forward cost ${pct(carry, 2)}/yr = RBI ${pct(M.rbiRepo, 1)} − Fed ${pct(M.fedFunds, 2)}` },
    { k: "inrDep", type: "range", label: "Expected rupee depreciation", min: 0, max: 0.07, step: 0.0025, fmt: (v) => `${pct(v, 2)}/yr` }] },
];
const ITEMS = GROUPS.flatMap((g) => g.items);

const ASKS: { label: string; f: (s: Levers) => Partial<Levers> }[] = [
  { label: "More India", f: (s) => ({ indiaOn: true, india: Math.min(0.5, Math.round((s.india + 0.1) * 100) / 100) }) },
  { label: "Keep it liquid", f: () => ({ lockedMax: 0.05, privateMax: 0.05 }) },
  { label: "Income first", f: () => ({ yieldMin: 0.045 }) },
  { label: "Less risk", f: (s) => ({ targetVol: Math.max(0.03, s.targetVol - 0.02) }) },
  { label: "More growth", f: (s) => ({ targetVol: Math.min(0.16, s.targetVol + 0.02) }) },
  { label: "AI bubble worry", f: (s) => ({ vAI: -0.03, viewConf: Math.max(s.viewConf, 0.6) }) },
  { label: "No US estate tax", f: () => ({ situsCap: 0 }) },
];

export type RunSummary = { er: number; sd: number; target: number; lines: number; ms: number };

export default function LeverDesk({ desk, ran, usPerson, busy, run, onChange, onOptimise }: {
  desk: Levers; ran: Levers | null; usPerson: boolean; busy: boolean; run: RunSummary | null;
  onChange: (d: Levers) => void; onOptimise: () => void;
}) {
  const [selectedAsks, setSelectedAsks] = useState<string[]>([]);
  const wishBase = useRef<Levers>(desk);
  const changed = (k: keyof Levers) => !!ran && ran[k] !== desk[k];
  const n = ran ? ITEMS.filter((it) => changed(it.k)).length : 0;
  const set = (patch: Partial<Levers>) => { wishBase.current = { ...desk, ...patch }; setSelectedAsks([]); onChange({ ...desk, ...patch }); };
  const dot = <span aria-label="changed since last Optimise" className="ml-1.5 inline-block h-1.5 w-1.5 rounded-full bg-accent align-middle" />;

  return (
    <div className="flex flex-col">
      <div className="flex items-baseline justify-between gap-2 pb-2">
        <p className="text-xs text-muted">Hear a wish, move its lever, then Optimise.</p>
        <button onClick={() => { const reset = { ...DEF_LEVERS, value: desk.value }; wishBase.current = reset; setSelectedAsks([]); onChange(reset); }} className="text-xs font-semibold text-ink-2 hover:text-ink">Reset</button>
      </div>
      <div className="eyebrow mb-1.5">Client asks</div>
      <div className="mb-2 flex flex-wrap gap-1.5">
        {ASKS.map((a) => {
          const active = selectedAsks.includes(a.label);
          return (
            <button
              key={a.label}
              type="button"
              aria-pressed={active}
              onClick={() => {
                const selected = active ? selectedAsks.filter((item) => item !== a.label) : [...selectedAsks, a.label];
                // Recompute the combined wishes from defaults in selection order. This prevents
                // deselecting one wish from undoing a different wish that shares the same lever.
                const base = selectedAsks.length ? wishBase.current : desk;
                let combined: Levers = { ...base };
                for (const label of selected) {
                  const wish = ASKS.find((item) => item.label === label);
                  if (wish) combined = { ...combined, ...wish.f(combined) };
                }
                if (!selected.length) wishBase.current = combined;
                setSelectedAsks(selected);
                onChange(combined);
              }}
              className={`rounded-full border px-2.5 py-1 text-xs font-semibold transition-colors ${active ? "border-accent bg-accent text-white shadow-sm" : "border-line text-ink-2 hover:bg-surface-2"}`}
            >{active ? "✓ " : ""}{a.label}</button>
          );
        })}
      </div>

      {GROUPS.map((g) => (
        <div key={g.grp} className="border-t border-line py-3">
          <div className="eyebrow mb-2 flex justify-between"><span>{g.grp}</span>{g.note && <span className="normal-case tracking-normal text-faint">{g.note}</span>}</div>
          {g.items.map((it) => {
            const off = (it.dep && !desk[it.dep]) || (it.k === "situsCap" && usPerson);
            if (it.type === "switch") return (
              <label key={it.k} className="mb-2.5 flex cursor-pointer items-center justify-between gap-3 text-[13px] font-semibold text-ink">
                <span>{it.label}{changed(it.k) && dot}{it.sub && <small className="block text-[11.5px] font-medium text-faint">{it.sub}</small>}</span>
                <input type="checkbox" className="sr-only" checked={!!desk[it.k]} onChange={(e) => set({ [it.k]: e.target.checked })} />
                <span aria-hidden className="tg" />
              </label>
            );
            const v = desk[it.k] as number, hint = it.k === "situsCap" && usPerson ? "Not needed: the client is a US person" : it.hint;
            return (
              <div key={it.k} className="mb-3" style={{ opacity: off ? 0.45 : 1 }}>
                <div className="flex items-baseline justify-between gap-2">
                  <label htmlFor={`lv-${it.k}`} className="text-[13px] font-semibold text-ink">{it.label}{changed(it.k) && dot}</label>
                  <span className="num text-[13px] font-semibold text-ink">{it.fmt(v)}</span>
                </div>
                <input id={`lv-${it.k}`} type="range" className="lever-range" min={it.min} max={it.max} step={it.step} value={v} disabled={!!off}
                  style={{ "--p": `${((v - it.min) / (it.max - it.min)) * 100}%` } as React.CSSProperties}
                  onChange={(e) => set({ [it.k]: parseFloat(e.target.value) })} />
                {hint && <div className="text-[11.5px] text-faint">{hint}</div>}
              </div>
            );
          })}
        </div>
      ))}

      <div className="sticky -bottom-4 -mx-4 -mb-4 border-t border-line bg-surface px-4 pb-4 pt-3">
        <button onClick={onOptimise} disabled={busy} className="btn btn-primary w-full justify-center">
          {busy ? "Optimising…" : n ? `Optimise · ${n} change${n > 1 ? "s" : ""}` : "Optimise"}
        </button>
        {run && (
          <p className="num mt-2 text-center text-[11.5px] text-muted" role="status">
            Optimiser: {pct(run.er, 1)} expected · {pct(run.sd, 1)} vol (target {pct(run.target, 1)}) · {run.lines} lines · {Math.round(run.ms)} ms
          </p>
        )}
      </div>
    </div>
  );
}
