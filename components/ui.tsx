// Small shared UI bits: number formats, cards, badges.
// Numbers round like Excel (half away from zero on the decimal value), the same as the engine's report text.
import { fixed, xround } from "@/lib/engine";

export const usd = (x: number) => `${x < 0 ? "−" : ""}$${xround(Math.abs(x)).toLocaleString("en-US")}`;
export const usdK = (x: number) => (Math.abs(x) >= 1e6 ? `$${fixed(x / 1e6, 2)}m` : `$${xround(x / 1000).toLocaleString("en-US")}k`);
export const pct = (x: number, d = 1) => `${fixed(x * 100, d)}%`;
export const spct = (x: number, d = 1) => `${x >= 0 ? "+" : "−"}${fixed(Math.abs(x * 100), d)}%`;

export function Card({ title, sub, children, className = "" }: { title?: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-[20px] border border-line bg-surface p-5 shadow-[var(--shadow)] ${className}`}>
      {title && <h3 className="text-lg font-bold">{title}</h3>}
      {sub && <p className="mb-4 mt-0.5 text-[13px] text-muted">{sub}</p>}
      {title && !sub && <div className="mb-4" />}
      {children}
    </section>
  );
}

// Status colours are reserved for state and always carry an icon + label (soft chip).
const STATUS: Record<string, { bg: string; fg: string; i: string }> = {
  good: { bg: "var(--good-soft)", fg: "var(--good-ink)", i: "●" },
  warning: { bg: "var(--warning-soft)", fg: "var(--warning-ink)", i: "▲" },
  serious: { bg: "var(--warning-soft)", fg: "var(--warning-ink)", i: "◆" },
  critical: { bg: "var(--critical-soft)", fg: "var(--critical-ink)", i: "✕" },
  neutral: { bg: "var(--surface-2)", fg: "var(--ink-2)", i: "○" },
};
export function Status({ kind, children }: { kind: keyof typeof STATUS; children: React.ReactNode }) {
  const s = STATUS[kind];
  return (
    <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-[11.5px] font-semibold" style={{ background: s.bg, color: s.fg }}>
      <span aria-hidden className="text-[9px]">{s.i}</span>
      {children}
    </span>
  );
}
export const eligibilityKind = (e: string) => (e.startsWith("BLOCKED") ? "critical" : e.startsWith("REVIEW") || e.startsWith("CHECK") ? "warning" : "good");
export const priorityKind = (p: string) => (p === "High" ? "critical" : p === "Medium" ? "warning" : "neutral");
export const lightKind = (s: string) => (s === "RED" || s === "BREACH" || s === "Risk-off" ? "critical" : s === "AMBER" || s === "WATCH" || s === "Neutral" ? "warning" : "good");
export const mandateKind = (s: string) => (s === "On target" ? "good" : "warning");

export function Pill({ children }: { children: React.ReactNode }) {
  return <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">{children}</span>;
}

// KPI tile; the headline tile can be mint.
export function Stat({ label, value, sub, mint }: { label: string; value: string; sub?: string; mint?: boolean }) {
  return (
    <div className={`min-w-0 rounded-[14px] border p-3.5 ${mint ? "border-transparent bg-mint" : "border-line bg-surface"}`}>
      <div className="text-xs font-semibold text-ink-2">{label}</div>
      <div className={`num mt-1 truncate font-bold ${value.length > 12 ? "text-base leading-[33px]" : "text-[22px]"} ${mint ? "text-accent-deep" : "text-ink"}`}>{value}</div>
      {sub && <div className="mt-0.5 truncate text-[11.5px] text-faint">{sub}</div>}
    </div>
  );
}
