"use client";
import { useMemo, useState } from "react";
import {
  DndContext, DragOverlay, KeyboardSensor, PointerSensor, useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import { fixed, type Analysis, type Client, type Data, type Line, type Product } from "@/lib/engine";
import { isEdited, isProductAvailableForClient, sleeveFromDrop } from "@/lib/builder";
import { Pill, Stat, Status, eligibilityKind, mandateKind, pct, priorityKind, spct, usd, usdK } from "./ui";

// Default sleeve for a product added with the "+" button or placed by Optimise.
export function suggestSleeve(p: Product, l1: string, sleeves: string[]) {
  const want = p.source === "Private" ? "Private" : l1 === "EQ" || l1 === "PM" ? "Equity"
    : ["FI", "SP", "CA"].includes(l1) ? "Bonds" : ["CM", "RA"].includes(l1) || p.subclass === "HF-MAC" ? "Diversifiers" : "Alpha";
  return sleeves.find((s) => s.startsWith(want)) ?? sleeves[0];
}

function ProductCard({ p, sub, onAdd, overlay }: { p: Product; sub: string; onAdd?: () => void; overlay?: boolean }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `${overlay ? "overlay" : "p"}:${p.id}`, data: { p }, disabled: overlay });
  const minT = Math.max(p.minAccredited, p.minNonAccredited);
  return (
    <div
      ref={overlay ? undefined : setNodeRef} {...(overlay ? {} : listeners)} {...(overlay ? {} : attributes)}
      aria-label={`Drag ${p.name} into a sleeve`}
      className={`group cursor-grab touch-none rounded-[14px] border border-line bg-surface p-2.5 text-left active:cursor-grabbing ${isDragging ? "opacity-40" : ""} ${overlay ? "w-72 shadow-xl" : "hover:border-accent"}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[11px] text-muted">{p.id} · {p.source} · {sub}</div>
          <div className="line-clamp-2 text-[13px] font-medium leading-snug text-ink">{p.name}</div>
        </div>
        {onAdd && (
          <button
            onPointerDown={(e) => e.stopPropagation()} onClick={onAdd} aria-label={`Add ${p.name}`}
            className="shrink-0 rounded-md border border-line px-1.5 text-sm leading-6 text-ink-2 hover:bg-surface-2"
          >+</button>
        )}
      </div>
      <div className="num mt-1.5 flex flex-wrap gap-1">
        <Pill>E[r] {pct(p.ret)}</Pill>
        <Pill>vol {pct(p.vol, 0)}</Pill>
        {minT > 0 && <Pill>min {usdK(minT)}</Pill>}
        {p.accreditedOnly === "Yes" && <Pill>Accredited only</Pill>}
        {p.platform === "No" && <Pill>Not on platform</Pill>}
        {p.source === "Private" && p.ddStatus !== "Approved" && <Pill>DD {p.ddStatus.toLowerCase()}</Pill>}
        {p.usSitus === "Yes" && <Pill>US situs</Pill>}
      </div>
    </div>
  );
}

type Row = Analysis["lines"][number];

function SleeveZone({ m, rows, onUpdate, onRemove, total }: {
  m: Analysis["mandate"][number]; rows: Row[];
  onUpdate: (uid: string, patch: Partial<Line>) => void; onRemove: (uid: string) => void; total: number;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `s:${m.name}` });
  const fill = m.targetUsd ? Math.min(1, m.actual / m.targetUsd) : 0;
  return (
    <section
      ref={setNodeRef}
      className={`flex min-h-[180px] flex-col rounded-[20px] border-2 border-dashed bg-surface p-3 transition-colors ${isOver ? "border-accent bg-surface-2" : "border-line"}`}
    >
      <div className="mb-1 flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">{m.name}</h3>
        <Status kind={mandateKind(m.status)}>{m.status}</Status>
      </div>
      <div className="num mb-1 flex justify-between text-xs text-ink-2">
        <span>{usd(m.actual)} of {usd(m.targetUsd)}</span>
        <span>{pct(m.actualPct, 1)} / {pct(m.target, 1)}</span>
      </div>
      <div className="mb-3 h-1.5 overflow-hidden rounded-full bg-surface-2" aria-hidden>
        <div className="h-full rounded-full" style={{ width: `${fill * 100}%`, background: "var(--series-1)" }} />
      </div>
      <div className="flex flex-1 flex-col gap-2">
        {rows.length === 0 && (
          <p className="m-auto py-4 text-center text-xs text-muted">Drop products here</p>
        )}
        {rows.map((l) => (
          <div key={l.uid} className="rounded-[14px] border border-line bg-page p-2">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <div className="text-[11px] text-muted">{l.id} · {l.subclassName}</div>
                <div className="line-clamp-2 text-[13px] font-medium leading-snug">{l.product.name}</div>
              </div>
              <button onClick={() => onRemove(l.uid!)} aria-label={`Remove ${l.product.name}`} className="text-muted hover:text-ink">✕</button>
            </div>
            <div className="mt-1.5 flex items-center gap-2">
              <span className="text-xs text-muted">$</span>
              <input
                aria-label={`Amount for ${l.product.name}`} inputMode="numeric"
                className="num w-full rounded-md border border-line px-2 py-1 text-right text-sm outline-none focus:border-accent"
                value={l.amount ? l.amount.toLocaleString("en-US") : ""}
                onChange={(e) => onUpdate(l.uid!, { amount: Number(e.target.value.replace(/[^0-9.]/g, "")) || 0 })}
              />
              <label className="flex shrink-0 items-center gap-1 text-xs text-muted" title="Edit this holding's share of the total investment">
                <input aria-label={`Allocation percentage for ${l.product.name}`} type="number" min="0" max="100" step="0.1"
                  className="num w-[58px] rounded-md border border-line px-1 py-1 text-right text-xs"
                  value={((total > 0 ? l.amount / total : 0) * 100).toFixed(1)}
                  onChange={(e) => onUpdate(l.uid!, { amount: Math.min(total, Math.max(0, (Number(e.target.value) || 0) * total / 100)) })} />%
              </label>
            </div>
            <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1">
              <Pill>{l.rec === undefined ? "Added by advisor" : isEdited(l) ? "Edited by advisor" : "Recommended"}</Pill>
              <Status kind={eligibilityKind(l.eligibility)}>{l.eligibility === "OK" ? "Eligible" : l.eligibility}</Status>
              <Status kind={priorityKind(l.priority)}>{l.action}</Status>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Builder({ data, client, result, lines, desk, onAdd, onUpdate, onRemove, onRestore }: {
  data: Data; client: Client; result: Analysis; lines: Line[]; desk: React.ReactNode;
  onAdd: (l: Line) => void; onUpdate: (uid: string, patch: Partial<Line>) => void; onRemove: (uid: string) => void;
  onRestore: (name: string) => void;
}) {
  const [q, setQ] = useState("");
  const [source, setSource] = useState("All");
  const [l1, setL1] = useState("All");
  const [geography, setGeography] = useState("All");
  const [active, setActive] = useState<Product | null>(null);
  const [panel, setPanel] = useState<"Client wishes" | "Products">("Client wishes");
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }), useSensor(KeyboardSensor));
  const sub = useMemo(() => new Map(data.subclasses.map((s) => [s.code, s])), [data]);
  const sleeves = client.sleeves.map((s) => s.name);

  const heldIds = new Set(lines.map((l) => l.id));
  const catalog = data.products.filter((p) => {
    const s = sub.get(p.subclass);
    if (!s || heldIds.has(p.id)) return false;
    if (!isProductAvailableForClient(p, client)) return false;
    const text = `${p.id} ${p.name} ${p.ticker} ${s.name} ${p.issuer}`.toLowerCase();
    const indiaExposure = (p.geo?.[1] ?? 0) > 0 || /india/i.test(p.geography);
    return (source === "All" || p.source === source) && (l1 === "All" || s.l1 === l1)
      && (geography === "All" || (geography === "India" ? indiaExposure : !indiaExposure))
      && text.includes(q.toLowerCase());
  });

  const add = (p: Product, sleeve: string) => onAdd({ id: p.id, sleeve, amount: 0 }); // page splits the sleeve evenly
  const onDragEnd = (e: DragEndEvent) => {
    setActive(null);
    const p = e.active.data.current?.p as Product | undefined;
    const sleeve = sleeveFromDrop(e.over?.id?.toString());
    if (p && sleeve) add(p, sleeve);
  };

  const r = result.risk, c = result.counts;
  return (
    <DndContext sensors={sensors} onDragStart={(e) => setActive(e.active.data.current?.p ?? null)} onDragEnd={onDragEnd} onDragCancel={() => setActive(null)}>
      <div className="lg:flex lg:min-h-0 lg:flex-1 lg:flex-col">
      {/* Live KPI bar */}
      <div className="no-print sticky top-0 z-10 -mx-4 mb-4 border-b border-line bg-page/95 px-4 py-3 backdrop-blur lg:static lg:mx-0 lg:mb-3 lg:border-0 lg:bg-transparent lg:p-0">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-7">
          <Stat label="Allocated" value={usd(result.value)} sub={result.unallocated > 0.5 ? `${usd(result.unallocated)} left of ${usd(client.amount)}` : result.unallocated < -0.5 ? `${usd(-result.unallocated)} over budget` : "Fully allocated"} />
          <Stat label="Expected return" value={pct(r.ret)} sub={`target ${pct(client.target, 0)} · INR ${pct(r.retInr)}`} />
          <Stat label="Volatility" value={pct(r.vol)} sub={`beta ${fixed(r.beta, 2)}`} />
          <Stat label="12m expected" value={spct(result.scenarios.probWeighted)} sub="probability-weighted" />
          <Stat label="Tough year (1 in 20)" value={spct(r.toughYear)} sub={usd(result.value * (1 + r.toughYear))} />
          <Stat label="Checks" value={`${c.blocked} blocked`} sub={`${c.review} under review`} />
          <Stat label="Actions" value={`${c.high} high · ${c.medium} med`} sub={`${c.hedges} hedges recommended`} />
        </div>
      </div>

      <div className="no-print grid gap-4 lg:min-h-0 lg:flex-1 lg:grid-cols-[340px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)]">
        {/* Lever desk / catalog */}
        <aside className="rounded-[20px] border border-line bg-surface p-4 shadow-[var(--shadow)] lg:relative lg:overflow-y-auto">
          <div className="mb-3 grid grid-cols-2 gap-1 rounded-full bg-surface-2 p-1" role="tablist">
            {(["Client wishes", "Products"] as const).map((t) => (
              <button key={t} role="tab" aria-selected={panel === t} onClick={() => setPanel(t)}
                className={`rounded-full py-1.5 text-xs font-bold ${panel === t ? "bg-surface text-ink shadow-[var(--shadow)]" : "text-muted"}`}>{t}</button>
            ))}
          </div>
          {panel === "Client wishes" ? desk : (<>
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-sm font-semibold">Products</h2>
            <span className="text-xs text-muted">{catalog.length} of {data.products.length}</span>
          </div>
          <input
            value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ticker, ID…" aria-label="Search products"
            className="mb-2 w-full rounded-lg border border-line px-3 py-1.5 text-sm outline-none focus:border-accent"
          />
          <div className="mb-2 flex flex-wrap gap-1">
            {["All", "Public", "Private", "Structured"].map((s) => (
              <button key={s} onClick={() => setSource(s)} aria-pressed={source === s}
                className={`rounded-full border px-2.5 py-0.5 text-xs font-semibold ${source === s ? "border-accent bg-accent text-white" : "border-line text-ink-2 hover:bg-surface-2"}`}>{s}</button>
            ))}
          </div>
          <div className="mb-2 grid grid-cols-2 gap-2">
            <select value={l1} onChange={(e) => setL1(e.target.value)} aria-label="Asset class" className="w-full rounded-lg border border-line px-2 py-1.5 text-sm">
            <option value="All">All asset classes</option>
            {data.assumptions.l1.map((x) => <option key={x.code} value={x.code}>{x.name}</option>)}
            </select>
            <select value={geography} onChange={(e) => setGeography(e.target.value)} aria-label="Geography filter" className="w-full rounded-lg border border-line px-2 py-1.5 text-sm">
              <option value="All">All geographies</option><option value="India">India exposure</option><option value="Non-India">No India exposure</option>
            </select>
          </div>
          <p className="mb-2 text-xs text-muted">Already-selected or ineligible products (platform access, accreditation and minimum ticket) are hidden. Drag an available product into a sleeve, or press + to add it.</p>
          <div className="flex flex-col gap-2">
            {catalog.length === 0 ? <p className="rounded-xl border border-dashed border-line p-4 text-center text-xs text-muted">No matching products. Change the filters or search term.</p> : catalog.map((p) => {
              const s = sub.get(p.subclass)!;
              return <ProductCard key={p.id} p={p} sub={s.name} onAdd={() => add(p, suggestSleeve(p, s.l1, sleeves))} />;
            })}
          </div>
          </>)}
        </aside>

        {/* Sleeves */}
        <div className="lg:relative lg:overflow-y-auto lg:pr-1">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-line bg-surface p-3">
            <div><div className="text-sm font-semibold">Portfolio allocation</div><div className="text-xs text-muted">Products in each active sleeve share that sleeve's allocation equally. Edit amount or percentage on any holding.</div></div>
            <div className="flex flex-wrap gap-1.5">
              {result.mandate.filter((m) => m.target <= 0.000001 && !result.lines.some((l) => l.sleeve === m.name)).map((m) => (
                <button key={m.name} onClick={() => onRestore(m.name)} className="rounded-full border border-accent/40 px-3 py-1.5 text-xs font-semibold text-accent-deep hover:bg-mint">＋ Add {m.name}</button>
              ))}
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {result.mandate.filter((m) => m.target > 0.000001 || result.lines.some((l) => l.sleeve === m.name)).map((m) => (
              <SleeveZone key={m.name} m={m} rows={result.lines.filter((l) => l.sleeve === m.name)} onUpdate={onUpdate} onRemove={onRemove} total={client.amount} />
            ))}
            <section className="rounded-[20px] border border-line bg-surface p-4 shadow-[var(--shadow)]">
              <h3 className="mb-2 text-sm font-semibold">Geography (look-through)</h3>
              {result.geography.map((g) => (
                <div key={g.name} className="mb-2">
                  <div className="flex justify-between gap-2 text-xs">
                    <span className="text-ink">{g.name}</span>
                    <Status kind={mandateKind(g.status)}>{g.status}</Status>
                  </div>
                  <div className="num text-xs text-ink-2">{pct(g.actualPct, 1)} vs {pct(g.target, 1)} target</div>
                </div>
              ))}
              {lines.length === 0 && <p className="mt-3 text-xs text-muted">Add products to see the look-through split.</p>}
            </section>
          </div>
        </div>
      </div>
      </div>

      <DragOverlay>{active && <ProductCard p={active} sub={sub.get(active.subclass)!.name} overlay />}</DragOverlay>
    </DndContext>
  );
}
