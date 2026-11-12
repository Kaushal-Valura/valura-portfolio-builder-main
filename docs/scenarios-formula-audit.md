# Scenarios formula audit

## Scope
- Workbook sheet: `Scenarios`
- Formula cells: 444
- Saved cached values: 352
- Formula cells without saved cached values: 92.
- Runtime integration: `lib/engine.ts` and `lib/scenario-engine.ts`; class-level scenario inputs are in `data/subclasses.json`.

## Formula regions

| Rows | Formula cells | Responsibilities |
|---|---:|---|
| 6–10 | 21 | Four scenario probabilities, overrides, labels and probability-weighted outputs |
| 14–47 | 304 | Asset-class / subclass scenario return look-through and portfolio-weighted aggregation |
| 54–59 | 39 | Scenario totals, benchmark / 60-40 comparisons and portfolio scenario summaries |
| 57–85 | 23 (overlap with preceding range) | Portfolio-level scenario return and value outputs plus scenario comparison summaries |

## Runtime coverage already present
The engine calculates four portfolio scenario returns from holding amounts and line scenario returns, advisor-overridden probabilities, probability-weighted portfolio return, scenario portfolio values, benchmark 60/40 returns, pessimistic / optimistic scenario return and engine-probability-weighted expected return. Structured-note and private-asset scenario overrides flow through the master-data adapters.

## Verification required before completion
1. Map each of the 444 formula cells, including the asset-class / subclass lookup grid, to a runtime output or intentional presentation formula.
2. Verify 352 cached outputs and test 92 cells without saved caches.
3. Test probability overrides, missing scenario values, empty portfolios, zero weights, negative returns, class rows with no holdings, and structured / private override precedence.
4. Verify that formula-weighted averages use the same denominator and fallback rules as Excel for empty classes.
5. Run the complete backend/parity tests and production build.

**Status: existing engine coverage; sheet-level audit and full parity not complete.**
