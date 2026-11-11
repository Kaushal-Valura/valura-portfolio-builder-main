// Portfolio optimiser: a port of the optimiser half of the manager's prototype ("Valura Portfolio Builder.html").
// Covariance: Morningstar monthly proxies -> pairwise sample covariance -> PSD repair -> Ledoit-Wolf
// constant-correlation shrinkage -> annualised -> synthetic INR factor -> product covariance S = B F B' + D.
// Returns: Black-Litterman (market-implied prior + house CMAs + advisor views).
// Solver: OSQP-style ADMM on max mu'w - (lambda/2) w'Sw under the lever constraints, lambda bisected to hit the target volatility.
// Pure: no IO, no React. Parity with the prototype is checked by lib/optimiser.test.ts.
import D from "../data/optimiser.json" with { type: "json" };

export type Prod = {
  id: string; name: string; short: string; sleeve: string; cls: string; load: Record<string, number>;
  idio: number; cma: number; ter: number; geo: number[]; inr: number; liq: number; liqStress: number;
  situs: number; yld: number; dur: number; cap: number; kind: string;
  min?: number; minNA?: number; dd?: string; call1?: number; mgmt?: number;
};
const U = D.universe as unknown as Prod[], N = U.length, idx: Record<string, number> = Object.fromEntries(U.map((u, i) => [u.id, i]));
const P = D.proxies, NP = P.length, MARKET = D.market;
const FACTORS = [...P, "INR"], NF = FACTORS.length;
const INR = { vol: 0.05, rhoIndia: 0.5 }; // assumption: rupee annual vol and correlation with MSCI India (USD)
type Mat = Float64Array[];

/* ---------- the levers ---------- */
export type Levers = {
  value: number; horizon: number; returnTarget: number; targetVol: number;
  indiaOn: boolean; india: number; usMax: number; lockedMax: number; privateMax: number; callBuffer: boolean;
  privates: boolean; notes: boolean; ddOnly: boolean; accredited: boolean; situsCap: number; yieldMin: number;
  vIndia: number; vUS: number; vAI: number; vGold: number; viewConf: number; alphaConf: number;
  hedge: number; inrDep: number; irrReal: number;
};
export const DEF_LEVERS: Levers = {
  value: 1000000, horizon: 5, returnTarget: 0.10, targetVol: 0.09,
  indiaOn: true, india: 0.20, usMax: 1, lockedMax: 0.25, privateMax: 0.25, callBuffer: true,
  privates: true, notes: true, ddOnly: true, accredited: true, situsCap: 60000, yieldMin: 0,
  vIndia: 0, vUS: 0, vAI: 0, vGold: 0, viewConf: 0.5, alphaConf: 0.5,
  hedge: 0.5, inrDep: 0.035, irrReal: 0.8,
};
type View = { p: Record<string, number>; tilt: number; conf: number; rel: boolean; name: string };
export type EngineState = Levers & { views: View[]; carry: number; indiaBand: number; minLine: number; notesMax: number; tau: number; houseConf: number; putNotional: number };

export const carry = MARKET.rbiRepo - MARKET.fedFunds;
export function toEngine(st: Levers): EngineState {
  const v: View[] = [], c = st.viewConf;
  if (st.vIndia) v.push({ p: { P011: 1 }, tilt: st.vIndia, conf: c, rel: false, name: "India equities" });
  if (st.vUS) v.push({ p: { P001: 1, P010: -1 }, tilt: st.vUS, conf: c, rel: true, name: "US over developed ex-US" });
  if (st.vAI) v.push({ p: { P013: 1, P001: -1 }, tilt: st.vAI, conf: c, rel: true, name: "Tech & AI over US market" });
  if (st.vGold) v.push({ p: { P007: 1 }, tilt: st.vGold, conf: c, rel: false, name: "Gold" });
  return { ...st, views: v, carry, indiaBand: 0.015, minLine: 0.02, notesMax: 0.15, tau: 0.05, houseConf: 0.5, putNotional: 0 };
}

/* ---------- linear algebra ---------- */
const zeros = (n: number, m: number): Mat => Array.from({ length: n }, () => new Float64Array(m));
function matVec(A: ArrayLike<number>[], x: ArrayLike<number>) { const n = A.length, out = new Float64Array(n); for (let i = 0; i < n; i++) { let s = 0; const r = A[i]; for (let j = 0; j < x.length; j++) s += r[j] * x[j]; out[i] = s; } return out; }
function quad(A: ArrayLike<number>[], x: ArrayLike<number>) { let s = 0; for (let i = 0; i < x.length; i++) { if (!x[i]) continue; let t = 0; const r = A[i]; for (let j = 0; j < x.length; j++) t += r[j] * x[j]; s += x[i] * t; } return s; }
function dot(a: ArrayLike<number>, b: ArrayLike<number>) { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; }
function chol(A: ArrayLike<number>[]) {
  const n = A.length, L = zeros(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) {
    let s = A[i][j]; for (let k = 0; k < j; k++) s -= L[i][k] * L[j][k];
    if (i === j) L[i][i] = Math.sqrt(Math.max(s, 1e-14)); else L[i][j] = s / L[j][j];
  }
  return L;
}
function cholSolve(L: Mat, b: ArrayLike<number>) {
  const n = L.length, y = new Float64Array(n), x = new Float64Array(n);
  for (let i = 0; i < n; i++) { let s = b[i]; for (let k = 0; k < i; k++) s -= L[i][k] * y[k]; y[i] = s / L[i][i]; }
  for (let i = n - 1; i >= 0; i--) { let s = y[i]; for (let k = i + 1; k < n; k++) s -= L[k][i] * x[k]; x[i] = s / L[i][i]; }
  return x;
}
// Jacobi eigen-decomposition of a symmetric matrix -> {vals, vecs (columns)}
function eigSym(S: Mat) {
  const n = S.length, A = S.map((r) => Float64Array.from(r)), V = zeros(n, n);
  for (let i = 0; i < n; i++) V[i][i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += A[i][j] * A[i][j];
    if (off < 1e-22) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(A[p][q]) < 1e-15) continue;
      const th = (A[q][q] - A[p][p]) / (2 * A[p][q]);
      const t = Math.sign(th || 1) / (Math.abs(th) + Math.sqrt(th * th + 1)), c = 1 / Math.sqrt(t * t + 1), s = t * c;
      for (let k = 0; k < n; k++) { const akp = A[k][p], akq = A[k][q]; A[k][p] = c * akp - s * akq; A[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = A[p][k], aqk = A[q][k]; A[p][k] = c * apk - s * aqk; A[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = V[k][p], vkq = V[k][q]; V[k][p] = c * vkp - s * vkq; V[k][q] = s * vkp + c * vkq; }
    }
  }
  return { vals: Array.from({ length: n }, (_, i) => A[i][i]), vecs: V };
}
function psdRepair(S: Mat, floor: number) {
  const { vals, vecs } = eigSym(S), n = S.length, out = zeros(n, n);
  const v = vals.map((x) => Math.max(x, floor));
  for (let i = 0; i < n; i++) for (let j = 0; j <= i; j++) { let s = 0; for (let k = 0; k < n; k++) s += vecs[i][k] * v[k] * vecs[j][k]; out[i][j] = out[j][i] = s; }
  return out;
}

/* ---------- covariance pipeline ---------- */
type Returns = { dates: string[]; r: Record<string, (number | null)[]> };
function proxyMatrix(ret: Returns) {
  const T = ret.dates.length, X = zeros(T, NP), M = Array.from({ length: T }, () => new Uint8Array(NP));
  P.forEach((tk, k) => ret.r[tk].forEach((v, t) => { if (v === null || v === undefined) { X[t][k] = NaN; } else { X[t][k] = v / 100; M[t][k] = 1; } }));
  return { X, M, T };
}
// OLS backfill of short histories on a few long ones (conditional mean), used for the Ledoit-Wolf intensity
function backfill(X: Mat, M: Uint8Array[], T: number) {
  const B = X.map((r) => Float64Array.from(r)), regs = ["VOO", "IEF", "GLD", "DBC"].map((t) => P.indexOf(t));
  for (let k = 0; k < NP; k++) {
    let miss = 0; for (let t = 0; t < T; t++) if (!M[t][k]) miss++;
    if (!miss) continue;
    const rows: number[] = []; for (let t = 0; t < T; t++) if (M[t][k]) rows.push(t);
    const p = regs.length + 1, XtX = zeros(p, p), Xty = new Float64Array(p);
    rows.forEach((t) => { const z = [1, ...regs.map((j) => X[t][j])]; for (let a = 0; a < p; a++) { Xty[a] += z[a] * X[t][k]; for (let b = 0; b < p; b++) XtX[a][b] += z[a] * z[b]; } });
    const beta = cholSolve(chol(XtX), Xty);
    for (let t = 0; t < T; t++) if (!M[t][k]) { const z = [1, ...regs.map((j) => X[t][j])]; B[t][k] = dot(z, beta); }
  }
  return B;
}
function pairwiseCov(X: Mat, M: Uint8Array[], T: number) {
  const S = zeros(NP, NP), rows = Array.from({ length: T }, (_, t) => t);
  for (let i = 0; i < NP; i++) for (let j = 0; j <= i; j++) {
    let n = 0, mi = 0, mj = 0;
    for (const t of rows) if (M[t][i] && M[t][j]) { n++; mi += X[t][i]; mj += X[t][j]; }
    mi /= n; mj /= n; let s = 0;
    for (const t of rows) if (M[t][i] && M[t][j]) s += (X[t][i] - mi) * (X[t][j] - mj);
    S[i][j] = S[j][i] = s / (n - 1);
  }
  return S;
}
// Ledoit & Wolf (2004) optimal shrinkage intensity toward the constant-correlation target
function ledoitWolf(Y0: Mat) {
  const T = Y0.length, N = Y0[0].length, mean = new Float64Array(N);
  Y0.forEach((r) => r.forEach((v, k) => (mean[k] += v / T)));
  const Y = Y0.map((r) => r.map((v, k) => v - mean[k])), S = zeros(N, N);
  Y.forEach((r) => { for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) S[i][j] += r[i] * r[j] / T; });
  const s = Array.from({ length: N }, (_, i) => Math.sqrt(S[i][i]));
  let rbar = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) rbar += S[i][j] / (s[i] * s[j]);
  rbar /= N * (N - 1);
  let pi = 0, rho = 0, gamma = 0; const piM = zeros(N, N), th = zeros(N, N);
  Y.forEach((r) => { for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { piM[i][j] += r[i] * r[i] * r[j] * r[j] / T; th[i][j] += r[i] * r[i] * r[i] * r[j] / T; } });
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { piM[i][j] -= S[i][j] * S[i][j]; th[i][j] -= S[i][i] * S[i][j]; pi += piM[i][j]; }
  for (let i = 0; i < N; i++) rho += piM[i][i];
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) rho += rbar / 2 * (Math.sqrt(S[j][j] / S[i][i]) * th[i][j] + Math.sqrt(S[i][i] / S[j][j]) * th[j][i]);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) { const f = i === j ? S[i][i] : rbar * s[i] * s[j]; gamma += (f - S[i][j]) ** 2; }
  const kappa = (pi - rho) / gamma;
  return { delta: Math.max(0, Math.min(1, kappa / T)), rbar };
}
function shrinkTo(S: Mat, delta: number) {
  const N = S.length, s = Array.from({ length: N }, (_, i) => Math.sqrt(S[i][i])), out = zeros(N, N);
  let rbar = 0; for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j) rbar += S[i][j] / (s[i] * s[j]);
  rbar /= N * (N - 1);
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) out[i][j] = (1 - delta) * S[i][j] + delta * (i === j ? S[i][i] : rbar * s[i] * s[j]);
  return out;
}
// Append the rupee factor: fx = b*INDA + e, b = rho*sigma_fx/sigma_India -> Cov(fx,k) = b*Cov(INDA,k)
function withInr(F: Mat) {
  const n = F.length, iI = P.indexOf("INDA"), out = zeros(n + 1, n + 1);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) out[i][j] = F[i][j];
  const sI = Math.sqrt(F[iI][iI]), b = INR.rhoIndia * INR.vol / sI;
  for (let k = 0; k < n; k++) out[n][k] = out[k][n] = b * F[iI][k];
  out[n][n] = INR.vol * INR.vol;
  return out;
}
// Factor covariance, annualised. Built once: it depends only on the return history.
let factorCov: Mat | null = null;
function model() {
  if (factorCov) return factorCov;
  const { X, M, T } = proxyMatrix(D.returns as Returns);
  const lw = ledoitWolf(backfill(X, M, T));
  const Sm = shrinkTo(psdRepair(pairwiseCov(X, M, T), 1e-7), lw.delta);
  return (factorCov = withInr(Sm.map((r) => r.map((v) => v * 12))));
}

/* ---------- product layer ---------- */
function loadings(hedge: number) {
  const B = zeros(N, NF);
  U.forEach((u, i) => { for (const k in u.load) B[i][FACTORS.indexOf(k)] = u.load[k]; B[i][NF - 1] -= (hedge || 0) * u.inr; });
  return B;
}
function productCov(F: Mat, B: Mat) {
  const BF = B.map((r) => matVec(F, r)), S = zeros(N, N);
  for (let i = 0; i < N; i++) for (let j = 0; j <= i; j++) { S[i][j] = S[j][i] = dot(BF[i], B[j]); }
  U.forEach((u, i) => (S[i][i] += u.idio * u.idio));
  return S;
}
function vecOf(obj: Record<string, number>) { const w = new Float64Array(N); for (const k in obj) w[idx[k]] = obj[k]; return w; }

/* ---------- expected returns: Black-Litterman ---------- */
// cma net of fund costs; the INR hedge changes USD return by h*inr*(expected depreciation - forward carry)
function netCma(a: EngineState) {
  return U.map((u) => u.cma - (u.ter || 0) + (a.hedge || 0) * u.inr * (a.inrDep - a.carry) + (u.kind === "aif" ? (a.irrReal - 0.8) / 0.8 * u.cma : 0));
}
const MARKET_KIND: Record<string, 1> = { index: 1, cash: 1 };
function blackLitterman(S: Mat, a: EngineState, views: View[]) {
  const rf = MARKET.rf, tau = a.tau, c = a.houseConf;
  const wm = vecOf(D.mkt), q0 = netCma(a);
  const mktEx = dot(wm, q0) - rf, mktVar = quad(S, wm), delta = mktEx / mktVar;
  const Sw = matVec(S, wm), Pi = Array.from(Sw, (v) => delta * v);
  // House views sit on the market building blocks only. A manager's or issuer's claimed edge is idiosyncratic,
  // so it must not leak into correlated public markets through S; it is credited separately as alpha below.
  const rows: Float64Array[] = [], q: number[] = [], om: number[] = [];
  U.forEach((u, i) => { if (!MARKET_KIND[u.kind]) return; const p = new Float64Array(N); p[i] = 1; rows.push(p); q.push(q0[i] - rf); om.push((1 - c) / c * tau * S[i][i]); });
  (views || []).forEach((v) => {
    const p = new Float64Array(N); for (const k in v.p) p[idx[k]] = v.p[k];
    const pS = quad(S, p);
    // magnitude is relative to the house view: q = house-implied p.q0 (excess) + tilt
    let base = 0; for (const k in v.p) base += v.p[k] * (q0[idx[k]] - (v.rel ? 0 : rf));
    rows.push(p); q.push(base + v.tilt); om.push((1 - v.conf) / v.conf * tau * pS);
  });
  const k = rows.length, tS = S.map((r) => r.map((v) => v * tau));
  const PtS = rows.map((p) => matVec(tS, p));
  const Mx = zeros(k, k); for (let i = 0; i < k; i++) for (let j = 0; j <= i; j++) { Mx[i][j] = Mx[j][i] = dot(PtS[i], rows[j]) + (i === j ? om[i] : 0); }
  const resid = rows.map((p, i) => q[i] - dot(p, Pi));
  const aV = cholSolve(chol(Mx), resid);
  const mu = Float64Array.from(Pi);
  for (let r = 0; r < k; r++) for (let i = 0; i < N; i++) mu[i] += PtS[r][i] * aV[r];
  const beta = Array.from(mu, (v) => v + rf), alpha = U.map((u, i) => (MARKET_KIND[u.kind] ? 0 : a.alphaConf * (q0[i] - beta[i])));
  return beta.map((v, i) => v + alpha[i]);
}

/* ---------- QP: OSQP-style ADMM ---------- */
type Solve = { x: Float64Array; z: Float64Array; y: Float64Array; it: number; rp: number; rd: number };
function admm(Pm: Mat, qv: number[], A: Float64Array[], l: number[], u: number[], warm?: Solve | null, maxIt?: number): Solve {
  const n = qv.length, m = A.length, sigma = 1e-6, alpha = 1.6, rho0 = 0.4;
  const rho = l.map((lo, j) => (Math.abs(u[j] - lo) < 1e-12 ? rho0 * 1e3 : rho0));
  const K = zeros(n, n);
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) K[i][j] = Pm[i][j] + (i === j ? sigma : 0);
  for (let r = 0; r < m; r++) { const a = A[r], rr = rho[r]; for (let i = 0; i < n; i++) if (a[i]) for (let j = 0; j < n; j++) if (a[j]) K[i][j] += rr * a[i] * a[j]; }
  const Lk = chol(K);
  const x = warm && warm.x ? Float64Array.from(warm.x) : new Float64Array(n).fill(1 / n);
  const z = warm && warm.z && warm.z.length === m ? Float64Array.from(warm.z) : matVec(A, x);
  const y = warm && warm.y && warm.y.length === m ? Float64Array.from(warm.y) : new Float64Array(m);
  const rhs = new Float64Array(n); let it = 0, rp = 1, rd = 1;
  for (it = 0; it < (maxIt || 6000); it++) {
    for (let i = 0; i < n; i++) rhs[i] = sigma * x[i] - qv[i];
    for (let r = 0; r < m; r++) { const c = rho[r] * z[r] - y[r], a = A[r]; for (let i = 0; i < n; i++) if (a[i]) rhs[i] += a[i] * c; }
    const xt = cholSolve(Lk, rhs), zt = matVec(A, xt);
    for (let i = 0; i < n; i++) x[i] = alpha * xt[i] + (1 - alpha) * x[i];
    for (let r = 0; r < m; r++) {
      const zr = alpha * zt[r] + (1 - alpha) * z[r];
      const zn = Math.min(u[r], Math.max(l[r], zr + y[r] / rho[r]));
      y[r] += rho[r] * (zr - zn); z[r] = zn;
    }
    if (it % 15 === 14) {
      const Ax = matVec(A, x); rp = 0; for (let r = 0; r < m; r++) rp = Math.max(rp, Math.abs(Ax[r] - z[r]));
      const Px = matVec(Pm, x); rd = 0;
      for (let i = 0; i < n; i++) { let s = Px[i] + qv[i]; for (let r = 0; r < m; r++) s += A[r][i] * y[r]; rd = Math.max(rd, Math.abs(s)); }
      if (rp < 2e-7 && rd < 2e-7) break;
    }
  }
  return { x, z, y, it, rp, rd };
}

/* ---------- constraint builder (the levers) ---------- */
type Elig = { ok: false; why: string } | { ok: true; min: number };
export function eligibility(s: EngineState): Elig[] {
  const V = s.value;
  return U.map((u): Elig => {
    if (u.sleeve === "pm" && !s.privates) return { ok: false, why: "Private markets switched off" };
    if (u.sleeve === "sp" && !s.notes) return { ok: false, why: "Structured notes switched off" };
    if (u.kind === "aif" && s.ddOnly && u.dd !== "Approved") return { ok: false, why: "Due diligence still in review" };
    if (u.situs && s.situsCap <= 0) return { ok: false, why: "US-situs line (estate tax)" };
    const minT = u.kind === "aif" && !s.accredited ? u.minNA! : (u.min || 0);
    if (minT / V > u.cap + 1e-9) return { ok: false, why: `Minimum ticket $${(minT / 1000).toFixed(0)}k is above the line cap` };
    return { ok: true, min: Math.max(s.minLine, minT / V) };
  });
}
type Cons = { A: Float64Array[]; l: number[]; u: number[]; tags: string[] };
function constraints(s: EngineState, elig: Elig[], fixedZero: Uint8Array): Cons {
  const A: Float64Array[] = [], l: number[] = [], u: number[] = [], tags: string[] = [];
  const add = (row: Float64Array, lo: number, hi: number, tag: string) => { A.push(row); l.push(lo); u.push(hi); tags.push(tag); };
  add(Float64Array.from(U.map(() => 1)), 1, 1, "budget");
  U.forEach((p, i) => { const r = new Float64Array(N); r[i] = 1; add(r, 0, elig[i].ok && !fixedZero[i] ? p.cap : 0, "box:" + p.id); });
  if (s.indiaOn) add(Float64Array.from(U.map((p) => p.geo[1])), Math.max(0, s.india - s.indiaBand), s.india + s.indiaBand, "india");
  if (s.usMax < 1) add(Float64Array.from(U.map((p) => p.geo[0])), 0, s.usMax, "us");
  add(Float64Array.from(U.map((p) => (p.liq > 31 ? 1 : 0))), 0, s.lockedMax, "locked");
  add(Float64Array.from(U.map((p) => p.situs)), 0, Math.max(0, s.situsCap) / s.value, "situs");
  if (s.yieldMin > 0) add(Float64Array.from(U.map((p) => p.yld)), s.yieldMin, 1, "income");
  if (s.callBuffer) add(Float64Array.from(U.map((p) => (p.id === "P017" ? 1 : 0) - (p.call1 || 0))), 0, 1, "calls");
  add(Float64Array.from(U.map((p) => (p.kind === "note" ? 1 : 0))), 0, s.notesMax, "notes");
  add(Float64Array.from(U.map((p) => (p.sleeve === "pm" ? 1 : 0))), 0, s.privateMax, "private");
  return { A, l, u, tags };
}

/* ---------- optimiser ---------- */
const vol = (S: Mat, w: ArrayLike<number>) => Math.sqrt(Math.max(quad(S, w), 0));
function targetSearch(S: Mat, mu: number[], C: Cons, target: number, warm0?: Solve | null) {
  let lo = Math.log(0.25), hi = Math.log(400), best = null as null | { r: Solve; s: number; lam: number }, warm = warm0;
  const at = (lg: number) => { const r = admm(S.map((row) => row.map((v) => v * Math.exp(lg))), mu.map((v) => -v), C.A, C.l, C.u, warm); warm = r; return { r, s: vol(S, r.x), lam: Math.exp(lg) }; };
  const top = at(lo); if (top.s <= target) return top;
  const bot = at(hi); if (bot.s >= target) return bot;
  for (let i = 0; i < 28; i++) {
    const mid = (lo + hi) / 2, m = at(mid); best = m;
    if (Math.abs(m.s - target) < 2e-5) break;
    if (m.s > target) lo = mid; else hi = mid;
  }
  return best!;
}
// largest-remainder rounding to `step`, respecting the box caps
function cleanRound(w: Float64Array, C: Cons, step: number) {
  const n = w.length, units = Math.round(1 / step), base = new Int32Array(n), rem: [number, number][] = [];
  let used = 0;
  for (let i = 0; i < n; i++) { const v = Math.max(0, w[i]) / step; base[i] = Math.floor(v + 1e-9); used += base[i]; rem.push([v - base[i], i]); }
  rem.sort((a, b) => b[0] - a[0]);
  for (let k = 0; used < units && k < rem.length; k++) { const i = rem[k][1]; if (w[i] > 1e-4 && (base[i] + 1) * step <= C.u[1 + i] + 1e-9) { base[i]++; used++; } }
  for (let k = 0; used > units && k < rem.length; k++) { const i = rem[rem.length - 1 - k][1]; if (base[i] > 0) { base[i]--; used--; } }
  return Float64Array.from(base, (b) => b * step);
}
// rounding can push a group limit (cash for calls, locked share) over its bound by one step: move 0.5% to fix it
function repair(w: Float64Array, C: Cons, step: number) {
  const n = w.length;
  for (let guard = 0; guard < 40; guard++) {
    let fixed = true;
    for (let j = 1 + n; j < C.A.length; j++) {
      const a = C.A[j], v = dot(a, w);
      if (v <= C.u[j] + 1e-9 && v >= C.l[j] - 1e-9) continue;
      fixed = false; const sg = v < C.l[j] ? 1 : -1; // +1: raise Aw, -1: lower it
      let take = -1, give = -1, tv = -Infinity, gv = -Infinity;
      for (let i = 0; i < n; i++) {
        if (C.u[1 + i] - w[i] >= step - 1e-9) { const sc = sg * a[i] + (w[i] > 0 ? 1e-3 + w[i] * 1e-3 : 0); if (sc > tv) { tv = sc; take = i; } }
        if (w[i] - step >= 0.02 - 1e-9) { const sc = -sg * a[i] + w[i] * 1e-3; if (sc > gv) { gv = sc; give = i; } }
      }
      if (take < 0 || give < 0 || take === give || sg * (a[take] - a[give]) <= 0) return w;
      w[give] -= step; w[take] += step;
    }
    if (fixed) break;
  }
  return w;
}
export function optimise(s: EngineState) {
  const S = productCov(model(), loadings(s.hedge));
  const mu = blackLitterman(S, s, s.views);
  const elig = eligibility(s), fixedZero = new Uint8Array(N);
  let C = constraints(s, elig, fixedZero), res = targetSearch(S, mu, C, s.targetVol);
  // minimum-position clean-up: drop lines below their minimum and re-solve (<= 4 passes)
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    res.r.x.forEach((v, i) => { const e = elig[i]; if (!fixedZero[i] && v > 1e-6 && e.ok && v < e.min - 1e-6) { fixedZero[i] = 1; changed = true; } });
    if (!changed) break;
    C = constraints(s, elig, fixedZero); res = targetSearch(S, mu, C, s.targetVol, res.r);
  }
  const raw = Float64Array.from(res.r.x, (v) => (v < 1e-5 ? 0 : v));
  const w = repair(cleanRound(raw, C, 0.005), C, 0.005);
  return { w, raw, er: dot(w, mu), sd: vol(S, w) };
}

// The recommendation as {product id: weight}, plus the optimiser's own view of it.
export function recommend(st: Levers) {
  const t0 = performance.now(), o = optimise(toEngine(st));
  const weights = U.map((u, i) => ({ id: u.id, w: o.w[i] })).filter((x) => x.w > 0);
  return { weights, er: o.er, sd: o.sd, ms: performance.now() - t0 };
}
