"use client";
import { useMemo, useState } from "react";
import type { Analysis as Result, Client, Data } from "@/lib/engine";
import { Card, Pill, Stat, Status, eligibilityKind, lightKind, mandateKind, pct, priorityKind, spct, usd, usdK } from "./ui";
import { fixed, outlook, riskLevel, withoutEach, xround } from "@/lib/engine";
import { Diverging, Donut, Gauges, HBar, Pair, RiskReturn, ScenarioValues, Stack, pctFmt, usdFmt } from "./Charts";

export const TABS = ["Why this mix", "Risk", "Scenarios", "Actions & hedges", "Monitoring", "Client summary"] as const;
export type Tab = (typeof TABS)[number];
const th = "px-2 py-1.5 text-left text-[11px] font-medium uppercase tracking-wide text-muted";
const td = "px-2 py-1.5 align-top";

function Table({ head, children, right = [] }: { head: string[]; children: React.ReactNode; right?: number[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full tabular-nums border-collapse text-[13px]">
        <thead><tr className="border-b border-line">{head.map((h, i) => <th key={h} className={`${th} ${right.includes(i) ? "text-right" : ""}`}>{h}</th>)}</tr></thead>
        <tbody className="[&>tr]:border-b [&>tr]:border-line">{children}</tbody>
      </table>
    </div>
  );
}

// ---------- charts shared by summary and tabs ----------
const short = (n: string) => (n.length > 30 ? n.slice(0, 29) + "…" : n);
function charts(r: Result) {
  const held = r.byL1.filter((c) => c.weight > 0);
  return {
    allocation: <HBar rows={[...held].sort((a, b) => b.weight - a.weight).map((c) => ({ name: c.label, weight: c.weight }))} value="weight" />,
    contribution: <HBar rows={[...held].sort((a, b) => b.contribution - a.contribution).map((c) => ({ name: c.label, contribution: c.contribution }))} value="contribution" fmt={pctFmt(2)} />,
    riskShare: <Pair rows={held.map((c) => ({ name: c.label, "Share of portfolio": c.weight, "Share of risk": c.riskShare }))} a="Share of portfolio" b="Share of risk" />,
    sleeves: <Pair rows={r.mandate.map((m) => ({ name: m.name.split(" (")[0], Target: m.target, Actual: m.actualPct }))} a="Target" b="Actual" />,
    geo: <Pair rows={r.geography.map((g) => ({ name: g.name.split(" (")[0], Target: g.target, Actual: g.actualPct }))} a="Target" b="Actual" height={200} />,
    factors: <Diverging rows={r.factorExposure.map((f) => ({ name: f.name, value: f.exposure }))} />,
    scenarioValues: <ScenarioValues rows={r.scenarios.list.map((s) => ({ name: s.label, value: s.value }))} invested={r.value} />,
    // per-section charts on the client summary
    l1Factor: <Diverging rows={r.byL1.map((c) => ({ name: c.label, value: c.netFactor }))} label="Net factor score" yWidth={96} />,
    byAction: <HBar rows={Object.entries(r.lines.reduce<Record<string, number>>((t, l) => ({ ...t, [l.action]: (t[l.action] ?? 0) + l.amount }), {}))
      .sort((a, b) => b[1] - a[1]).map(([name, amount]) => ({ name, amount }))} value="amount" fmt={usdFmt} yWidth={190} />,
    hedgeValue: <Pair rows={r.hedges.rows.filter((h) => h.on).map((h) => ({ name: h.hedge.replace(/ hedge| \(.*\)|exposure| for capital calls/g, "").trim(), "Annual cost": h.cost, "Saves in a tail year": h.tail }))}
      a="Annual cost" b="Saves in a tail year" fmt={usdFmt} height={260} />,
    byPriority: <HBar rows={["High", "Medium", "Low"].map((p) => ({ name: p, amount: r.lines.filter((l) => l.priority === p).reduce((t, l) => t + l.amount, 0) }))} value="amount" fmt={usdFmt} />,
    holdingWeight: <HBar rows={[...r.lines].sort((a, b) => b.weight - a.weight).map((l) => ({ name: short(l.product.name), weight: l.weight }))} value="weight" yWidth={190} />,
    holdingWorst: <Diverging rows={[...r.lines].sort((a, b) => a.worst - b.worst).map((l) => ({ name: short(l.product.name), value: l.worst }))} fmt={(v) => spct(v, 0)} label="Worst scenario" yWidth={190} />,
    hedgeEffect: <Pair rows={[{ name: "Bear", "Before hedges": r.hedges.bearBefore, "After hedges": r.hedges.bearAfter }, { name: "Tail", "Before hedges": r.hedges.tailBefore, "After hedges": r.hedges.tailAfter }]} a="Before hedges" b="After hedges" fmt={pctFmt(1)} height={220} />,
    hedgeCost: <HBar rows={r.hedges.rows.filter((h) => h.on).map((h) => ({ name: h.hedge.replace(/ hedge| \(.*\)|exposure/g, "").trim(), cost: h.cost }))} value="cost" fmt={usdFmt} yWidth={170} />,
    vs6040: <Pair rows={r.scenarios.list.map((s) => ({ name: s.label, "Our portfolio": s.ret, "Classic 60/40": s.sixtyForty }))} a="Our portfolio" b="Classic 60/40" />,
  };
}

// ---------- Client summary: mirrors the workbook's Client Summary sheet, sections 1-11 ----------
const sgn = (x: number, d = 2) => (x > 0 ? "+" : x < 0 ? "−" : "") + fixed(Math.abs(x), d);
const R = `${td} num text-right`;
const heat = (x: number) => ({ background: `color-mix(in srgb, var(${x >= 0 ? "--pos" : "--neg"}) ${Math.min(1, Math.abs(x) / 2) * 55}%, transparent)` });

function Chart({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="min-w-0"><h4 className="mb-2 text-xs font-semibold text-ink-2">{title}</h4>{children}</div>;
}

// ---------- Client view: the visual, plain-English front page of the report ----------
const CAT = (i: number) => `var(--cat-${(i % 5) + 1})`; // sleeve colour, fixed order
function ClientView({ client, r, data }: { client: Client; r: Result; data: Data }) {
  const V = r.value, k = r.risk, sc = r.scenarios, pw = sc.probWeighted;
  const sleeveIx = (name: string) => Math.max(0, client.sleeves.findIndex((s) => s.name === name));
  const lines = [...r.lines].sort((a, b) => sleeveIx(a.sleeve) - sleeveIx(b.sleeve) || b.amount - a.amount);
  const maxW = Math.max(...lines.map((l) => l.weight), 0.01), maxR = Math.max(...lines.map((l) => l.riskShare), 0.01);
  const sleeves = client.sleeves.map((s, i) => {
    const ls = lines.filter((l) => l.sleeve === s.name);
    return { name: s.name, i, amount: ls.reduce((t, l) => t + l.amount, 0), risk: ls.reduce((t, l) => t + l.riskShare, 0) };
  });
  const vs6040 = pw - sc.sixtyFortyWeighted;
  const india = r.geography[1];
  const L = data.assumptions.limits;
  const access = (l: (typeof lines)[number]) => {
    const p = l.product;
    if (/Daily|Weekly/.test(p.liquidity)) return <Status kind="good">{p.liquidity}</Status>;
    if (/Monthly|Quarterly/.test(p.liquidity)) return <Status kind="warning">{p.liquidity}</Status>;
    return <Status kind="critical">{p.lockupYrs ? `${p.lockupYrs}-yr lock` : "Locked"}</Status>;
  };
  const notes = (l: (typeof lines)[number]) => [
    l.product.type === "Bond" && l.weight > L.singleIssuer && "Single issuer",
    l.flags.some((f) => f.startsWith("US-situs")) && "US situs",
    l.product.source === "Private" && `DD ${l.product.ddStatus.toLowerCase()}`,
    l.inrAmount > 0 && "₹ assets",
    l.product.issuerCreditRisk === "High" && "Issuer risk",
    l.product.fee >= L.highFee && "High fee",
  ].filter(Boolean) as string[];
  const bar = (x: number, max: number, color: string) => (
    <span aria-hidden className="inline-block h-1.5 w-16 overflow-hidden rounded-full bg-surface-2 align-middle"><span className="block h-full rounded-full" style={{ width: `${(x / max) * 100}%`, background: color }} /></span>
  );
  return (
    <>
      <section className="rounded-[20px] border border-line bg-surface p-5 shadow-[var(--shadow)]">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-2 text-2xl font-extrabold">{client.name || "Client"}</h2>
          {[data.assumptions.client.baseCcy, `${r.counts.lines} lines`, usd(V), `${client.riskProfile} risk`].map((x) => <Pill key={x}>{x}</Pill>)}
          <Status kind={lightKind(r.marketView.view)}>{r.marketView.view} market</Status>
        </div>
        <p className="mb-4 mt-1 text-[13px] text-muted">Built for a {client.riskProfile.toLowerCase()} risk profile over {client.horizon} years · valuation date {new Date().toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" })}</p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <Stat mint label="Expected return" value={pct(k.ret, 2)} sub={`${usdK(V * k.ret)} a year · INR view ${pct(k.retInr)}`} />
          <Stat label="Volatility" value={pct(k.vol)} sub={`typical yearly swing · target ${pct(client.targetVol)}`} />
          <Stat label="Likely value in 12 months" value={`${usdK(V * (1 + k.lo))}–${usdK(V * (1 + k.hi))}`} sub="about 2 years in 3" />
          <Stat label="A 1-in-20 bad year" value={spct(k.toughYear)} sub={`${usd(V * k.toughYear)} · ends near ${usdK(V * (1 + k.toughYear))}`} />
          <Stat label="Risk vs S&P 500" value={String(xround(k.beta * 100))} sub="S&P 500 = 100" />
          <Stat label="Cash within a week" value={pct(r.cashLadder[0], 0)} sub={`${pct(r.cashLadder[2], 0)} locked beyond a year`} />
          <Stat label="India look-through" value={pct(india.actualPct)} sub={`target ${pct(india.target, 1)}`} />
          <Stat label="Next 12 months" value={spct(pw)} sub={`odds-weighted · ${spct(sc.pessimistic)} to ${spct(sc.optimistic)}`} />
          <Stat label="Fund costs" value={pct(V ? r.feeCost / V : 0, 2)} sub={`${usdK(r.feeCost)} a year`} />
          <Stat label="Vs a classic 60/40" value={`${vs6040 >= 0 ? "+" : "−"}${fixed(Math.abs(vs6040 * 100), 1)}pt`} sub="next 12 months, odds-weighted" />
        </div>
      </section>

      <div className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
        <Card title="Shape" sub="Inner ring: money by sleeve. Outer ring: each holding. Hover for detail.">
          <div className="flex flex-wrap items-center gap-6">
            <Donut center={usdK(V)} sub={`${r.counts.lines} lines · ${pct(k.ret)} a year`}
              groups={sleeves.map((g) => ({ name: g.name, value: g.amount, color: CAT(g.i) }))}
              items={lines.map((l) => ({ name: l.product.name, value: l.amount, color: CAT(sleeveIx(l.sleeve)) }))} />
            <div className="min-w-[240px] flex-1 space-y-2 text-[13px]">
              {sleeves.map((g) => (
                <div key={g.name} className="flex items-center gap-2">
                  <span aria-hidden className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: CAT(g.i) }} />
                  <span className="flex-1 truncate text-ink">{g.name}</span>
                  <b className="num text-ink">{pct(V ? g.amount / V : 0, 0)}</b>
                  <span className="num w-20 text-right text-xs text-faint">{pct(g.risk, 0)} of risk</span>
                </div>
              ))}
              <div className="eyebrow pt-3">Look-through geography</div>
              <Stack parts={r.geography.map((g, i) => ({ name: g.name.split(" (")[0], value: g.actual, color: CAT([1, 2, 4][i]) }))} />
            </div>
          </div>
        </Card>
        <Card title="At a glance" sub="The next 12 months in four futures, and how fast the money comes back.">
          <Pill>odds-weighted {spct(pw)}</Pill>
          <div className="mt-2"><Diverging rows={sc.list.map((x) => ({ name: `${x.label} · ${pct(x.prob, 0)} odds`, value: x.ret }))} fmt={(v) => spct(v)} label="12-month result" yWidth={150} /></div>
          <div className="eyebrow mb-2 mt-3">Cash you can raise</div>
          <Stack parts={[["Within a week", 0], ["Within a year", 2], ["Locked longer", 3]].map(([n, c], i) => ({ name: n as string, value: r.cashLadder[i], color: CAT(c as number) }))} />
          <p className="mt-4 border-l-4 border-accent pl-3 text-[13px] text-ink-2">
            Earns <b className="text-ink">{pct(k.ret)}</b> a year for <b className="text-ink">{pct(k.vol)}</b> volatility, {vs6040 >= 0 ? "ahead of" : "behind"} a classic 60/40 by {fixed(Math.abs(vs6040 * 100), 1)}pt over the next 12 months, with <b className="text-ink">{pct(r.cashLadder[0], 0)}</b> reachable within a week.
          </p>
        </Card>
      </div>

      <Card title="Holdings" sub="Every line on the Valura shelf, grouped by sleeve.">
        <Table head={["Line", "Weight", "Amount", "Exp. return", "Share of risk", "Access", "Notes"]} right={[1, 2, 3, 4]}>
          {lines.map((l) => (
            <tr key={l.uid}>
              <td className={td}>
                <div className="flex items-center gap-2 font-semibold text-ink"><span aria-hidden className="h-2.5 w-2.5 flex-none rounded-sm" style={{ background: CAT(sleeveIx(l.sleeve)) }} />{l.rationale || l.subclassName}</div>
                <div className="pl-[18px] text-xs text-muted">{l.product.name}</div>
              </td>
              <td className={`${R} whitespace-nowrap`}>{bar(l.weight, maxW, CAT(sleeveIx(l.sleeve)))} <span className="inline-block w-12">{pct(l.weight)}</span></td>
              <td className={R}>{usdK(l.amount)}</td>
              <td className={R}>{pct(l.product.ret)}</td>
              <td className={`${R} whitespace-nowrap`}>{bar(l.riskShare, maxR, "var(--ink-2)")} <span className="inline-block w-10 text-faint">{pct(l.riskShare, 0)}</span></td>
              <td className={td}>{access(l)}</td>
              <td className={td}><div className="flex flex-wrap gap-1">{notes(l).map((n) => <Pill key={n}>{n}</Pill>)}</div></td>
            </tr>
          ))}
        </Table>
      </Card>
    </>
  );
}

function Summary({ client, r, data }: { client: Client; r: Result; data: Data }) {
  const c = charts(r), A = data.assumptions, V = r.value;
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [all, setAll] = useState(false);
  const toggle = (code: string) => setOpen((o) => { const n = new Set(o); if (n.has(code)) n.delete(code); else n.add(code); return n; });
  const Expand = ({ code, label }: { code: string; label: string }) => (
    <button onClick={() => toggle(code)} aria-expanded={open.has(code)} className="text-left font-medium hover:underline">
      <span className="no-print mr-1 inline-block w-3 text-muted">{open.has(code) ? "−" : "+"}</span>{label}
    </button>
  );
  const fx = r.factorExposure;
  const best = fx.reduce((a, b) => (b.exposure > a.exposure ? b : a)), worst = fx.reduce((a, b) => (b.exposure < a.exposure ? b : a));
  const pw = r.scenarios.probWeighted;
  return (
    <div className="space-y-4">
      <ClientView client={client} r={r} data={data} />
      <div className="no-print flex justify-center">
        <button onClick={() => setAll((x) => !x)} aria-expanded={all} className="btn btn-soft">{all ? "Hide the full analysis" : "Show the full analysis (11 sections)"}</button>
      </div>
      <div className={all ? "space-y-4" : "hidden space-y-4 print:block"}>
      <Card title="1. The advisor's construction vs the mandate" sub="Sleeves and look-through geography; on target within ±0.5 pts">
        <div className="grid gap-4 lg:grid-cols-2">
          {([["Advisor sleeve", r.mandate, r.mandateStatus, c.sleeves], ["Geography (look-through)", r.geography, r.geoStatus, c.geo]] as const).map(([head, rows, total, chart]) => (
            <div key={head} className="space-y-4"><Table head={[head, "Target %", "Target USD", "Actual USD", "Actual %", "Gap (pts)", "Status"]} right={[1, 2, 3, 4, 5]}>
              {rows.map((m) => (
                <tr key={m.name}><td className={td}>{m.name}</td><td className={R}>{pct(m.target, 1)}</td><td className={R}>{usd(m.targetUsd)}</td><td className={R}>{usd(m.actual)}</td><td className={R}>{pct(m.actualPct)}</td><td className={R}>{pct(m.gap)}</td><td className={td}><Status kind={mandateKind(m.status)}>{m.status}</Status></td></tr>
              ))}
              <tr className="font-semibold"><td className={td}>Total</td><td className={R}>{pct(rows.reduce((t, m) => t + m.target, 0), 1)}</td><td className={R}>{usd(rows.reduce((t, m) => t + m.targetUsd, 0))}</td><td className={R}>{usd(rows.reduce((t, m) => t + m.actual, 0))}</td><td className={R}>{pct(rows.reduce((t, m) => t + m.actualPct, 0))}</td><td className={R}>{pct(rows.reduce((t, m) => t + m.gap, 0))}</td><td className={`${td} text-xs`}>{total}</td></tr>
            </Table>
            <Chart title={`${head.split(" (")[0]}: target vs actual`}>{chart}</Chart></div>
          ))}
        </div>
      </Card>

      <Card title="2. Portfolio by asset class" sub="Level 1 shown; click + for sub-asset classes (Level 2)">
        <Table head={["Asset class", "Code", "# lines", "Amount", "% of total", "Risk rating", "Risk level", "% in USD", "% US situs", "% non-daily liquidity", "Beta", "Expected return", "Return contribution", "Volatility (own)", "Net factor score", "Outlook"]} right={[2, 3, 4, 5, 7, 8, 9, 10, 11, 12, 13, 14]}>
          {r.byL1.map((l1) => [
            <tr key={l1.code} className="bg-surface-2">
              <td className={td}><Expand code={l1.code} label={l1.name} /></td><td className={td}>{l1.code}</td>
              <td className={R}>{l1.lines || "–"}</td><td className={R}>{l1.amount ? usd(l1.amount) : "–"}</td><td className={R}>{l1.weight ? pct(l1.weight) : "–"}</td>
              <td className={R}>{l1.amount ? fixed(l1.eRisk, 1) : ""}</td><td className={td}>{riskLevel(l1.amount ? l1.eRisk : 0)}</td>
              <td className={R}>{l1.amount ? pct(l1.inUsd, 0) : "–"}</td><td className={R}>{l1.usSitus ? pct(l1.usSitus, 0) : "–"}</td><td className={R}>{l1.nonDaily ? pct(l1.nonDaily, 0) : "–"}</td>
              <td className={R}>{l1.amount ? fixed(l1.eBeta, 2) : ""}</td><td className={R}>{pct(l1.eRet)}</td><td className={R}>{l1.contribution ? pct(l1.contribution, 2) : "–"}</td><td className={R}>{pct(l1.eVol)}</td>
              <td className={R} style={heat(l1.netFactor)}>{sgn(l1.netFactor)}</td><td className={td}>{l1.outlook}</td>
            </tr>,
            ...(open.has(l1.code) ? r.subs.filter((s) => s.l1 === l1.code).map((s) => (
              <tr key={s.code} className="text-ink-2">
                <td className={`${td} pl-7`}>{s.name}</td><td className={`${td} whitespace-nowrap`}>{s.code}</td>
                <td className={R}>{s.lines}</td><td className={R}>{usd(s.amount)}</td><td className={R}>{pct(s.weight)}</td>
                <td className={R}>{s.amount ? fixed(s.eRisk, 1) : ""}</td><td className={td}>{riskLevel(s.amount ? s.eRisk : 0)}</td>
                <td className={R}>{pct(s.inUsd, 0)}</td><td className={R}>{pct(s.usSitus, 0)}</td><td className={R}>{pct(s.nonDaily, 0)}</td>
                <td className={R}>{s.amount ? fixed(s.eBeta, 2) : ""}</td><td className={R}>{pct(s.eRet)}</td><td className={R}>{pct(s.weight * s.eRet, 2)}</td><td className={R}>{pct(s.eVol)}</td>
                <td className={R}>{sgn(s.netFactor)}</td><td className={td}>{outlook(s.netFactor)}</td>
              </tr>
            )) : []),
          ])}
          <tr className="font-semibold">
            <td className={td}>Total portfolio</td><td /><td className={R}>{r.counts.lines}</td><td className={R}>{usd(V)}</td><td className={R}>{pct(V ? 1 : 0)}</td>
            <td className={R}>{fixed(r.risk.riskRating, 1)}</td><td className={td}>{riskLevel(r.risk.riskRating)}</td>
            <td className={R}>{pct(r.risk.inUsd, 0)}</td><td className={R}>{pct(r.risk.usSitusShare, 0)}</td><td className={R}>{pct(r.risk.nonDailyShare, 0)}</td>
            <td className={R}>{fixed(r.risk.beta, 2)}</td><td className={R}>{pct(r.risk.ret)}</td><td className={R}>{pct(r.risk.ret, 2)}</td><td className={R}>{pct(r.risk.vol)}</td>
            <td className={R}>{sgn(r.factorSummary.net)}</td><td className={td}>{r.factorSummary.outlook}</td>
          </tr>
        </Table>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <Chart title="Where the money is invested">{c.allocation}</Chart>
          <Chart title="Contribution to expected return (% a year)">{c.contribution}</Chart>
        </div>
        <h3 className="mb-2 mt-6 text-sm font-semibold">Where the risk really comes from: share of portfolio vs share of risk (Level 1)</h3>
        <div className="grid gap-4 lg:grid-cols-2">
          <Table head={["Asset class", "Share of portfolio", "Share of risk", "Risk / weight ratio"]} right={[1, 2, 3]}>
            {r.byL1.map((l1) => (
              <tr key={l1.code}>
                <td className={td}>{l1.name}</td><td className={R}>{l1.weight ? pct(l1.weight) : ""}</td>
                <td className={`${R} font-semibold`}>{l1.weight ? pct(l1.riskShare) : ""}</td>
                {/* blue = less risk than its weight, red = more */}
                <td className={R} style={l1.weight ? heat(2 * (1 - l1.riskRatio)) : undefined}>{l1.weight ? `${fixed(l1.riskRatio, 2)}×` : "–"}</td>
              </tr>
            ))}
          </Table>
          <Chart title="Share of portfolio vs share of risk (by asset class)">{c.riskShare}</Chart>
        </div>
      </Card>

      <Card title="3. Top priorities from the next-best-action engine">
        <Table head={["Product", "Priority", "Next best action", "Amount / flags", "What to do"]}>
          {r.actions.slice(0, 5).map((l) => (
            <tr key={l.uid}>
              <td className={`${td} font-medium`}>{l.product.name}</td><td className={td}><Status kind={priorityKind(l.priority)}>{l.priority}</Status></td><td className={td}>{l.action}</td>
              <td className={`${td} text-xs text-ink-2`}>{usd(l.amount)} | {l.flags.join("; ")}</td><td className={`${td} text-xs text-ink-2`}>{l.whatToDo}</td>
            </tr>
          ))}
        </Table>
        <div className="mt-4 max-w-xl"><Chart title="Money by action priority">{c.byPriority}</Chart></div>
      </Card>

      <Card title="4. Every holding with its next best action" sub="Click + to see why each holding is in the portfolio" className="print-break">
        <Table head={["Product", "Advisor sleeve", "Sub-asset class", "Amount", "% of total", "Risk", "Expected return", "Worst scenario", "Eligibility", "Next best action", "Priority", "What to do"]} right={[3, 4, 5, 6, 7]}>
          {r.lines.map((l) => [
            <tr key={l.uid}>
              <td className={td}><div className="text-[11px] text-muted">{l.id}</div><Expand code={l.uid ?? l.id} label={l.product.name} /></td>
              <td className={td}>{l.sleeve}</td><td className={td}>{l.subclassName}</td>
              <td className={R}>{usd(l.amount)}</td><td className={R}>{pct(l.weight)}</td><td className={R}>{l.product.risk}</td>
              <td className={R}>{pct(l.product.ret)}</td><td className={R} style={heat(l.worst * 5)}>{spct(l.worst, 0)}</td>
              <td className={td}><Status kind={eligibilityKind(l.eligibility)}>{l.eligibility}</Status></td>
              <td className={td}>{l.action}</td><td className={td}><Status kind={priorityKind(l.priority)}>{l.priority}</Status></td>
              <td className={`${td} text-xs text-ink-2`}>{l.whatToDo}</td>
            </tr>,
            open.has(l.uid ?? l.id) && (
              <tr key={`${l.uid}-why`} className="bg-surface-2 text-xs">
                <td colSpan={12} className="px-4 py-3">
                  <div className="grid gap-3 md:grid-cols-[1fr_2fr]">
                    <div className="space-y-1">
                      <p><span className="font-semibold">Why it's here: </span>{l.rationale || "–"}</p>
                      {l.product.notes && <p><span className="font-semibold">Research note: </span>{l.product.notes}</p>}
                      <p className="text-ink-2">{l.product.type} · {l.product.ccy}{l.product.underlyingCcy !== l.product.ccy ? ` (assets in ${l.product.underlyingCcy})` : ""} · {l.product.liquidity} liquidity · US situs {l.product.usSitus} · {l.product.geography}</p>
                      <p className="text-ink-2">Return {pct(l.product.ret)} · volatility {pct(l.product.vol)} · beta {fixed(l.product.beta, 2)} · scenarios {l.scen.map((x) => spct(x, 0)).join(" / ")}</p>
                    </div>
                    <div>
                      <dl className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-3">
                        {l.product.facts.map(([k, v]) => <div key={k}><dt className="text-muted">{k}</dt><dd className="font-medium">{v}</dd></div>)}
                      </dl>
                      {l.flags.length > 0 && <p className="mt-2 text-ink-2"><span className="font-semibold text-ink">Flags: </span>{l.flags.join(" · ")}</p>}
                    </div>
                  </div>
                </td>
              </tr>
            ),
          ])}
          <tr className="font-semibold"><td className={td}>Total</td><td /><td /><td className={R}>{usd(V)}</td><td className={R}>{pct(V ? 1 : 0)}</td><td colSpan={7} /></tr>
        </Table>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Chart title="Share of portfolio by holding">{c.holdingWeight}</Chart>
          <Chart title="Worst-scenario result by holding">{c.holdingWorst}</Chart>
        </div>
      </Card>

      <Card title="5. Hedging recommendations">
        <Table head={["Hedge", "Status", "Notional", "Annual cost", "Cost %", "Benefit: bear", "Benefit: tail", "Instrument / action"]} right={[2, 3, 4, 5, 6]}>
          {r.hedges.rows.map((h) => (
            <tr key={h.hedge} className={h.on ? "" : "text-muted"}>
              <td className={`${td} font-medium`}>{h.hedge}</td><td className={td}><Status kind={h.on ? "warning" : "neutral"}>{h.status}</Status></td>
              <td className={R}>{usd(h.notional)}</td><td className={R}>{usd(h.cost)}</td><td className={R}>{pct(h.costPct, 2)}</td>
              <td className={R}>{h.bear ? usd(h.bear) : "–"}</td><td className={R}>{h.tail ? usd(h.tail) : "–"}</td><td className={`${td} text-xs`}>{h.instrument}</td>
            </tr>
          ))}
        </Table>
        <div className="mt-3 grid gap-1 text-sm sm:grid-cols-2">
          <div>Tail scenario before hedges <b>{spct(r.hedges.tailBefore)}</b> → after recommended hedges <b>{spct(r.hedges.tailAfter)}</b></div>
          <div>Bear scenario before hedges <b>{spct(r.hedges.bearBefore)}</b> → after recommended hedges <b>{spct(r.hedges.bearAfter)}</b></div>
        </div>
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          <Chart title="Stress result before vs after recommended hedges">{c.hedgeEffect}</Chart>
          <Chart title="Annual cost of each recommended hedge">{c.hedgeCost}</Chart>
        </div>
      </Card>

      <Card title="6. Intelligence factors × asset classes – impact heat map" sub="Scores −2 … +2; click + for sub-asset classes" className="print-break">
        <Table head={["Asset class", "Code", ...fx.map((f, k) => `F${k + 1} ${f.name.split(/[ ,]/)[0]}`), "Net factor score", "Outlook", "Portfolio weight"]} right={[2, 3, 4, 5, 6, 7, 8, 9, 11]}>
          <tr className="text-xs text-muted"><td className={td}>Importance weight</td><td />{fx.map((f) => <td key={f.name} className={R}>{pct(f.weight, 0)}</td>)}<td colSpan={3} /></tr>
          {r.byL1.map((l1) => [
            <tr key={l1.code}>
              <td className={td}><Expand code={l1.code} label={l1.name} /></td><td className={td}>{l1.code}</td>
              {l1.factors.map((f, k) => <td key={k} className={R} style={heat(f)}>{sgn(f, 1)}</td>)}
              <td className={`${R} font-semibold`} style={heat(l1.netFactor)}>{sgn(l1.netFactor)}</td><td className={td}>{l1.outlook}</td><td className={R}>{l1.weight ? pct(l1.weight) : "–"}</td>
            </tr>,
            ...(open.has(l1.code) ? r.subs.filter((s) => s.l1 === l1.code).map((s) => (
              <tr key={s.code} className="text-ink-2">
                <td className={`${td} pl-7`}>{s.name}</td><td className={`${td} whitespace-nowrap`}>{s.code}</td>
                {s.factors.map((f, k) => <td key={k} className={R} style={heat(f)}>{sgn(f, 1)}</td>)}
                <td className={R} style={heat(s.netFactor)}>{sgn(s.netFactor)}</td><td className={td}>{outlook(s.netFactor)}</td><td className={R}>{s.weight ? pct(s.weight) : "–"}</td>
              </tr>
            )) : []),
          ])}
          <tr className="font-semibold">
            <td className={td}>Portfolio net exposure (holdings-weighted)</td><td />
            {fx.map((f) => <td key={f.name} className={R} style={heat(f.exposure)}>{sgn(f.exposure)}</td>)}
            <td className={R}>{sgn(r.factorSummary.net)}</td><td className={td}>{r.factorSummary.outlook}</td><td className={R}>{pct(V ? 1 : 0, 0)}</td>
          </tr>
        </Table>
        <div className="mt-4 max-w-2xl"><Chart title="Net factor score by asset class (blue = tailwind, red = headwind)">{c.l1Factor}</Chart></div>
      </Card>

      <Card title="7. What drives this portfolio – net exposure to each intelligence factor">
        <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
          <Table head={["Intelligence factor", "Importance", "Portfolio exposure", "Stance", "Consensus direction (12 months)", "Number to remember"]} right={[1, 2]}>
            {fx.map((f, k) => (
              <tr key={f.name}>
                <td className={td}>F{k + 1} {f.name}</td><td className={R}>{pct(f.weight, 0)}</td><td className={`${R} font-semibold`} style={heat(f.exposure)}>{sgn(f.exposure)}</td>
                <td className={td}>{f.stance}</td><td className={`${td} text-ink-2`}>{f.consensus}</td><td className={`${td} text-ink-2`}>{f.number}</td>
              </tr>
            ))}
          </Table>
          <div>
            {c.factors}
            <p className="mt-2 text-xs text-ink-2">
              How to read it: each bar is the holdings-weighted impact score from one factor sheet. Strongest tailwind: {best.name} ({sgn(best.exposure)}). Strongest headwind: {worst.name} ({sgn(worst.exposure)}).
            </p>
          </div>
        </div>
      </Card>

      <Card title="8. Scenario outcomes" sub="Probabilities from the alternative-data Scenario Engine (or the advisor's override)">
        <Table head={["Scenario", "Probability", "Engine confidence", "Our portfolio", "Portfolio value", "Classic 60/40", "Difference vs 60/40"]} right={[1, 3, 4, 5, 6]}>
          {r.scenarios.list.map((s) => (
            <tr key={s.label}><td className={td}>{s.name}</td><td className={R}>{pct(s.prob)}</td><td className={td}>{s.confidence}</td><td className={`${R} font-semibold`}>{spct(s.ret)}</td><td className={R}>{usd(s.value)}</td><td className={R}>{spct(s.sixtyForty)}</td><td className={R}>{spct(s.ret - s.sixtyForty)}</td></tr>
          ))}
          <tr className="font-semibold"><td className={td}>Probability-weighted (expected)</td><td className={R}>{pct(r.scenarios.list.reduce((t, s) => t + s.prob, 0))}</td><td className={td}>{A.engineConfidenceLevel}</td><td className={R}>{spct(pw)}</td><td className={R}>{usd(V * (1 + pw))}</td><td className={R}>{spct(r.scenarios.sixtyFortyWeighted)}</td><td className={R}>{spct(pw - r.scenarios.sixtyFortyWeighted)}</td></tr>
        </Table>
        <p className="mt-3 text-xs text-ink-2">
          Confidence band: expected 12-month return {spct(pw)}, with a range of {spct(r.scenarios.pessimistic)} (pessimistic probabilities) to {spct(r.scenarios.optimistic)} (optimistic), based on how much the alternative-data signals disagree. Overall confidence: {A.engineConfidenceLevel}.
        </p>
        <div className="mt-4 grid gap-4 md:grid-cols-2">
          <div><h4 className="mb-2 text-xs font-semibold text-ink-2">What the portfolio becomes in each scenario</h4>{c.scenarioValues}</div>
          <div><h4 className="mb-2 text-xs font-semibold text-ink-2">Our portfolio vs classic 60/40</h4>{c.vs6040}</div>
        </div>
      </Card>

      <Card title="9. Monitoring: market view, risk limits and sensitivity" className="print-break">
        <MarketView r={r} />
        <div className="mt-4 grid gap-4 xl:grid-cols-[3fr_2fr]"><Limits r={r} /><Sensitivity r={r} /></div>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="10. Key messages for the client" sub="Update automatically">
          <ol className="list-decimal space-y-2 pl-5 text-sm">{r.keyMessages.map((m) => <li key={m}>{m}</li>)}</ol>
        </Card>
        <Card title="11. Notes and limitations">
          <ul className="list-disc space-y-2 pl-5 text-xs text-ink-2">{A.notes.map((n) => <li key={n}>{n}</li>)}</ul>
        </Card>
      </div>
      </div>
    </div>
  );
}

// ---------- Risk ----------
function Risk({ client, r, data }: { client: Client; r: Result; data: Data }) {
  const k = r.risk, c = charts(r), h = client.horizon;
  const rows: [string, string, string][] = [
    ["Expected return per year (USD / AED client)", pct(k.ret, 2), "Long-run average implied by the assumptions and each product's terms."],
    ["Expected return per year (INR client)", pct(k.retInr, 2), `Adds the assumed long-run rupee depreciation (${pct(data.assumptions.market.inrDep)} a year).`],
    ["Estimated volatility per year", pct(k.vol, 2), "Typical size of a yearly swing around the average, using correlations."],
    ["Portfolio beta vs S&P 500", fixed(k.beta, 2), `If US stocks fall 10%, the portfolio tends to move about ${fixed(k.beta * 10, 1)}%.`],
    ["Likely 12-month result", `${spct(k.lo)} to ${spct(k.hi)}`, `About 2 years in 3: ${usd(r.value * (1 + k.lo))} to ${usd(r.value * (1 + k.hi))}.`],
    ["Tough-year result (1 year in 20)", spct(k.toughYear), `A stress marker, not a forecast: ${usd(r.value * (1 + k.toughYear))}.`],
    [`Chance of ${pct(client.target, 0)}+ a year over ${h} years (USD)`, pct(k.pTarget), "Simple normal model over the horizon."],
    [`Chance of ${pct(client.target, 0)}+ a year over ${h} years (INR)`, pct(k.pTargetInr), "Same, in rupee terms."],
    [`Chance of an overall loss over ${h} years`, pct(k.pLoss, 2), "Probability the annualised result is below zero."],
    ["Return per unit of risk", fixed(k.retPerRisk, 2), "Higher is better."],
    [`Gap to the ${pct(client.target, 0)} target`, spct(-k.gapToTarget, 2), "Expected return minus target."],
    ["Share in non-daily-liquidity products", pct(k.nonDailyShare), `Limit ${pct(client.maxIlliquid, 0)}.`],
    ["Correlation check", k.corrCheck, "Flags inconsistent correlation inputs."],
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Portfolio risk and return in plain English" className="lg:col-span-2">
        <Table head={["Metric", "Value", "What it means"]} right={[1]}>
          {rows.map(([a, b, d]) => <tr key={a}><td className={td}>{a}</td><td className={`${R} font-semibold`}>{b}</td><td className={`${td} text-ink-2`}>{d}</td></tr>)}
        </Table>
      </Card>
      <Card title="Share of portfolio vs share of risk">{c.riskShare}</Card>
      <Card title="Where the risk really comes from">
        <Table head={["Asset class", "Weight", "E[r]", "Share of risk", "Risk / weight"]} right={[1, 2, 3, 4]}>
          {r.byL1.filter((x) => x.weight > 0).map((x) => (
            <tr key={x.code}><td className={td}>{x.name}</td><td className={`${R}`}>{pct(x.weight)}</td><td className={`${R}`}>{pct(x.eRet)}</td><td className={`${R}`}>{pct(x.riskShare)}</td><td className={`${R}`}>{fixed(x.riskRatio, 2)}×</td></tr>
          ))}
        </Table>
      </Card>
      <Card title="Holdings by sub-asset class" className="lg:col-span-2">
        <Table head={["Sub-asset class", "Lines", "Amount", "Weight", "E[r]", "Vol", "Beta", "Risk 1-5"]} right={[1, 2, 3, 4, 5, 6, 7]}>
          {r.subs.filter((s) => s.amount > 0).map((s) => (
            <tr key={s.code}><td className={td}>{s.name} <span className="text-muted">· {s.code}</span></td><td className={`${R}`}>{s.lines}</td><td className={`${R}`}>{usd(s.amount)}</td><td className={`${R}`}>{pct(s.weight)}</td><td className={`${R}`}>{pct(s.eRet)}</td><td className={`${R}`}>{pct(s.eVol)}</td><td className={`${R}`}>{fixed(s.eBeta, 2)}</td><td className={`${R}`}>{fixed(s.eRisk, 1)}</td></tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// ---------- Scenarios ----------
function Scenarios({ client, r, data, onClient }: { client: Client; r: Result; data: Data; onClient: (c: Client) => void }) {
  const c = charts(r);
  const [draft, setDraft] = useState(() => r.scenarios.list.map((s) => Math.round(s.prob * 1000) / 10));
  const total = draft.reduce((t, x) => t + x, 0);
  const inRange = draft.every((x) => x >= 0 && x <= 100);
  const valid = inRange && Math.abs(total - 100) < 0.05;
  const overridden = !!client.probOverride;
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card title="Four 12-month futures" sub="Probabilities blend the house view with the alternative-data engine; override them below if needed." className="lg:col-span-2">
        <Table head={["Scenario", "What triggers it", "Probability %", "Engine confidence", "Our portfolio", "Classic 60/40", "Value in 12m"]} right={[2, 4, 5, 6]}>
          {r.scenarios.list.map((s, k) => (
            <tr key={s.label}>
              <td className={`${td} font-medium`}>{s.name}</td><td className={`${td} text-ink-2`}>{s.trigger}</td>
              <td className={`${R}`}>
                <input type="number" step={0.5} min={0} max={100} aria-label={`${s.label} probability`} value={draft[k]}
                  onChange={(e) => setDraft(draft.map((x, j) => (j === k ? Number(e.target.value) || 0 : x)))}
                  className="num w-20 rounded-md border border-line px-2 py-1 text-right" />
              </td>
              <td className={td}>{s.confidence}</td>
              <td className={`${R} font-semibold`}>{spct(s.ret)}</td><td className={`${R}`}>{spct(s.sixtyForty)}</td><td className={`${R}`}>{usd(s.value)}</td>
            </tr>
          ))}
        </Table>
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="num" style={{ color: valid ? "var(--ink-2)" : "var(--critical)" }}>Total {fixed(total, 1)}%{valid ? "" : inRange ? " (must be 100%)" : " (each must be 0-100%)"}</span>
          <button disabled={!valid} onClick={() => onClient({ ...client, probOverride: draft.map((x) => x / 100) })}
            className="rounded-lg bg-accent px-3 py-1 text-sm font-medium text-white disabled:opacity-40">Apply override</button>
          {overridden && <button onClick={() => { onClient({ ...client, probOverride: undefined }); setDraft(data.assumptions.scenarios.map((s) => Math.round(s.prob * 1000) / 10)); }}
            className="rounded-lg border border-line px-3 py-1 text-sm">Reset to engine</button>}
          <span className="ml-auto">Probability-weighted 12m: <b>{spct(r.scenarios.probWeighted, 2)}</b> · band {spct(r.scenarios.pessimistic)} to {spct(r.scenarios.optimistic)}</span>
        </div>
      </Card>
      <Card title="What the portfolio becomes in each scenario">{c.scenarioValues}</Card>
      <Card title="Our portfolio vs classic 60/40">{c.vs6040}</Card>
      <Card title="Every line in every scenario" className="lg:col-span-2">
        <Table head={["Product", "Amount", ...r.scenarios.list.map((s) => s.label), "Prob-weighted", "Worst"]} right={[1, 2, 3, 4, 5, 6, 7]}>
          {r.lines.map((l) => (
            <tr key={l.uid}><td className={td}>{l.product.name}</td><td className={`${R}`}>{usd(l.amount)}</td>
              {l.scen.map((x, k) => <td key={k} className={`${R}`}>{spct(x)}</td>)}
              <td className={`${R}`}>{spct(l.probWeighted)}</td><td className={`${R}`}>{spct(l.worst)}</td></tr>
          ))}
        </Table>
      </Card>
    </div>
  );
}

// ---------- Actions & hedges ----------
function Actions({ r }: { r: Result }) {
  const c = charts(r);
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Money by next best action" sub="How much of the portfolio each action touches">{c.byAction}</Card>
        <Card title="Money by priority" sub="High = fix or resize before execution">{c.byPriority}</Card>
      </div>
      <Card title="Next best action for every line" sub="Highest priority first. Rules: eligibility, concentration, distressed yield, worst scenario, DD, US situs, factors, cost.">
        <Table head={["Product", "Amount", "Net factor", "Worst", "Flags raised", "Next best action", "What to do"]} right={[1, 2, 3]}>
          {r.actions.map((l) => (
            <tr key={l.uid}>
              <td className={td}><div className="text-[11px] text-muted">{l.id} · {l.sleeve}</div>{l.product.name}</td>
              <td className={`${R}`}>{usd(l.amount)}</td><td className={`${R}`}>{(l.netFactor >= 0 ? "+" : "") + fixed(l.netFactor, 2)}</td><td className={`${R}`}>{spct(l.worst, 0)}</td>
              <td className={`${td} text-xs text-ink-2`}>{l.flags.join("; ") || "—"}</td>
              <td className={td}><Status kind={priorityKind(l.priority)}>{l.priority}</Status><div className="font-medium">{l.action}</div></td>
              <td className={`${td} text-xs text-ink-2`}>{l.whatToDo}</td>
            </tr>
          ))}
        </Table>
      </Card>
      <Card title="Hedging recommendations for the whole portfolio" sub="Each hedge fires on its trigger; cost and benefit sized in dollars.">
        <Table head={["Hedge", "Trigger", "Status", "Instrument / action", "Notional", "Annual cost", "Benefit: bear", "Benefit: tail"]} right={[4, 5, 6, 7]}>
          {r.hedges.rows.map((h) => (
            <tr key={h.hedge} className={h.on ? "" : "text-muted"}>
              <td className={`${td} font-medium`}>{h.hedge}<div className="text-xs font-normal text-ink-2">{h.why}</div></td>
              <td className={`${td} text-xs`}>{h.trigger}</td>
              <td className={td}><Status kind={h.on ? "warning" : "neutral"}>{h.on ? "Recommended" : "Not needed"}</Status></td>
              <td className={`${td} text-xs`}>{h.instrument}</td>
              <td className={`${R}`}>{usd(h.notional)}</td><td className={`${R}`}>{usd(h.cost)}</td><td className={`${R}`}>{usd(h.bear)}</td><td className={`${R}`}>{usd(h.tail)}</td>
            </tr>
          ))}
          <tr className="font-semibold"><td className={td} colSpan={5}>Recommended hedges: total</td><td className={`${R}`}>{usd(r.hedges.cost)} ({pct(r.hedges.costPct, 2)})</td><td className={`${R}`}>{usd(r.hedges.bearBenefit)}</td><td className={`${R}`}>{usd(r.hedges.tailBenefit)}</td></tr>
        </Table>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          <Chart title="What each recommended hedge costs vs what it saves in a tail year">{c.hedgeValue}</Chart>
          <Chart title="Stress result before vs after the recommended hedges">{c.hedgeEffect}</Chart>
        </div>
        <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
          <div>Tail scenario before hedges <b>{spct(r.hedges.tailBefore, 2)}</b> → after <b>{spct(r.hedges.tailAfter, 2)}</b></div>
          <div>Bear scenario before hedges <b>{spct(r.hedges.bearBefore, 2)}</b> → after <b>{spct(r.hedges.bearAfter, 2)}</b></div>
        </div>
      </Card>
    </div>
  );
}

// ---------- Why this mix: the reasoning behind the build, on the engine's own numbers ----------
const pt = (x: number) => `${x >= 0 ? "+" : "−"}${fixed(Math.abs(x * 100), 2)}pt`;
function Why({ client, r, data }: { client: Client; r: Result; data: Data }) {
  const w = r.why, k = r.risk;
  const drop = useMemo(() => withoutEach(client, r.lines.map((l) => ({ uid: l.uid, id: l.id, sleeve: l.sleeve, amount: l.amount })), data), [client, r.lines, data]);
  const earners = w.lines.filter((x) => x.surplus >= 0).length;
  const sixty = w.marks[0];
  const top = [...r.lines].sort((a, b) => b.riskShare - a.riskShare);
  const blocked = r.lines.filter((l) => l.eligibility !== "OK");
  const verdict = (dRet: number, dVol: number) => {
    const up = dRet > 0.0001, safer = dVol < -0.0001;
    return up && safer ? ["good", "Adds return, cuts risk"] : up ? ["neutral", "Adds return, adds risk"] : safer ? ["neutral", "Cuts risk, costs return"] : ["warning", "Costs return, adds risk"];
  };
  return (
    <div className="space-y-4">
      <p className="text-[15px] text-ink-2">
        Mixing removes <b className="text-ink">{pct(w.diversification, 0)}</b> of the lines' stand-alone risk, and <b className="text-ink">{earners} of {w.lines.length}</b> lines earn more than their share of risk demands.
      </p>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Where it sits" sub="Each grey dot is a random mix of the same products. Up and to the left is better: more return for less swing.">
          <RiskReturn cloud={w.cloud} marks={w.marks} you={{ name: "This portfolio", vol: k.vol, ret: k.ret }} />
          <p className="mt-3 border-l-4 border-accent pl-3 text-[13px] text-ink-2">
            This portfolio earns <b className="text-ink">{pct(k.ret)}</b> for <b className="text-ink">{pct(k.vol)}</b> volatility; a classic 60/40 earns {pct(sixty.ret)} for {pct(sixty.vol)}.
            Only <b className="text-ink">{pct(w.beaten, 1)}</b> of {w.cloud.length} random mixes of the same products do better on both. Holding them separately would mean {pct(w.standalone)} of swing; mixing brings it to {pct(k.vol)}.
          </p>
        </Card>
        <Card title="Money vs risk" sub="Where the swings really come from.">
          {charts(r).riskShare}
          <div className="eyebrow mb-2 mt-4">Biggest risk contributors</div>
          <Stack parts={[...top.slice(0, 5).map((l, i) => ({ name: l.rationale?.split(":")[0].split(" (")[0] || l.product.name, value: l.riskShare, color: CAT(i) })),
            { name: "Everything else", value: top.slice(5).reduce((t, l) => t + l.riskShare, 0), color: "var(--axis)" }]} />
        </Card>
      </div>
      <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Every line earns its place" sub={`Each line's expected return minus its hurdle: cash (${pct(w.rf)}) plus what its share of this portfolio's risk should earn. In the best possible risk/return mix every bar would be zero. Blue earns more than its risk costs; red is there for another reason (diversification, income or a client wish).`}>
          <Diverging rows={w.lines.map((x, i) => ({ name: r.lines[i].rationale?.split(" (")[0] || short(x.name), value: x.surplus }))} fmt={pt} label="Surplus over hurdle" yWidth={230} />
        </Card>
        <Card title="What each line adds" sub="The same portfolio without the line, the rest scaled up to the same amount.">
          <Table head={["Line", "Return", "Volatility", "Verdict"]} right={[1, 2]}>
            {r.lines.map((l, i) => {
              const dRet = k.ret - drop[i].ret, dVol = k.vol - drop[i].vol, [kind, label] = verdict(dRet, dVol);
              return (
                <tr key={l.uid}><td className={td}>{l.rationale?.split(" (")[0] || short(l.product.name)}</td><td className={R}>{pt(dRet)}</td><td className={R}>{pt(dVol)}</td>
                  <td className={td}><Status kind={kind as "good"}>{label}</Status></td></tr>
              );
            })}
          </Table>
          {blocked.length > 0 && (
            <div className="mt-4"><div className="eyebrow mb-1">Not ready yet</div>
              {blocked.map((l) => <p key={l.uid} className="text-[13px] text-ink-2">{l.product.name}: {l.eligibility.replace(/^\w+: /, "")}</p>)}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}

// ---------- Monitoring: market view, risk limits, sensitivity (shared by the summary and the tab) ----------
const limitFmt = (k: string, v: number) => (k === "usd" ? usd(v) : k === "count" ? String(v) : pct(v));
function MarketView({ r }: { r: Result }) {
  const m = r.marketView;
  return (
    <div className="flex flex-wrap items-center gap-x-6 gap-y-2 rounded-lg border border-line bg-surface-2 p-3 text-sm">
      <span className="font-semibold">Market view</span><Status kind={lightKind(m.view)}>{m.view}</Status>
      <span className="text-ink-2">Upside scenarios (base + bull) {pct(m.pUp, 0)} · downside (bear + tail) {pct(m.pDown, 0)}</span>
      <span className="text-ink-2">Market lights: {m.red} red, {m.amber} amber of {m.indicators}</span>
      <span className="text-xs text-muted">Rule: risk-off if downside ≥ 40% or 2+ red lights; risk-on if downside ≤ 30%, no red and at most 1 amber.</span>
      <div className="w-full"><Stack parts={r.scenarios.list.map((s, i) => ({ name: `${s.label} odds`, value: s.prob, color: CAT([1, 0, 2, 3][i]) }))} /></div>
    </div>
  );
}
function Limits({ r }: { r: Result }) {
  // share of each limit used; count limits with a zero setting have no ratio and stay in the table only
  const used = r.riskLimits.filter((x) => x.setting && x.name !== "All amounts mapped to a sub-asset class");
  return (
    <>
    <div className="mb-5"><div className="eyebrow mb-2">How much of each limit is used</div>
      <Gauges lineLabel="limit" rows={used.map((x) => ({ name: x.name.replace(/ (at most|no worse than|vs target|above drawdown review trigger)$/, ""), at: x.actual / x.setting, kind: lightKind(x.status) as "good", value: pct(x.actual / x.setting, 0) }))} />
    </div>
    <Table head={["Limit", "Setting", "Actual", "Status", "Rule / action if breached"]} right={[1, 2]}>
      {r.riskLimits.map((x) => (
        <tr key={x.name}><td className={td}>{x.name}</td><td className={R}>{limitFmt(x.kind, x.setting)}</td><td className={`${R} font-semibold`}>{limitFmt(x.kind, x.actual)}</td>
          <td className={td}><Status kind={lightKind(x.status)}>{x.status}</Status></td><td className={`${td} text-xs text-ink-2`}>{x.rule}</td></tr>
      ))}
    </Table>
    </>
  );
}
function Sensitivity({ r }: { r: Result }) {
  return (
    <>
    <div className="mb-4"><Diverging rows={r.sensitivity.map((x) => ({ name: x.shock, value: x.pct }))} fmt={(v) => spct(v, 1)} label="Portfolio change" yWidth={170} /></div>
    <Table head={["If…", "Portfolio change", "In dollars", "Based on"]} right={[1, 2]}>
      {r.sensitivity.map((x) => (
        <tr key={x.shock}><td className={td}>{x.shock}</td><td className={`${R} font-semibold`} style={heat(x.pct * 20)}>{spct(x.pct, 1)}</td><td className={R}>{usd(x.usd)}</td><td className={`${td} text-xs text-ink-2`}>{x.basis}</td></tr>
      ))}
    </Table>
    </>
  );
}

// ---------- Monitoring ----------
function Monitoring({ client, r, data, onClient }: { client: Client; r: Result; data: Data; onClient: (c: Client) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-6 rounded-xl border border-line bg-surface p-4">
        <Status kind="critical">{r.counts.red} at red</Status>
        <Status kind="warning">{r.counts.amber} at amber</Status>
        <Status kind="good">{r.monitoring.length - r.counts.red - r.counts.amber} at green</Status>
        <label className="ml-auto flex items-center gap-2 text-sm">Portfolio drawdown from peak (%)
          <input type="number" step={1} className="num w-20 rounded-md border border-line px-2 py-1 text-right"
            value={Math.round((client.drawdown ?? 0) * 1000) / 10}
            onChange={(e) => onClient({ ...client, drawdown: (Number(e.target.value) || 0) / 100 })} />
        </label>
      </div>
      <MarketView r={r} />
      <div className="grid gap-4 xl:grid-cols-[3fr_2fr]">
        <Card title="Risk limits check" sub="Same rules as the workbook's Risk & Hedging sheet"><Limits r={r} /></Card>
        <Card title="Sensitivity: what if markets move?" sub="Instant first-order impact on today's portfolio"><Sensitivity r={r} /></Card>
      </div>
      <Card title="Traffic-light indicators" sub="Decisions agreed before the event. Rows marked live recalculate from this portfolio; the rest are market data as of the workbook date.">
        <div className="mb-5"><div className="eyebrow mb-2">How close each indicator is to its red line</div>
          <Gauges lineLabel="red" rows={r.monitoring.map((m) => {
            // 0 = safe end, 1 = red; "higher is worse" runs from zero, "lower is worse" from 1 (or 0 for negative reds like drawdown)
            const g = m.direction === "Higher is worse" ? 0 : m.red > 0 ? 1 : 0, at = (v: number) => (g - v) / (g - m.red) || 0;
            const p = m.direction === "Higher is worse" ? m.current / m.red : at(m.current), a = m.direction === "Higher is worse" ? m.amber / m.red : at(m.amber);
            const money = m.indicator.includes("(USD)");
            return { name: m.indicator.replace(/ \(.*?\)$/, ""), at: p, amber: a, kind: lightKind(m.status) as "good", value: money ? usdK(m.current) : m.indicator.includes("drawdown") ? pct(m.current, 0) : Number.isInteger(m.current) ? String(m.current) : fixed(m.current, 2) };
          })} />
        </div>
        <Table head={["Indicator", "Current", "Amber", "Red", "Status", "Pre-agreed action at red", "Source"]} right={[1, 2, 3]}>
          {r.monitoring.map((m) => {
            const money = m.indicator.includes("(USD)");
            const f = (v: number) => (money ? usd(v) : m.indicator.includes("drawdown") ? pct(v, 0) : Number.isInteger(v) ? String(v) : fixed(v, 2));
            return (
              <tr key={m.indicator}>
                <td className={td}>{m.indicator}<div className="text-[11px] text-muted">{m.linked} · {m.direction.toLowerCase()}</div></td>
                <td className={`${R} font-semibold`}>{f(m.current)}</td><td className={`${R}`}>{f(m.amber)}</td><td className={`${R}`}>{f(m.red)}</td>
                <td className={td}><Status kind={lightKind(m.status)}>{m.status}</Status></td>
                <td className={`${td} text-xs text-ink-2`}>{m.action}</td><td className={`${td} text-xs text-muted`}>{m.live ? "Live" : m.source}</td>
              </tr>
            );
          })}
        </Table>
      </Card>
      <Card title="Event calendar">
        <Table head={["Date", "Event", "Factor", "Why it matters"]}>
          {data.assumptions.events.map((e) => <tr key={e.event}><td className={`${td} whitespace-nowrap`}>{e.date}</td><td className={td}>{e.event}</td><td className={td}>{e.factor}</td><td className={`${td} text-ink-2`}>{e.why}</td></tr>)}
        </Table>
      </Card>
    </div>
  );
}

export default function Analysis({ tab, client, result, onClient, data }: { tab: Tab; client: Client; result: Result; onClient: (c: Client) => void; data: Data }) {
  if (tab === "Client summary") return <Summary client={client} r={result} data={data} />;
  if (tab === "Why this mix") return <Why client={client} r={result} data={data} />;
  if (tab === "Risk") return <Risk client={client} r={result} data={data} />;
  if (tab === "Scenarios") return <Scenarios client={client} r={result} data={data} onClient={onClient} />;
  if (tab === "Actions & hedges") return <Actions r={result} />;
  return <Monitoring client={client} r={result} data={data} onClient={onClient} />;
}
