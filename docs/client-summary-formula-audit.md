# Client Summary formula audit

## Scope
- Workbook sheet: `Client Summary`
- Formula cells: 1,904
- Formula cells with saved cached values in the supplied workbook: 1,534
- Formula cells without a saved cached value: 370. These cells require formula-semantic or recalculated-workbook verification; an empty cache is not proof of a blank result.
- Runtime source: `lib/engine.ts`, plus the Portfolio Builder, Risk & Hedging, Scenarios, Scenario Engine, Next Best Actions, and F1–F7 outputs.

## Formula regions

| Rows | Formula cells | Main responsibilities |
|---|---:|---|
| 5–68 | 742 | Portfolio headline metrics, holdings / risk tables, allocation and risk breakdowns, master-data lookups |
| 69–140 | 575 | Holdings and asset-class summaries, recommended actions and associated data |
| 141–231 | 489 | Portfolio risk / hedging and scenario-linked calculations, asset-class / factor views |
| 232–242 | 57 | Seven factor exposure summaries, labels, factor-sheet links, narrative summary |
| 264–270 | 35 | Scenario probability / return / confidence-band display and narrative |
| 292–296 | 5 | Five executive-summary statements linking mandate, risk, scenario, action and hedge outputs |

## Key calculation dependencies
- Portfolio Builder line outputs and invested portfolio value.
- Asset Class Master classification, expected return, volatility, beta, risk and portfolio aggregation.
- Risk & Hedging portfolio return, INR return, volatility, downside, probability and risk-limit metrics.
- F1 Rates through F7 Credit & Fiscal factor scores and weighted factor exposures.
- Scenarios and Scenario Engine probability, return, confidence and projection outputs.
- Next Best Actions line-level action ranking, priority counts and hedge recommendations.

## Existing runtime coverage
The existing `analyse()` result already exposes most semantic outputs used by this sheet: portfolio risk, factor exposure and factor summary, scenario summary, hedges, mandate and geography statuses, action priorities, risk limits, and five key-message strings. This is not yet proof that all 1,904 individual worksheet formulas have a one-to-one runtime mapping.

## Known workbook-vs-engine handling
- The workbook's Client Summary!B292 always says the construction "meets the mandate", even when sleeve / geography status counts are below target. The engine deliberately corrects this to "does not yet meet" unless all mandate and geography statuses are on target.
- The workbook can display an empty top-priority fragment when the portfolio is empty; the engine omits that fragment.
- The workbook's Client Summary!B296 can divide by zero when no portfolio is invested. This should be handled safely in the application layer.

## Verification required before completion
1. Build an explicit mapping from each formula cell to a typed runtime field or an intentional presentation-only formula.
2. Verify every populated saved cached value and separately recalculate / test the 370 cells without saved cached values.
3. Exercise zero-value portfolios, blank holdings, unknown product IDs, partial sleeve / geography mapping, negative and zero values, and scenario probability overrides.
4. Confirm number / text formatting and narrative output parity where those are user-visible.
5. Run the full backend/parity suite and production build on the resulting commit.

**Status: audit started; not complete.** The existing engine coverage is broad, but cell-level mapping and full Client Summary parity have not yet been evidenced.
