# Portfolio Builder formula audit

## Workbook scope

- Sheet: `Portfolio Builder`
- Formula cells: 2,321
- Editable line slots: rows 24:63 (40 rows)
- Formula outputs per line: 56 columns, G:BJ (2,240 formula cells)
- Summary formulas: 81 cells across mandate rows 6:11, geography rows 14:17, and total row 64
- Current formula work: audit in progress; do not mark complete until every formula output has parity evidence.

## Formula families and dependencies

| Range | Formula family | Main dependencies |
|---|---|---|
| D6:H11 | Sleeve target USD, actual USD, actual weight, gap, tolerance status, and total mapping status | Advisor sleeve targets B6:C10, line sleeve/amount D24:E63, total value E64 |
| D14:H17 | Look-through geography target USD, actual USD, actual weight, gap, status, and 100% completeness | Geography targets C14:C16, line amount E24:E63, geography percentages N:P |
| G24:M63 | Product-source classification and master-data identity/classification lookup | Product IDs C24:C63; Product Master, Private Assets Master, Structured Notes |
| N24:P63 | Numeric look-through geography shares | Master-sheet geography splits; Excel N() and IFERROR semantics |
| Q24:W63 | Currency, domicile, situs, liquidity, sector/underlying, issuer/manager | Product/private/structured master fields |
| X24:AA63 | Credit rating, yield/coupon, fee, fund AUM | Product Master and Structured Notes; private-specific blanks |
| AB24:AH63 | Platform access, accredited-only flag, minimum tickets, DD, commitment, year-1 call | Product Master, Private Assets Master, Structured Notes, Inputs!D24 |
| AI24:AL63 | Expected return, volatility, beta, risk rating | Product Master AT:AW, Private Assets Master AX:BA, Structured Notes AW:AZ |
| AM24:AN63 | Eligibility decision and portfolio weight | Master access terms, Inputs!D24, total value E64 |
| AO24:AV63 | Seven factor scores and weighted net factor | F1 Rates through F7 Credit & Fiscal; Structured Notes BC:BI; Inputs!D58:D64 |
| AW24:BB63 | Four scenario returns, probability-weighted return, worst scenario | Product Master AP:AS, Private Assets Master AT:AW, Structured Notes BN:BQ, Scenarios B14:H47 and D6:D9 |
| BC24:BJ63 | Barrier distance, issuer credit risk, year-1 capital call, lock-up/tenor, single-issuer excess, excess tail impact, AI-linked amount, INR-exposed amount | Structured Notes, Product Master, Private Assets Master, Inputs!D28, portfolio total E64 |
| D64:E64, N64:P64, AI64:AL64, AM64:AN64, AO64:AV64, AW64:BA64, BE64, BG64:BH64, BI64:BJ64 | Portfolio total, weighted averages, eligibility counts, weighted factors/scenarios and summed exposures | All 40 line slots |

## Existing backend mapping

The current `lib/engine.ts` already calculates the main investment aggregates used by this sheet:
- `Analysis.value` and line weights
- enriched line product data, eligibility, factor scores, scenario returns, probability-weighted return, worst scenario, capital calls, issuer excess, AI and INR exposure
- sleeve mandate and geography actuals / weights / gaps / statuses
- weighted risk and return outputs and portfolio-level totals

The product-specific master-sheet formulas are already ported in `lib/product-master.ts`, `lib/private-assets.ts`, and `lib/structured-notes.ts`. Factor scores and scenario fallbacks are currently sourced by the portfolio engine.

## Discrepancy found during formula audit

The workbook counts and includes every nonblank advisor line ID / amount in Portfolio Builder totals, even when the product ID is unknown:
- `E64 = SUM(E24:E63)`
- `D64 = COUNTIF(C24:C63,"?*")`
- `AN24:AN63` divides each line amount by total `E64`
- `AM24:AM63` explicitly returns `CHECK: unknown product ID` for an unknown ID.
- Sleeve actuals use `SUMIF` on advisor sleeve and amount, independent of successful product lookup.

The initial engine implementation filtered input lines to IDs present in the product catalogue before calculating portfolio value. It also used the client's budget rather than invested value for mandate / geography target dollars and actual percentages, and performed case-sensitive product ID matching.

The first correction set now:
- Sums all 40 advisor amount slots for `E64`, even if the product ID is unknown or blank.
- Counts nonblank IDs for `D64`, including IDs that cannot be resolved.
- Exposes unresolved and amount-only blank-ID slots as `unmappedLines`; valid prefixes retain the Excel source classification and unresolved IDs receive the workbook's CHECK status.
- Includes every advisor amount in sleeve `SUMIF` actuals.
- Uses invested value `E64`, not the client budget, for sleeve / geography target USD and actual percentages.
- Matches product IDs case-insensitively, consistent with Excel exact `MATCH` text behaviour.

These changes are implemented in `lib/engine.ts`; focused regression tests have been added to `lib/engine.test.ts`. Full suite / production CI verification remains pending.

## Verification plan

1. Preserve all 40 slots, including blank and invalid-ID rows.
2. Port the 56 row formulas as an explicit typed line-output adapter, keeping source-specific lookup rules and Excel blank/text/number coercions.
3. Correct total value, line count, weight denominator, and sleeve actuals for invalid IDs without allowing invalid rows into risk/factor calculations.
4. Verify every populated formula output against saved workbook cached values; separately verify blank slots and invalid-ID cases with formula-semantic tests.
5. Compare summary outputs D6:H11, D14:H17 and row 64 totals; run the complete test suite and production build.
6. Record all remaining discrepancies before marking the sheet complete.
