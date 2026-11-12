# Risk & Hedging formula audit

- **Formula cells:** 1,492; cached values: 1,492; missing caches: 0.
- **Formula regions:** C6:C13 portfolio risk / return metrics; F28:AM60 covariance matrix (37×37 with formula cells); D/E row outputs; remaining C-column summary and risk-limit formulas.
- **Runtime:** `lib/engine.ts` risk, covariance, scenario, hedge and risk-limit calculations.

## Formula responsibilities
- Weighted expected return, INR-adjusted return, covariance volatility, beta, return bands and downside.
- Asset-class / subclass covariance and contribution decomposition.
- Portfolio scenario outcomes, factor exposures, risk-limit actuals / status.
- Hedge triggers, notional, cost and scenario benefits.

## Verification gaps
- All 1,492 cached values exist; the existing engine test checks selected aggregate outputs, line risk shares, covariance volatility and risk-limit outputs, not every formula coordinate.
- Build full matrix parity for all F28:AM60 cells and D/E outputs.
- Test zero and negative holdings, empty portfolio, missing correlations, diagonal covariance, negative beta, risk limit equality, and hedge threshold equality.
- Ensure covariance symmetry and row/column ordering follow the worksheet's asset-class ordering.

**Status: broad runtime coverage; full sheet parity not yet evidenced.**