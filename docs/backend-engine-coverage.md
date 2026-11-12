# Backend engine: workbook formula coverage

This branch extends the existing TypeScript calculation engine. The Excel workbook remains the calculation specification and parity reference; the application does not depend on Excel at runtime.

## New formula modules

| Workbook sheet | Runtime module | Main formulas / behaviour |
|---|---|---|
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

## Existing calculation coverage retained

The existing `lib/engine.ts` continues to calculate Portfolio Builder, Asset Class Master aggregation, factor exposure, Scenarios, Risk & Hedging, Next Best Actions, Monitoring and Client Summary outputs. F1–F7 score inputs remain analyst-maintained workbook inputs; the engine aggregates their scores against portfolio holdings. Start Here is a dashboard/navigation sheet rather than an independent investment calculation.

## Validation

The test command includes the existing engine / builder / optimiser parity tests and new tests for each formula module and master-data integration:

```bash
npm test
npm run build
```

The master-data integration tests compare the derived expected return, volatility, beta, risk rating, structured-note factor scores and scenario payoffs against the workbook-backed product catalogue. The scenario integration test compares final probabilities and confidence against the workbook snapshot.

## Data-source boundary

The scenario evidence is manually refreshable. No automatic market-data feeds, credentials, paid vendor APIs or live-data assumptions have been added. Any provider integration should be a separately reviewed change.
