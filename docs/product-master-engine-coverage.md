# Product Master engine coverage

Status: implementation and focused tests added; final CI verification pending.

## Workbook scope

- Source sheet: `Product Master`
- Formula rows: 9–88 (80 slots)
- Formula output columns: G, H, U, AT, AU, AV, AW, AX
- Formula occurrences: 640 (80 rows × 8 output columns)
- Populated public-product rows: 9–35 (27 products)
- Empty template rows: 36–88 (53 slots)

The engine calculates each row using one reusable function. It does not implement 640 independent formulas.

## Formula-to-engine map

| Excel output | Engine output | Source inputs and linked variables |
|---|---|---|
| G | `assetClassName` | F sub-asset code → Asset Class Master B7:B39 / D7:D39 |
| H | `subclassName` | F sub-asset code → Asset Class Master B7:B39 / E7:E39 |
| U | `usSitus` | S domicile; T explicit US-situs override |
| AT | `expectedReturn` | F, AL return override, AC yield, Z rating; Product Master C93:D110; Inputs D45 (5Y Treasury), D51 (LGD), D52 (spread expected-loss share); Asset Class Master N7:N39 |
| AU | `volatility` | F, AM override; Asset Class Master O7:O39 |
| AV | `beta` | F, AN override; Asset Class Master P7:P39 |
| AW | `riskRating` | F, AO override; Asset Class Master Q7:Q39 |
| AX | `geographyCheck` | B product ID; K/L/M look-through US/India/rest-of-world weights |

All cross-sheet assumptions are injected through `data/master-inputs.json` and the asset-class subclass data adapter. The five-year Treasury yield, loss-given-default, credit-spread expected-loss share and all 18 rating default probabilities are not duplicated in the calculation module.

## Important parity correction

Excel Product Master column G points to Asset Class Master column D, which is the Level 1 **name** (for example, `Equity`), not the Level 1 code (for example, `EQ`). The adapter previously passed `l1`; it now passes `l1Name` for the Product Master output. The Level 1 code is retained separately for other engine modules.

## Implemented safeguards

- Explicit overrides take precedence, including numeric zero.
- Bond expected return is yield less the larger of rating-default loss × LGD and positive spread over the five-year Treasury × spread-loss share.
- Unknown rating uses the workbook's 2% fallback probability.
- Unknown sub-asset code returns `Unknown code` for G/H and zero model defaults, matching IFERROR(...,0) in the workbook.
- Geography uses Excel-like `N()` treatment for blank/non-numeric cells.
- Duplicate product IDs, duplicate lookup keys, invalid numeric assumptions and more than 80 product rows fail validation.
- A slot adapter returns all 80 workbook rows, including blank rows (blank text outputs and zero numeric model outputs).

## Verification evidence

- 27 populated product rows × 8 formula outputs = 216 outputs. Independent Python evaluation of the workbook's formulas and linked input tables matched all 216 saved Excel cached values (zero mismatches).
- 53 unused rows × 8 formulas = 424 template outputs. Their cached values are incomplete in the source file: 212 text outputs have no saved cached result; the 212 numeric AT:AW outputs are cached as zero. The engine's 80-slot test checks the intended blank/zero behavior.
- Automated tests now cover all 27 public product records for Level 1 name, sub-class name and geography; the existing master-data parity test checks expected return, volatility, beta, risk and US situs against the app's product snapshot.
- The complete 18-row rating-default table, override precedence, unknown rating, unknown subclass, blank slots, duplicate IDs and invalid assumptions have dedicated tests.

## Remaining acceptance boundary

This establishes the Product Master calculation layer and its current product-data integration. It does not claim that every descriptive/input field on the worksheet is editable or that all 640 cells have independent saved Excel cached results. The 27 populated rows have cached-output parity; unused-row text outputs are validated against formula semantics because the source workbook did not store those cached values. Full PR acceptance also depends on the complete test-and-build workflow passing.
