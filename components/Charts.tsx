"use client";
// Thin recharts wrappers. Colours come from CSS tokens (globals.css); text stays in ink tokens.
import {
  Bar, BarChart, CartesianGrid, Cell, LabelList, Legend, Pie, PieChart, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart,
  Tooltip, XAxis, YAxis, ZAxis,
} from "recharts";
import { fixed, xround } from "@/lib/engine";

const axis = { stroke: "var(--axis)", tick: { fill: "var(--muted)", fontSize: 11 }, tickLine: false };
const tip = {
  contentStyle: { background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12, color: "var(--ink)" },
  labelStyle: { color: "var(--ink)", fontWeight: 600 }, itemStyle: { color: "var(--ink-2)" },
  cursor: { fill: "var(--surface-2)" },
};
const legend = { wrapperStyle: { fontSize: 12, color: "var(--ink-2)" }, iconType: "square" as const, iconSize: 10 };
const pctFmt = (d = 0) => (v: number) => `${fixed(v * 100, d)}%`;
const usdFmt = (v: number) => `${v < 0 ? "−" : ""}$${xround(Math.abs(v)).toLocaleString("en-US")}`;

type Row = Record<string, string | number>;

/** One measure per category, horizontal bars (allocation, return contribution). */
export function HBar({ rows, value, fmt = pctFmt(1), height, yWidth = 96 }: { rows: Row[]; value: string; fmt?: (v: number) => string; height?: number; yWidth?: number }) {
  return (
    <ResponsiveContainer width="100%" height={height ?? Math.max(120, rows.length * 30 + 30)}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 48, top: 4, bottom: 4 }} barCategoryGap={6}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis type="number" {...axis} tickFormatter={fmt} />
        <YAxis type="category" dataKey="name" {...axis} width={yWidth} />
        <Tooltip {...tip} formatter={(v: number) => fmt(v)} />
        <Bar dataKey={value} fill="var(--series-1)" radius={[0, 4, 4, 0]} maxBarSize={18}
          label={{ position: "right", fill: "var(--ink-2)", fontSize: 11, formatter: fmt }} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Two measures per category side by side (target vs actual, portfolio vs risk share, ours vs 60/40). */
export function Pair({ rows, a, b, fmt = pctFmt(0), height = 240 }: { rows: Row[]; a: string; b: string; fmt?: (v: number) => string; height?: number }) {
  // axis always includes zero and ends on a round step, so bar lengths stay honest
  const vals = rows.flatMap((r) => [Number(r[a]) || 0, Number(r[b]) || 0]);
  const lo0 = Math.min(0, ...vals), hi0 = Math.max(0, ...vals), step = niceStep(hi0 - lo0 || 1);
  const domain = [Math.floor(lo0 / step) * step, Math.ceil(hi0 / step) * step];
  const ticks = Array.from({ length: Math.round((domain[1] - domain[0]) / step) + 1 }, (_, i) => +(domain[0] + i * step).toFixed(10));
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={rows} margin={{ left: 0, right: 8, top: 8, bottom: 4 }} barGap={2} barCategoryGap="22%">
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="name" {...axis} interval={0} tick={{ ...axis.tick, fontSize: 10 }} />
        <YAxis {...axis} tickFormatter={fmt} width={fmt === usdFmt ? 64 : 44} domain={domain} ticks={ticks} />
        <Tooltip {...tip} formatter={(v: number) => fmt(v)} />
        <Legend {...legend} />
        <ReferenceLine y={0} stroke="var(--axis)" />
        <Bar dataKey={a} fill="var(--series-1)" radius={[4, 4, 0, 0]} maxBarSize={28} />
        <Bar dataKey={b} fill="var(--series-2)" radius={[4, 4, 0, 0]} maxBarSize={28} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Signed horizontal bars: tailwind (blue) vs headwind (red) around a zero line. */
// round tick step (1, 2, 2.5 or 5 × a power of ten) giving about 4 intervals
const niceStep = (span: number) => {
  const p = 10 ** Math.floor(Math.log10(span / 4 || 1)), m = span / 4 / p;
  return p * (m <= 1 ? 1 : m <= 2 ? 2 : m <= 2.5 ? 2.5 : m <= 5 ? 5 : 10);
};

export function Diverging({ rows, fmt = (v: number) => (v >= 0 ? "+" : "") + fixed(v, 2), label = "Net exposure", yWidth = 150 }: { rows: { name: string; value: number }[]; fmt?: (v: number) => string; label?: string; yWidth?: number }) {
  // zero-anchored domain on round ticks, padded so the end labels fit
  const lo0 = Math.min(0, ...rows.map((r) => r.value)) * 1.35, hi0 = Math.max(0, ...rows.map((r) => r.value)) * 1.35;
  const step = niceStep(hi0 - lo0 || 1), lo = Math.floor(lo0 / step) * step, hi = Math.ceil(hi0 / step) * step;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => +(lo + i * step).toFixed(10));
  return (
    <ResponsiveContainer width="100%" height={rows.length * 32 + 30}>
      <BarChart data={rows} layout="vertical" margin={{ left: 8, right: 40, top: 4, bottom: 4 }}>
        <CartesianGrid horizontal={false} stroke="var(--grid)" />
        <XAxis type="number" {...axis} tickFormatter={fmt} domain={[lo, hi]} ticks={ticks} />
        <YAxis type="category" dataKey="name" {...axis} width={yWidth} />
        <Tooltip {...tip} formatter={(v: number) => [fmt(v), label]} />
        <ReferenceLine x={0} stroke="var(--axis)" />
        <Bar dataKey="value" maxBarSize={16} radius={4} label={(p: { x: number; y: number; width: number; height: number; value: number }) => {
          // label sits past the bar's outer end: right of positive bars, left of negative ones
          const neg = p.value < 0, end = neg ? Math.min(p.x, p.x + p.width) - 4 : Math.max(p.x, p.x + p.width) + 4;
          return <text x={end} y={p.y + p.height / 2} dy={4} textAnchor={neg ? "end" : "start"} fill="var(--ink-2)" fontSize={11}>{fmt(p.value)}</text>;
        }}>
          {rows.map((r) => <Cell key={r.name} fill={r.value >= 0 ? "var(--pos)" : "var(--neg)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Gain / loss vs today per scenario (bars start at zero), labelled with the 12-month value. */
export function ScenarioValues({ rows, invested }: { rows: { name: string; value: number }[]; invested: number }) {
  const data = rows.map((r) => ({ ...r, change: r.value - invested }));
  const k = (v: number) => `${v < 0 ? "−" : "+"}$${fixed(Math.abs(v / 1000), 0)}k`;
  return (
    <ResponsiveContainer width="100%" height={240}>
      <BarChart data={data} margin={{ left: 8, right: 8, top: 20, bottom: 20 }}>
        <CartesianGrid vertical={false} stroke="var(--grid)" />
        <XAxis dataKey="name" {...axis} />
        <YAxis {...axis} tickFormatter={k} width={56} />
        <Tooltip {...tip} formatter={(v: number, _n, item) => [`${k(v)} → ${usdFmt(item.payload.value)}`, "Change in 12 months"]} />
        <ReferenceLine y={0} stroke="var(--axis)" />
        <Bar dataKey="change" maxBarSize={56} radius={4}
          label={{ position: "top", fill: "var(--ink-2)", fontSize: 11, formatter: (v: number) => usdFmt(v + invested) }}>
          {data.map((r) => <Cell key={r.name} fill={r.change >= 0 ? "var(--pos)" : "var(--neg)"} />)}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Two-ring donut: inner ring = groups (sleeves), outer ring = items (lines) in their group's colour; 2px surface gaps. */
export function Donut({ groups, items, center, sub }: {
  groups: { name: string; value: number; color: string }[]; items: { name: string; value: number; color: string }[];
  center: string; sub: string;
}) {
  const fmt = (v: number) => usdFmt(v);
  return (
    <div className="relative h-[230px] w-[230px] flex-none">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Tooltip {...tip} formatter={(v: number, n) => [fmt(v), n]} />
          <Pie data={groups} dataKey="value" nameKey="name" innerRadius={62} outerRadius={84} stroke="var(--surface)" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
            {groups.map((g) => <Cell key={g.name} fill={`color-mix(in srgb, ${g.color} 45%, var(--surface))`} />)}
          </Pie>
          <Pie data={items} dataKey="value" nameKey="name" innerRadius={88} outerRadius={112} stroke="var(--surface)" strokeWidth={2} startAngle={90} endAngle={-270} isAnimationActive={false}>
            {items.map((x, i) => <Cell key={i} fill={x.color} />)}
          </Pie>
        </PieChart>
      </ResponsiveContainer>
      <div className="pointer-events-none absolute inset-0 grid place-items-center text-center">
        <div><div className="num text-xl font-bold text-ink">{center}</div><div className="text-[11px] text-muted">{sub}</div></div>
      </div>
    </div>
  );
}

/** One 100% bar split into labelled parts (look-through geography, cash ladder). Values sit in the legend below. */
export function Stack({ parts }: { parts: { name: string; value: number; color: string }[] }) {
  const total = parts.reduce((t, p) => t + p.value, 0) || 1;
  return (
    <div>
      <div className="flex h-4 gap-0.5 overflow-hidden rounded-md">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.name} title={`${p.name}: ${pctFmt(1)(p.value / total)}`} className="min-w-[3px]" style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />
        ))}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {parts.map((p) => (
          <span key={p.name} className="inline-flex items-center gap-1.5"><span aria-hidden className="h-2.5 w-2.5 rounded-sm" style={{ background: p.color }} />{p.name} <b className="num text-ink">{pctFmt(0)(p.value / total)}</b></span>
        ))}
      </div>
    </div>
  );
}

/** Risk vs return: grey cloud of random mixes, labelled reference points, and this portfolio on top. */
export function RiskReturn({ cloud, marks, you }: {
  cloud: { vol: number; ret: number }[]; marks: { name: string; vol: number; ret: number }[]; you: { name: string; vol: number; ret: number };
}) {
  const f = pctFmt(1), all = [...cloud, ...marks, you];
  // round axes from zero: 2-pt steps on return, 4-pt steps on volatility
  const up = (m: number, st: number) => Array.from({ length: Math.ceil(m / st) + 1 }, (_, i) => +(i * st).toFixed(4));
  const xt = up(Math.max(...all.map((d) => d.vol)) * 1.05, 0.04), yt = up(Math.max(...all.map((d) => d.ret)) * 1.05, 0.02);
  return (
    <ResponsiveContainer width="100%" height={360}>
      <ScatterChart margin={{ left: 8, right: 64, top: 16, bottom: 24 }}>
        <CartesianGrid stroke="var(--grid)" />
        <XAxis type="number" dataKey="vol" name="Volatility" {...axis} tickFormatter={pctFmt(0)} domain={[0, xt[xt.length - 1]]} ticks={xt}
          label={{ value: "Volatility (typical yearly swing)", position: "insideBottom", offset: -16, fill: "var(--muted)", fontSize: 11 }} />
        <YAxis type="number" dataKey="ret" name="Expected return" {...axis} tickFormatter={pctFmt(0)} width={44} domain={[0, yt[yt.length - 1]]} ticks={yt}
          label={{ value: "Expected return / yr", angle: -90, position: "insideLeft", fill: "var(--muted)", fontSize: 11, dy: 50 }} />
        <ZAxis range={[60, 60]} />
        <Tooltip {...tip} cursor={{ strokeDasharray: "3 3" }} formatter={(v: number, n) => [f(v), n]} />
        <Legend {...legend} iconType="circle" verticalAlign="top" height={28} />
        <Scatter name="Random mixes of the same products" data={cloud} fill="var(--axis)" fillOpacity={0.5} shape={(p: unknown) => { const { cx, cy } = p as { cx: number; cy: number }; return <circle cx={cx} cy={cy} r={2} fill="var(--axis)" fillOpacity={0.55} />; }} isAnimationActive={false} />
        <Scatter name="Benchmarks" data={marks} fill="var(--series-2)" isAnimationActive={false}>
          <LabelList dataKey="name" position="right" fill="var(--ink-2)" fontSize={11} />
        </Scatter>
        <Scatter name="This portfolio" data={[you]} fill="var(--accent)" shape={(p: unknown) => { const { cx, cy } = p as { cx: number; cy: number }; return <circle cx={cx} cy={cy} r={7} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />; }} isAnimationActive={false}>
          <LabelList dataKey="name" position="top" fill="var(--ink)" fontSize={12} fontWeight={700} />
        </Scatter>
      </ScatterChart>
    </ResponsiveContainer>
  );
}

/** Horizontal gauges: fill = how far along the track (0 = safe, 1 = the line), optional amber tick; status carries an icon. */
const GAUGE = { good: ["var(--good)", "●"], warning: ["var(--warning)", "▲"], critical: ["var(--critical)", "✕"] } as const;
export function Gauges({ rows, lineLabel }: {
  rows: { name: string; at: number; amber?: number; kind: keyof typeof GAUGE; value: string }[]; lineLabel: string;
}) {
  const max = 1.25; // track runs a quarter past the line so breaches stay visible
  const x = (v: number) => `${(Math.max(0, Math.min(max, v)) / max) * 100}%`;
  return (
    <div className="space-y-2.5">
      {rows.map((r) => (
        <div key={r.name} className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_72px] items-center gap-3 text-xs">
          <span className="truncate text-ink-2" title={r.name}>{r.name}</span>
          <span className="relative h-2.5 rounded-full bg-surface-2">
            <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: x(r.at), background: GAUGE[r.kind][0] }} />
            {r.amber != null && <span title="amber" className="absolute -inset-y-1 w-0.5 bg-[var(--warning)]" style={{ left: x(r.amber) }} />}
            <span title={lineLabel} className="absolute -inset-y-1.5 w-0.5 bg-ink" style={{ left: x(1) }} />
          </span>
          <span className="num whitespace-nowrap text-right font-semibold text-ink"><span aria-hidden style={{ color: GAUGE[r.kind][0] }}>{GAUGE[r.kind][1]}</span> {r.value}</span>
        </div>
      ))}
      <div className="grid grid-cols-[minmax(0,1.3fr)_minmax(0,2fr)_72px] gap-3 text-[11px] text-faint">
        <span /><span className="relative h-3"><span className="absolute -translate-x-1/2" style={{ left: x(1) }}>{lineLabel}</span></span><span />
      </div>
    </div>
  );
}

export { pctFmt, usdFmt };
