# Scenario Engine formula audit

## Scope
- Workbook sheet: `Scenario Engine`
- Formula cells: 197
- Saved cached values: 175
- Formula cells without saved cached values: 22.
- Runtime module: `lib/scenario-engine.ts`; integration and portfolio projections are in `lib/engine.ts`.
- This sheet consumes manually refreshed signal inputs; no external market-data feed is implied by the workbook formulas.

## Formula regions

| Rows | Formula cells | Responsibilities |
|---|---:|---|
| 17–46 | 120 | Signal rows: scenario probability totals, date age / freshness, evidence eligibility and effective weight |
| 50–61 | 37 | House-prior / evidence blend, disagreement, probability bands and confidence outputs |
| 65–67 | 6 | Expected 12-month return and pessimistic / optimistic return or value projections |
| 71–81 | 22 | Calibration history and Brier-score calculations |
| 87–97 | 11 | Scenario-family weighting / aggregation |
| 10–12 | 0 | Input area; values are manually maintained rather than formula outputs |

## Runtime coverage already present
The existing module calculates:
- Input validation for prior and signal probability vectors.
- Signal row totals, date age, freshness half-life, reliability-weighted effective weights and acceptance reasons.
- Evidence-weighted scenario distributions and disagreement.
- Blended final probabilities and pessimistic / optimistic probability bands.
- Per-scenario and overall confidence.
- Family-weight shares, Brier score and calibration entries.
- Expected return and projected portfolio value when scenario returns and portfolio value are supplied.

## Verification required before completion
1. Map all 197 formula cells to module outputs or intentional display formulas.
2. Verify 175 cached values and test 22 cells without saved caches.
3. Test no signals, blank signal names, invalid probability totals, missing / future / stale dates, invalid reliability, zero effective weight, probabilities near 0 and 1, and calibration entries with missing outcomes.
4. Confirm Excel date serial / date parsing semantics, probability band totals, and blank-vs-zero behaviour.
5. Run focused scenario-engine tests, full backend/parity tests and production build.

**Status: existing module; formula audit started, not complete.** Do not infer complete workbook parity from the presence of unit tests alone.
