# Workbook-to-application audit (22 worksheets)

## Audit scope and limitation

This audit now uses the workbook uploaded on 12 Nov 2026 (`Valura_Report_REDACTED 21102026_Karmesh(1).xlsx`). Independent workbook scan confirms 22 worksheets and 11,866 formula cells. This document is an implementation/mapping inventory, not yet a cell-by-cell parity sign-off: each formula cell still needs a traceable application mapping and an automated expected-vs-actual comparison. Do not interpret "implemented" as formula parity or investment-team sign-off.

## Production verification

Latest PR workflow run: `43166560818` (commit `ad57b173c67ba508150de5c83402f4a1d86a75f5`).

- `npm test`: 70 tests; 62 passed, 0 failed, 8 skipped.
- `npm run build`: passed. Next.js compiled, lint/type validation passed, page data collected and static pages generated.
- This verifies the PR branch in GitHub Actions, not a live deployment or production data connection.

## Formula inventory from the uploaded workbook

| # | Worksheet | Formula cells |
|---:|---|---:|
| 1 | Start Here | 6 |
| 2 | Portfolio Builder | 2,321 |
| 3 | Monitoring | 22 |
| 4 | Client Summary | 1,904 |
| 5 | Next Best Actions | 794 |
| 6 | Scenario Engine | 197 |
| 7 | Scenarios | 444 |
| 8 | Product Master | 640 |
| 9 | Asset Class Master | 671 |
| 10 | Private Assets Master | 400 |
| 11 | Structured Notes | 990 |
| 12 | Inputs | 47 |
| 13 | Risk & Hedging | 1,492 |
| 14 | F1 Rates | 253 |
| 15 | F2 Inflation | 253 |
| 16 | F3 Growth & AI | 261 |
| 17 | F4 Oil & Geopolitics | 253 |
| 18 | F5 Currency | 262 |
| 19 | F6 Valuation | 253 |
| 20 | F7 Credit & Fiscal | 253 |
| 21 | Sources | 0 |
| 22 | Lists | 150 |
| | **Total** | **11,866** |

The workbook contains 11,866 formula cells, but a formula count is not proof of parity. Some formulas intentionally return blank for unused rows; cached formula results are therefore not sufficient as the sole expected-value oracle. The audit harness must distinguish active rows, blank-by-design rows and genuine formula errors.

## Worksheet audit

| # | Workbook worksheet | Application / backend mapping | Audit result | Remaining validation / gap |
|---:|---|---|---|---|
| 1 | Start Here | Application journey/navigation in `app/page.tsx` | UI equivalent | Workbook dashboard/status cells are not separately modelled; confirm whether they are required in product UI. |
| 2 | Portfolio Builder | `lib/engine.ts`, `lib/builder.ts`, `components/Builder.tsx`, `app/page.tsx` | Implemented | Run browser-level workflow tests for client setup, optimise, manual edit, add/remove and rebalance. |
| 3 | Monitoring | Monitoring calculations in `lib/engine.ts`; display in `components/Analysis.tsx` | Implemented | Verify all threshold boundary cases and alert wording against current workbook values. |
| 4 | Client Summary | Summary/report sections in `components/Analysis.tsx` | UI and calculation mapping present | Confirm all 11 report sections, print/PDF output and every workbook label/value against the source file. |
| 5 | Next Best Actions | Holding flags, priority and action logic in `lib/engine.ts`; display in Analysis | Implemented | Validate each action trigger, priority tie-break and recommendation wording against workbook. |
| 6 | Scenario Engine | `lib/scenario-engine.ts`, `data/scenario-evidence.json` | Implemented | Evidence is manually refreshed; confirm signal sources, dates and scoring assumptions with investment team. |
| 7 | Scenarios | Scenario probability/return calculations in `lib/engine.ts`; scenario engine integration | Implemented | Reconcile all scenario rows, overrides, probability bands and portfolio values with workbook. |
| 8 | Product Master | `lib/product-master.ts`, `data/master-inputs.json`, `lib/master-data.ts` | Implemented for 27 public products | Refresh source fields and verify each product's classification, YTM/credit assumptions, overrides and geography. |
| 9 | Asset Class Master | Aggregation in `lib/engine.ts`; defaults in `data/subclasses.json` | Implemented | Reconcile all class defaults, covariance inputs, factors and aggregation rows against workbook. |
| 10 | Private Assets Master | `lib/private-assets.ts`, `data/master-inputs.json` | Implemented for 6 private funds | Fund inputs are static workbook-derived data; verify latest terms, fees, NAV/IRR, liquidity and DD status. |
| 11 | Structured Notes | `lib/structured-notes.ts`, `data/master-inputs.json` | Implemented for 4 notes | Validate live term sheets, calendars, observation rules, issuer credit and payoff edge cases. |
| 12 | Inputs | `data/assumptions.json`, client state, `components/Setup.tsx`, `components/Levers.tsx` | Partially mapped; first discrepancy fixed | Workbook D21 is 10%; selecting Medium risk previously overwrote it with 8%. The risk selector now changes only the risk-profile label. Still reconcile every input cell, default, validation rule and editability classification. |
| 13 | Risk & Hedging | Covariance/risk/hedge calculations in `lib/engine.ts`; Risk and Actions & hedges views | Implemented | Validate hedge sizing/cost/benefit, covariance edge cases, limits and risk contributions against workbook. |
| 14 | F1 Rates | Factor score inputs in `data/assumptions.json`; aggregation in `lib/engine.ts` | Partial / analyst-input mapping | Sheet-specific evidence tables, signal provenance and per-asset-class impact rules are not separately represented as a live workflow. |
| 15 | F2 Inflation | Factor score inputs and aggregation in engine | Partial / analyst-input mapping | Same gap: verify full inflation evidence, consensus and asset-class impact matrix. |
| 16 | F3 Growth & AI | Factor score inputs and aggregation in engine | Partial / analyst-input mapping | Verify growth/earnings/AI evidence and asset-class impact matrix. |
| 17 | F4 Oil & Geopolitics | Factor score inputs and aggregation in engine | Partial / analyst-input mapping | Verify oil/geopolitical evidence and asset-class impact matrix. |
| 18 | F5 Currency | Factor score inputs and aggregation in engine | Partial / analyst-input mapping | Verify FX/dollar evidence and asset-class impact matrix. |
| 19 | F6 Valuation | Factor score inputs and aggregation in engine | Partial / analyst-input mapping | Verify valuation/sentiment evidence and asset-class impact matrix. |
| 20 | F7 Credit & Fiscal | Factor score inputs and aggregation in engine; structured-note issuer adjustment | Partial / analyst-input mapping | Verify credit/fiscal/liquidity evidence and asset-class impact matrix. |
| 21 | Sources | Source fields in scenario evidence and product data | Partial | No central source register/audit workflow for all product, private-fund, note and factor inputs. |
| 22 | Lists | Dropdown and product/subclass enumerations in app/data JSON | UI equivalents | Workbook helper ranges are represented in code/data, not imported dynamically; reconcile every dropdown option and ID. |

## Cross-cutting findings

### Confirmed by repository and CI
- The app is wired to derive master product parameters before calling the existing analysis engine.
- The existing engine covers portfolio construction, asset-class aggregation, risk/covariance, scenarios, holding-level actions and monitoring outputs.
- The analysis UI exposes Why this mix, Risk, Scenarios, Actions & hedges, Monitoring and Client summary views.
- The master-data and scenario-engine parity tests are included in the CI test command.
- The latest workflow passed both tests and production build.

### Not yet proven / still required
1. Formula-cell traceability: all 11,866 formulas must be assigned to an application calculation, UI/report output, input/master-data field, or explicitly documented workbook-only/helper formula.
2. Browser/E2E tests for the complete advisor journey and print/PDF report.
3. Full F1–F7 sheet-level evidence and impact matrix ingestion; current code uses analyst-maintained factor inputs and aggregates them.
4. A central source/provenance registry with last-verified dates and refresh controls.
5. Live data provider integrations. None are configured by this PR; scenario evidence is manual and master data is static.
6. Investment/advisory sign-off on assumptions, risk mappings, eligibility, private-market valuations and structured-note modelling.

## Conclusion

The earlier CI build/test run is green, and the latest change preserves the workbook's 10% target-volatility assumption when the risk label changes. The uploaded workbook is now available for a fresh formula audit. Full formula-by-formula sign-off is NOT yet complete; it requires cell-level mapping, independent recalculation, active/blank/error classification, and expected-vs-actual tests across representative and boundary scenarios.

The PR remains separate from `main`; do not merge without explicit approval.
