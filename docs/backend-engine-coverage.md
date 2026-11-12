# Backend engine: workbook formula coverage

This branch extends the existing TypeScript calculation engine. The Excel workbook remains the calculation specification and parity reference; the application does not depend on Excel at runtime.

## Sheet formula modules

| Workbook sheet | Runtime module | Main formulas / behaviour |
|---|---|---|
| Start Here | `lib/start-here.ts` | All six dashboard status formulas F6:F11: product / private DD / note counts, portfolio lines / value / sleeve and geography status counts, eligibility counts, risk and 12-month scenario text, action / hedge counts, and Ready state |
| Product Master | `lib/product-master.ts` | Level-1 / Level-2 classification, US-situs override, expected return, bond default-loss vs spread-loss deduction, volatility / beta / risk overrides, geography check |
| Private Assets Master | `lib/private-assets.ts` | Target net IRR realisation factor, volatility de-smoothing, beta, DD risk uplift, liquidity class, approximate fee drag, US situs and look-through check |
| Structured Notes | `lib/structured-notes.ts` | Structure/payoff classification, risk-equivalent factor, barrier distance and lognormal breach probability, expected return, risk, issuer credit, factor scores and four scenario payoffs |
| Scenario Engine | `lib/scenario-engine.ts` | Reliability x freshness weighting, 45-day half-life, evidence blend, house-prior blend, weighted disagreement, probability bands, confidence, family weights and Brier calibration |

## Runtime integration

- `data/master-inputs.json` contains the raw master-sheet inputs for 27 public products, 6 private funds and 4 structured notes.
- `lib/master-data.ts` recalculates their model parameters from those raw inputs and the Asset Class Master defaults in `data/subclasses.json`.
- `data/scenario-evidence.json` contains the manually refreshable evidence table and house prior from the workbook. It is intentionally not connected to external market-data providers.
- `app/page.tsx` hydrates the product catalogue and scenario evidence before calling the existing portfolio engine.
- `lib/engine.ts` now uses the evidence-derived scenario probabilities and confidence, and calculates central / pessimistic / optimistic 12-month portfolio projections.
- Start Here is integrated into the portfolio analysis result through `deriveStartHereDashboard`; all six dashboard status strings are calculated from the same live product, portfolio, risk, scenario, action and hedge outputs used by the rest of the engine.

## Existing calculation coverage retained

The existing `lib/engine.ts` continues to calculate Portfolio Builder, Asset Class Master aggregation, factor exposure, Scenarios, Risk & Hedging, Next Best Actions, Monitoring and Client Summary outputs. F1–F7 score inputs remain analyst-maintained workbook inputs; the engine aggregates their scores against portfolio holdings.

## Validation

The test command includes the existing engine / builder / optimiser parity tests and focused tests for each formula module and master-data integration:

```bash
npm test
npm run build
```

Start Here's six outputs are checked against the supplied workbook's saved cached values, including the fixed display strings and edge-case COUNTIF/prefix behaviour.

## Data-source boundary

The scenario evidence is manually refreshable. No automatic market-data feeds, credentials, paid vendor APIs or live-data assumptions have been added. Any provider integration should be a separately reviewed change.
