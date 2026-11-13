// Builder state changes (add / remove / edit / Optimise output), pure so lib/builder.test.ts can replay any sequence.
// Weights are never stored: the engine derives each line's weight as amount / total, so they always sum to 100%.
import type { Client, Line, Product } from "./engine.ts";

type Budget = { amount: number; sleeves: { name: string; target: number }[] };

/** Whether a product can be offered to this client from the Product Master catalogue. */
export function isProductAvailableForClient(product: Product, client: Pick<Client, "accredited" | "amount">): boolean {
  if (product.platform !== "Yes") return false;
  if (product.accreditedOnly === "Yes" && client.accredited !== "Yes") return false;
  const minimumInvestment = client.accredited === "Yes" ? product.minAccredited : product.minNonAccredited;
  return Number.isFinite(minimumInvestment) && minimumInvestment >= 0 && minimumInvestment <= client.amount;
}

// A sleeve's target dollars are split evenly across all products currently selected in that sleeve.
 // The first line receives any whole-dollar rounding remainder.
export function splitSleeve(ls: Line[], sleeve: string, c: Budget): Line[] {
  const n = ls.filter((l) => l.sleeve === sleeve).length;
  if (!n) return ls;
  const target = Math.round((c.sleeves.find((s) => s.name === sleeve)?.target ?? 0) * c.amount);
  const each = Math.floor(target / n);
  let first = true;
  return ls.map((l) => {
    if (l.sleeve !== sleeve) return l;
    const amount = first ? target - each * (n - 1) : each;
    first = false;
    return { ...l, amount };
  });
}

export function addLine(ls: Line[], line: Line, c: Budget, preserveUids: Set<string> = new Set()): Line[] {
  return rebalancePreservingEdits([...ls, line], c, preserveUids);
}

// Keep the portfolio at or below the client's budget even if previously edited sleeves were already over target.
export function capBudget(ls: Line[], budget: number): Line[] {
  const total = ls.reduce((sum, line) => sum + Math.max(0, line.amount), 0);
  if (total <= budget || total <= 0) return ls;
  const scaled = ls.map((line) => ({ ...line, amount: Math.floor(Math.max(0, line.amount) * budget / total) }));
  let remainder = Math.max(0, Math.round(budget - scaled.reduce((sum, line) => sum + line.amount, 0)));
  for (const line of [...scaled].sort((a, b) => b.amount - a.amount)) {
    if (!remainder) break;
    line.amount += 1;
    remainder -= 1;
  }
  return scaled;
}

// Rebalance unedited lines to the sleeve target while preserving advisor-entered amounts.
// Newly added lines should be excluded from preserveUids so they share the remaining sleeve budget.
export function rebalancePreservingEdits(ls: Line[], c: Budget, preserveUids: Set<string> = new Set()): Line[] {
  return capBudget(c.sleeves.reduce((out, sleeve) => {
    const inSleeve = out.filter((line) => line.sleeve === sleeve.name);
    if (!inSleeve.length) return out;
    const target = Math.round((sleeve.target ?? 0) * c.amount);
    const fixed = inSleeve.filter((line) => preserveUids.has(line.uid ?? ""));
    const flexible = inSleeve.filter((line) => !preserveUids.has(line.uid ?? ""));
    if (!flexible.length) return out;
    const fixedTotal = fixed.reduce((sum, line) => sum + Math.max(0, line.amount), 0);
    const remaining = Math.max(0, target - fixedTotal);
    const each = Math.floor(remaining / flexible.length);
    let remainder = remaining - each * flexible.length;
    const flexibleIds = new Set(flexible.map((line) => line.uid));
    return out.map((line) => flexibleIds.has(line.uid)
      ? { ...line, amount: each + (remainder-- > 0 ? 1 : 0) }
      : line);
  }, ls), c.amount);
}

// Legacy equal split retained for explicit full rebuilds and existing tests.
export function rebalanceLines(ls: Line[], c: Budget): Line[] {
  return c.sleeves.reduce((out, sleeve) => splitSleeve(out, sleeve.name, c), ls);
}

export function removeLine(ls: Line[], uid: string, c: Budget, preserveUids: Set<string> = new Set()) {
  const gone = ls.find((l) => l.uid === uid);
  const rest = ls.filter((l) => l.uid !== uid);
  return gone ? rebalancePreservingEdits(rest, c, preserveUids) : rest;
}

export const updateLine = (ls: Line[], uid: string, patch: Partial<Line>) => ls.map((l) => (l.uid === uid ? { ...l, ...patch } : l));

// A line differs from the recommendation when it was added by hand or its amount was changed.
export const isEdited = (l: Line) => l.rec === undefined || l.amount !== l.rec;

// Optimise output -> builder lines in whole dollars. Rounding dollars go to the largest line, so the lines add up to
// the client's amount exactly; each line remembers its recommended amount.
export function linesFromWeights(weights: { id: string; w: number }[], amount: number, sleeveOf: (id: string) => string, uid: () => string): Line[] {
  const ls: Line[] = weights.map(({ id, w }) => {
    const a = Math.round(w * amount);
    return { uid: uid(), id, sleeve: sleeveOf(id), amount: a, rec: a };
  });
  if (!ls.length) return ls;
  const big = ls.reduce((a, b) => (b.amount > a.amount ? b : a));
  big.amount = big.rec = big.amount + amount - ls.reduce((t, l) => t + l.amount, 0);
  return ls;
}

// Drag and drop: only a sleeve drop zone ("s:<sleeve>") accepts a product.
export const sleeveFromDrop = (overId: string | undefined) => (overId?.startsWith("s:") ? overId.slice(2) : null);
