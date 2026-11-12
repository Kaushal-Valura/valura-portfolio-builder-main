# Workbook formula-parity programme

## Acceptance standard

The workbook has 11,866 formula cells across 22 worksheets. Completion means every formula cell has an explicit disposition and every active business calculation has an automated parity assertion. A green TypeScript build or a small sample-client parity test is not sufficient.

A formula cell is complete only when all of the following are recorded:
1. Workbook sheet and cell address.
2. Original Excel formula text.
3. Normalised formula family / dependency chain.
4. Application owner (module, function, UI/report output) or an explicit workbook-only disposition.
5. Input fixture and expected Excel result.
6. Actual application result and numeric/string comparison rule.
7. Edge-case coverage (blank, zero, boundary, negative, maximum/minimum, missing master-data match where applicable).
8. Status: exact, tolerance match, intentional UI-only, workbook-only, blocked, or discrepancy.

## Validation phases

### Phase 1 — Freeze and inventory
- Record the source workbook SHA-256, workbook date/version, worksheet dimensions and formula counts.
- Export every formula cell to a stable machine-readable manifest (one record per cell).
- Preserve formulas as text; do not replace source formulas with reconstructed approximations.
- Distinguish formula cells that return blank by design from missing/invalid results.

### Phase 2 — Dependency and ownership mapping
- Trace cross-sheet references and named ranges (including formulas that use implicit intersections or array/dynamic functions).
- Assign every formula cell to its application calculation or explicitly mark it workbook-only/helper/UI.
- Identify formulas currently represented only by hardcoded JSON, formulas omitted from the UI, and formulas whose source dependencies are not modelled.
- No worksheet may be labelled fully mapped while any formula cell remains unassigned.

### Phase 3 — Independent workbook oracle
- Recalculate a copy of the workbook with a compatible spreadsheet calculation engine.
- Compare recalculated results with Excel-cached values where available.
- Record unsupported functions, calculation-engine differences, volatile formulas and intentional blanks.
- Do not use the app's own calculations as the expected-value source.

### Phase 4 — Automated parity tests
- Generate fixtures from active workbook rows and representative portfolio scenarios.
- Assert every formula family and all material output cells against independently recalculated workbook results.
- Use exact comparisons for strings, booleans and IDs; documented absolute/relative tolerances for floating-point values.
- Add boundary and mutation tests for thresholds, missing data, product eligibility, fees, currency, liquidity, correlation and scenario overrides.
- Fail CI if an audited cell loses its mapping, expected result, or test.

### Phase 5 — UI and end-to-end checks
- Verify that every user-editable workbook input has an equivalent control and validation.
- Verify that centrally maintained assumptions are surfaced with provenance and cannot be accidentally changed by unrelated UI actions.
- Exercise the full client setup → portfolio build → rebalance → risk/scenarios/actions/monitoring → client report/print flow.

### Phase 6 — Sign-off
- Publish a discrepancy register with workbook cell, formula, expected value, actual value, severity and resolution commit.
- Require zero unexplained discrepancies; documented tolerances and workbook-only cells require explicit rationale.
- Run the complete test suite and production build on the PR head.
- Keep the PR separate from main until the user approves.

## Confirmed first input correction
- Workbook `Inputs!D21` is 10% target volatility.
- The prior Setup risk-profile radio handler overwrote target volatility when a risk label changed (Medium set 8%).
- The handler now changes only `riskProfile`; target volatility remains the independent workbook assumption until the advisor edits it on the optimiser desk.

## Current status
- Source workbook received and independently scanned: 22 worksheets, 11,866 formula cells.
- First confirmed input discrepancy corrected on the PR branch.
- Full cell-by-cell mapping and independent recalculation/parity suite are still in progress. Do not claim formula-parity completion until all phases pass.

## Uploaded workbook inventory baseline (12 Nov 2026)

- File: `Valura_Report_REDACTED 21102026_Karmesh(1).xlsx`
- SHA-256: `2fa2b6367b0195ec711467939e59f921866b1ae68566a998c922ef55463da3d7`
- Worksheet count: 22
- Formula-cell count: 11,866
- Formula cells with saved cached values: 9,662
- Formula cells without saved cached values: 2,204
- Defined names: none
- External workbook links: none

### Formula cells by worksheet

| Worksheet | Formula cells |
|---|---:|
| Start Here | 6 |
| Portfolio Builder | 2,321 |
| Monitoring | 22 |
| Client Summary | 1,904 |
| Next Best Actions | 794 |
| Scenario Engine | 197 |
| Scenarios | 444 |
| Product Master | 640 |
| Asset Class Master | 671 |
| Private Assets Master | 400 |
| Structured Notes | 990 |
| Inputs | 47 |
| Risk & Hedging | 1,492 |
| F1 Rates | 253 |
| F2 Inflation | 253 |
| F3 Growth & AI | 261 |
| F4 Oil & Geopolitics | 253 |
| F5 Currency | 262 |
| F6 Valuation | 253 |
| F7 Credit & Fiscal | 253 |
| Sources | 0 |
| Lists | 150 |
| **Total** | **11,866** |

### Recalculation experiment

A LibreOffice headless open/convert round-trip (XLSX → ODS → XLSX) was attempted on a copy. It produced no cached formula errors, but the same 2,204 cells still have no cached value when read by openpyxl. This does not establish whether those cells are blank-by-design or require a different calculation path. The no-cache cells are concentrated in formula-filled rows that often gate on blank product/holding IDs, but each must be classified rather than assumed blank.

A detailed downloadable inventory was generated during this audit with one row per formula cell, formula text, saved cached result/status and extracted cross-sheet references. The workbook hash above pins the exact source version.
