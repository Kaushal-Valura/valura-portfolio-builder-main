# Next Best Actions formula audit

## Scope
- Workbook sheet: `Next Best Actions`
- Formula cells: 794
- Saved cached values: 332
- Formula cells without saved cached values: 462; verify through recalculation or formula-semantic tests rather than treating missing cache as blank.
- Runtime source: `lib/engine.ts`, with Portfolio Builder, Inputs, Scenarios, Risk & Hedging, Asset Class Master and F1/F2/F4 factor dependencies.

## Formula regions

| Rows | Formula cells | Responsibilities |
|---|---:|---|
| 7–46 | 720 | 40 advisor holding rows: copy-through fields, flags, action rule chain, priority, next-step text and ranking score |
| 47 | 1 | High / medium priority count string |
| 52–59 | 64 | Eight hedge triggers, recommendation labels, instrument descriptions, notionals, costs and scenario benefits |
| 60–66 | 9 | Recommended hedge totals, cost percentage, scenario impact before / after hedging, recommendation count |

## Runtime mapping
The engine already calculates:
- Per-line flags, action, priority and what-to-do text.
- Ranked actions and high / medium counts.
- Eight hedge rows with trigger, status, instrument, notional, cost, bear/tail benefit and aggregate scenario effect.

## Formula-level issue to resolve
The workbook's US-situs hedge row (Next Best Actions!E59 and L59) checks the raw sum of Portfolio Builder amounts where column T is `Yes`, without testing client US-person status. The current engine reuses the estate-tax-filtered `usSitusAmt` (which is zeroed for US-person clients) for this hedge row. This differs from the literal workbook formula. Monitoring!E19 has already been separated from the estate-tax filter for the same reason, but the Next Best Actions hedge still needs an explicit decision: strict Excel parity or a deliberate client-specific rule. Do not silently change the business rule; record the choice and test both US-person states.

## Verification required before completion
1. Map all 794 formula cells to typed engine outputs or explicitly mark presentation-only formulas.
2. Verify populated cached values and separately test the 462 formulas without saved caches.
3. Test empty and full portfolios, unknown IDs, blocked / review eligibility, all eight hedge triggers, zero portfolio denominator, US-person status, and boundary thresholds.
4. Compare all 40 action rows, priorities, ranking order, all hedge outputs and aggregate scenario effects.
5. Run the full test suite and production build after any code change.

**Status: audit started; not complete.** Existing runtime coverage is substantial, but full cell-level parity is not yet evidenced.
