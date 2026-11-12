# Workbook-wide formula completion

## Scope

Workbook: `Valura_Report_REDACTED 21102026_Karmesh.xlsx`

The workbook contains 22 sheets and 11,866 formula cells. Product Master is already implemented and verified on the target backend branch. This workstream completes the remaining sheets in workbook order, one sheet at a time.

## Required workflow for every sheet

1. Inventory every formula cell and normalize formulas into calculation families.
2. Trace all cross-sheet references, source inputs, assumptions, lookup tables, and dependent outputs.
3. Implement the complete sheet calculation in reusable backend modules and connect the outputs to the runtime where applicable.
4. Preserve Excel semantics for blanks, text, errors, overrides, rounding, date handling, and boundary conditions.
5. Add focused unit tests, edge-case tests, and workbook parity tests against saved Excel values where available.
6. Record formula coverage, known data-source limitations, and any unresolved business assumptions.
7. Run the complete test suite and production build before marking the sheet complete.
8. Move to the next sheet only after the current sheet's verification is documented.

## Progress

| Order | Sheet | Formula cells | Status | Evidence |
|---:|---|---:|---|---|
| 1 | Start Here | 6 | Implemented and integrated; all six cached workbook outputs and edge cases checked locally; CI verification pending | `lib/start-here.ts`, `lib/start-here.test.ts`, `lib/engine.ts`, `lib/engine.test.ts`
| 2 | Portfolio Builder | 2,321 | Formula audit underway; unknown/blank ID, invested-value denominator, sleeve mapping and case-insensitive ID fixes added; full row/summary parity and CI verification pending | `docs/portfolio-builder-formula-audit.md`, `lib/engine.ts`, `lib/engine.test.ts`
| 3 | Monitoring | 22 | Implemented in runtime; all 15 traffic-light outputs and RED/AMBER counts covered by regression tests; US-situs metric corrected to match Excel independently of US-person status; CI pending | `lib/engine.ts`, `lib/engine.test.ts`, `docs/monitoring-formula-audit.md` |
| 4 | Client Summary | 1,904 | Pending | — |
| 5 | Next Best Actions | 794 | Pending | — |
| 6 | Scenario Engine | 197 | Existing module; formula-by-formula audit and parity re-verification pending | `lib/scenario-engine.ts` |
| 7 | Scenarios | 444 | Existing engine coverage; sheet-specific audit and parity re-verification pending | `lib/engine.ts` |
| 8 | Asset Class Master | 671 | Existing master-data / aggregation coverage; full sheet audit pending | `lib/master-data.ts`, `lib/engine.ts` |
| 9 | Private Assets Master | 400 | Existing module; formula-by-formula audit and parity re-verification pending | `lib/private-assets.ts` |
| 10 | Structured Notes | 990 | Existing module; formula-by-formula audit and parity re-verification pending | `lib/structured-notes.ts` |
| 11 | Inputs | 47 | Existing input integration; full sheet audit pending | `lib/master-data.ts`, `lib/engine.ts` |
| 12 | Risk & Hedging | 1,492 | Existing engine coverage; full sheet audit pending | `lib/engine.ts` |
| 13 | F1 Rates | 253 | Existing factor aggregation; sheet formula audit pending | `lib/engine.ts` |
| 14 | F2 Inflation | 253 | Existing factor aggregation; sheet formula audit pending | `lib/engine.ts` |
| 15 | F3 Growth & AI | 261 | Existing factor aggregation; sheet formula audit pending | `lib/engine.ts` |
| 16 | F4 Oil & Geopolitics | 253 | Existing factor aggregation; sheet formula audit pending | `lib/engine.ts` |
| 17 | F5 Currency | 262 | Existing factor aggregation; sheet formula audit pending | `lib/engine.ts` |
| 18 | F6 Valuation | 253 | Existing factor aggregation; sheet formula audit pending | `lib/engine.ts` |
| 19 | F7 Credit & Fiscal | 253 | Existing factor aggregation; sheet formula audit pending | `lib/engine.ts` |
| 20 | Sources | 0 | No formula cells; source-reference audit pending | — |
| 21 | Lists | 150 | Pending | — |

Product Master (640 formula cells) is the completed baseline on the target backend branch and is not reimplemented in this PR.

## Safety boundaries

- This PR targets `backend/complete-engine-sheet-by-sheet`.
- No changes are made to `main`.
- No PR is merged automatically.
- A sheet is not described as complete until formula coverage and tests are evidenced.
- If a formula depends on an undefined business rule or unavailable external data, document it and ask for clarification rather than silently inventing an assumption.
