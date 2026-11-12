// Builder interactions: every add / remove / edit / Optimise must leave the engine's numbers equal to building the same
// final portfolio from scratch, with weights summing to 100% and nothing stale left behind.
// Run: node --test lib/builder.test.ts (or npm test)
import { test } from "node:test";
import assert from "node:assert/strict";
import { analyse, defaultClient, type Data, type Line } from "./engine.ts";
import { addLine, capBudget, isEdited, linesFromWeights, rebalanceLines, rebalancePreservingEdits, removeLine, sleeveFromDrop, updateLine } from "./builder.ts";
import { DEF_LEVERS, recommend } from "./optimiser.ts";
import products from "../data/products.json" with { type: "json" };
import subclasses from "../data/subclasses.json" with { type: "json" };
import assumptions from "../data/assumptions.json" with { type: "json" };

const data = { products, subclasses, assumptions } as unknown as Data;
const client = defaultClient(data.assumptions); // $1m, sleeves 10/50/10/10/20
const [EQ, BD, DV, AL, PR] = client.sleeves.map((s) => s.name);
let n = 0;
const uid = () => `u${++n}`;
const line = (id: string, sleeve: string): Line => ({ uid: uid(), id, sleeve, amount: 0 });
const amounts = (ls: Line[]) => ls.map((l) => [l.id, l.sleeve, l.amount]);
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

// the invariants every state must satisfy
function check(ls: Line[], msg = "") {
  const r = analyse({ ...client, amount: sum(ls.map((l) => l.amount)) || client.amount }, ls, data);
  const V = sum(ls.map((l) => l.amount));
  assert.equal(r.value, V, `${msg} value`);
  assert.deepEqual(r.lines.map((l) => l.uid), ls.map((l) => l.uid), `${msg} engine lines = builder lines`);
  if (V) {
    assert.ok(Math.abs(sum(r.lines.map((l) => l.weight)) - 1) < 1e-12, `${msg} weights sum to 100%`);
    r.lines.forEach((l, i) => assert.equal(l.weight, ls[i].amount / V, `${msg} weight = amount / total`));
    assert.ok(Math.abs(sum(r.subs.map((s) => s.amount)) - V) < 1e-6, `${msg} sub-classes add up`);
    r.mandate.forEach((m) => assert.equal(m.actual, sum(ls.filter((l) => l.sleeve === m.name).map((l) => l.amount)), `${msg} sleeve ${m.name}`));
  } else assert.ok(r.lines.every((l) => l.weight === 0), `${msg} no weight without money`);
  assert.ok(!JSON.stringify(r, (_, v) => (typeof v === "number" && !Number.isFinite(v) ? "NOT-FINITE" : v)).includes("NOT-FINITE"), `${msg} no NaN / Infinity`);
  return r;
}

test("add A, add B, remove A equals just adding B (same sleeve, other sleeves, recommended sleeve)", () => {
  const base = linesFromWeights([{ id: "P001", w: 0.5 }, { id: "P004", w: 0.5 }], 1e6, (id) => (id === "P001" ? EQ : BD), uid);
  for (const [sa, sb, start] of [[DV, DV, []], [DV, AL, []], [EQ, EQ, base], [PR, EQ, base]] as [string, string, Line[]][]) {
    const a = line("P007", sa), b = line("P022", sb);
    let s = addLine(start, a, client);
    s = addLine(s, b, client);
    s = removeLine(s, a.uid!, client);
    const direct = addLine(start, { ...b }, client);
    assert.deepEqual(amounts(s), amounts(direct), `${sa} / ${sb}`);
    check(s);
  }
});

test("any add / remove sequence gives the same numbers as building the final portfolio from scratch", () => {
  const ids = data.products.map((p) => p.id), sleeves = client.sleeves.map((s) => s.name);
  let seed = 42;
  const rnd = (k: number) => ((seed = (seed * 16807) % 2147483647) % k);
  const rec = linesFromWeights(recommend(DEF_LEVERS).weights, client.amount, () => sleeves[rnd(5)], uid);
  let s = rec;
  for (let step = 0; step < 300; step++) {
    if (s.length && rnd(3) === 0) s = removeLine(s, s[rnd(s.length)].uid!, client);
    else s = addLine(s, line(ids[rnd(ids.length)], sleeves[rnd(5)]), client);
    check(s, `step ${step}`);
  }
  // from scratch: the surviving recommended lines, then the surviving hand-added lines in the order they were added
  let scratch = rec.filter((l) => s.some((x) => x.uid === l.uid));
  for (const l of s.filter((x) => x.rec === undefined)) scratch = addLine(scratch, { ...l, amount: 0 }, client);
  assert.deepEqual(amounts(s), amounts(scratch));
  assert.equal(JSON.stringify(analyse(client, s, data)), JSON.stringify(analyse(client, scratch, data)), "engine output identical");
});

test("removed lines leave nothing behind, and removing then re-adding restores the numbers", () => {
  const a = line("P007", DV), b = line("P022", DV);
  const one = addLine([], a, client), two = addLine(one, b, client);
  const back = addLine(removeLine(two, b.uid!, client), { ...b }, client);
  assert.deepEqual(amounts(back), amounts(two), "re-adding restores the split");
  const r = check(removeLine(two, b.uid!, client));
  assert.ok(!r.lines.some((l) => l.id === "P022"), "gone from lines");
  assert.equal(r.subs.find((s) => s.code === "HF-MAC")!.amount, 0, "gone from its sub-class");
  assert.equal(r.riskLimits[5].actual, 0, "gone from the US-situs total");
  assert.deepEqual(amounts(removeLine(one, a.uid!, client)), [], "removing the last line empties the builder");
  const empty = check([]);
  assert.equal(empty.value, 0);
  assert.equal(empty.counts.lines, 0);
});

test("duplicates, 0% and 100% weights, and invalid drops", () => {
  const d = addLine(addLine([], line("P001", EQ), client), line("P001", EQ), client);
  assert.deepEqual(d.map((l) => l.amount), [50000, 50000], "a duplicate is its own line; the sleeve splits evenly");
  check(d);
  const zero = updateLine(d, d[0].uid!, { amount: 0 });
  const r = check(zero);
  assert.deepEqual(r.lines.map((l) => l.weight), [0, 1], "0% line keeps 0 weight; the other is 100%");
  assert.equal(sleeveFromDrop(undefined), null);
  assert.equal(sleeveFromDrop("p:P001"), null);
  assert.equal(sleeveFromDrop(`s:${EQ}`), EQ);
});

test("rapid repeated edits: the last value wins and nothing is stale", () => {
  let s = addLine(addLine([], line("P001", EQ), client), line("P004", BD), client);
  for (let i = 1; i <= 1000; i++) s = updateLine(s, s[0].uid!, { amount: i * 137 });
  assert.equal(s[0].amount, 137000);
  const r = check(s);
  assert.equal(JSON.stringify(r), JSON.stringify(analyse({ ...client, amount: sum(s.map((l) => l.amount)) }, s.map((l) => ({ ...l })), data)));
});

test("Optimise fills the builder to the dollar, tagged as recommended, with the mandate on target", () => {
  for (const levers of [DEF_LEVERS, { ...DEF_LEVERS, targetVol: 0.05 }]) {
    const amount = 1_000_000.5; // cents must not mark lines as edited
    const ls = linesFromWeights(recommend(levers).weights, amount, (id) => (id.startsWith("A") ? PR : id.startsWith("S") ? BD : EQ), uid);
    assert.equal(sum(ls.map((l) => l.amount)), amount, "adds up to the amount exactly");
    assert.ok(!ls.some(isEdited), "every line reads Recommended");
    const c = { ...client, amount };
    const a = analyse(c, ls, data);
    const tuned = { ...c, sleeves: a.mandate.map((m) => ({ name: m.name, target: m.actualPct })) }; // what Optimise writes back
    assert.ok(analyse(tuned, ls, data).mandate.every((m) => m.status === "On target"));
    check(ls);
  }
  assert.deepEqual(linesFromWeights([], 1e6, () => EQ, uid), [], "no weights: an empty builder, not a crash");
  assert.ok(isEdited({ id: "P001", sleeve: EQ, amount: 5, rec: 4 }) && isEdited({ id: "P001", sleeve: EQ, amount: 5 }));
});

test("manual sleeve selections split equally and rebalance after sleeve removal", () => {
  const custom = { ...client, sleeves: client.sleeves.map((s) => ({ ...s, target: s.name === EQ ? 0.2 : s.name === BD ? 0.8 : 0 })) };
  let selected = addLine([], line("P001", EQ), custom);
  assert.equal(selected[0].amount, 200000);
  selected = addLine(selected, line("P009", EQ), custom);
  assert.deepEqual(selected.map((l) => l.amount), [100000, 100000]);

  const afterRemove = removeLine(selected, selected[0].uid!, custom);
  assert.equal(afterRemove[0].amount, 200000, "remaining product takes the full sleeve target");
  const redistributed = { ...custom, sleeves: custom.sleeves.map((s) => ({ ...s, target: s.name === BD ? 1 : 0 })) };
  const rebuilt = rebalanceLines(afterRemove, redistributed);
  assert.equal(rebuilt[0].amount, 0, "inactive sleeves carry no allocation");
});

test("manual allocation never exceeds the client's investment budget", () => {
  const capped = capBudget([
    { id: "P001", sleeve: EQ, amount: 700000 },
    { id: "P004", sleeve: BD, amount: 600000 },
  ], 1000000);
  assert.equal(sum(capped.map((l) => l.amount)), 1000000);
});


test("preserve advisor-edited holdings when a new product is added to the sleeve", () => {
  const custom = { ...client, amount: 1_000_000, sleeves: client.sleeves.map((s) => ({ ...s, target: s.name === EQ ? 0.2 : s.name === BD ? 0.8 : 0 })) };
  const edited: Line = { ...line("P001", EQ), amount: 150_000, rec: 100_000 };
  const flexible: Line = { ...line("P010", EQ), amount: 100_000, rec: 100_000 };
  const added: Line = line("P011", EQ);
  const out = rebalancePreservingEdits([edited, flexible, added], custom, new Set([edited.uid!]));
  assert.equal(out.find((x) => x.uid === edited.uid)!.amount, 150_000, "manual amount is preserved");
  assert.equal(out.find((x) => x.uid === flexible.uid)!.amount, 25_000, "flexible line absorbs remainder");
  assert.equal(out.find((x) => x.uid === added.uid)!.amount, 25_000, "new line shares remainder equally");
  assert.ok(sum(out.map((x) => x.amount)) <= custom.amount, "budget remains respected");
});

test("mandate actual percentages use invested portfolio value when partly unallocated", () => {
  const partial = { ...client, amount: 1_000_000 };
  const holdings: Line[] = [{ uid: uid(), id: "P001", sleeve: EQ, amount: 100_000 }];
  const r = analyse(partial, holdings, data);
  assert.equal(r.mandate.find((m) => m.name === EQ)!.actualPct, 1);
  assert.equal(r.geography.reduce((sum, g) => sum + g.actualPct, 0), 1);
});
