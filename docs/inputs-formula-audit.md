# Inputs formula audit

- **Formula cells:** 47; cached values: 47; missing caches: 0.
- **Formula regions:** D16 (portfolio invested value), D65 (cash-ladder total), D71:L76 (lower-triangular covariance / correlation matrix references).
- **Runtime:** `lib/engine.ts` consumes the market, limits, correlation matrix and client assumptions in `data/assumptions.json`.

## Formula responsibilities
1. Link invested portfolio value to Portfolio Builder.
2. Sum cash-ladder weights.
3. Mirror the correlation matrix into the lower triangle for covariance calculations.

## Verification gaps
- All 47 saved values are available, but no complete coordinate-by-coordinate parity report is recorded.
- Verify symmetry / orientation of D71:L76, blank and zero cells, and cash ladder sum behaviour.
- Confirm runtime correlation matrix ordering matches the exact Inputs row / column labels and that D16 uses invested value, not client budget.

**Status: existing runtime inputs; formula-level parity pending.**