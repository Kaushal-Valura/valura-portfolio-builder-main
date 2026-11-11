// Parity check: our optimiser must give the manager's prototype weights for the same levers.
// The reference is his original JS, loaded straight from "Valura Portfolio Builder.html".
// Run: node --test lib/optimiser.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { DEF_LEVERS, optimise, toEngine, type Levers } from "./optimiser.ts";

// The prototype is kept out of the team repo, so these tests skip when it is absent.
const protoPath = new URL("../Valura Portfolio Builder.html", import.meta.url);
const skip = !fs.existsSync(protoPath) && "prototype HTML not present";
const ctx: { window: any } = { window: {} };
let ref: any, refModel: any;
if (!skip) {
  const html = fs.readFileSync(protoPath, "utf8");
  ctx.window.window = ctx.window;
  vm.createContext(ctx);
  [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/g)].map((m) => m[1])
    .filter((s) => /VPB_RETURNS\s*=|VPB_DATA\s*=|G\.VPB\s*=/.test(s)).forEach((s) => vm.runInContext(s, ctx));
  ref = ctx.window.VPB; refModel = ref.buildModel(ctx.window.VPB_RETURNS);
}

const CASES: [string, Partial<Levers>][] = [
  ["defaults", {}],
  ["less risk", { targetVol: 0.05 }],
  ["more growth", { targetVol: 0.13 }],
  ["no privates or notes", { privates: false, notes: false }],
  ["non-accredited, no US estate risk", { accredited: false, situsCap: 0 }],
  ["income first", { yieldMin: 0.045, lockedMax: 0.05, privateMax: 0.05 }],
  ["AI worry + views", { vAI: -0.03, vGold: 0.02, vIndia: 0.01, vUS: -0.01, viewConf: 0.6, alphaConf: 0.2 }],
  ["more India, US capped, full hedge", { india: 0.35, usMax: 0.5, hedge: 1, inrDep: 0.05, value: 400000 }],
];

for (const [name, patch] of CASES) {
  test(`optimiser matches the manager's prototype: ${name}`, { skip }, () => {
    const es = toEngine({ ...DEF_LEVERS, ...patch });
    const want = ref.optimise(refModel, es);
    const got = optimise(es);
    got.raw.forEach((x, i) => assert.ok(Math.abs(x - want.raw[i]) < 1e-9, `raw[${i}] ${x} vs ${want.raw[i]}`));
    assert.deepEqual(Array.from(got.w), Array.from(want.w));
    assert.ok(Math.abs(got.w.reduce((a, b) => a + b, 0) - 1) < 1e-9, "weights add up to 100%");
  });
}
