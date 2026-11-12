# Formula architecture analysis — 22-sheet Valura workbook

## Executive conclusion

The workbook contains **11,866 formula-cell occurrences**, but this is not the number of independent calculations or business rules. Many occurrences are dragged copies of the same relative formula template; many others are direct cell references that relay a value from another cell.

A syntax-aware relative-reference normalization of the supplied workbook identified:

| Measure | Count |
|---|---:|
| Formula-cell occurrences | 11,866 |
| Distinct normalized formula templates across all sheets | 1,334 |
| Distinct normalized templates summed sheet-by-sheet | 1,795 |
| Direct single-cell reference occurrences | 2,695 |
| Remaining non-direct formula occurrences | 9,171 |

The per-sheet template sum is higher than the workbook-wide distinct count because an identical normalized template can occur on multiple worksheets. These counts are a structural baseline, not a final count of semantic business calculations.

## What the counts mean

1. **Occurrences (11,866):** every cell containing a formula. Keep this count for complete traceability and audit coverage.
2. **Normalized templates (1,334):** formula structures after translating relative A1 references into relative row/column offsets while preserving absolute references, sheet qualifiers, operators, and functions. Dragged formulas collapse into a reusable template.
3. **Direct references (2,695):** formulas that simply point to one cell. These should normally become data-flow/field mappings rather than standalone calculation functions.
4. **Business calculations:** the smaller semantic set still to be identified by reviewing the templates, dependencies, workbook intent, and application modules. Do not equate this with 1,334; syntactically different formulas may implement the same business rule, while similar-looking formulas can have different meanings.

## Implementation target

Build a compact calculation engine with:
- a canonical input/assumption layer for user inputs, centrally maintained parameters, rates, thresholds, weights, and correlations;
- reusable calculation functions grouped by domain (portfolio construction, product/asset masters, scenario engine, risk/hedging, recommendations, reporting);
- explicit data relationships for simple references and lookups;
- a mapping from every original formula cell to its canonical input, reference, calculation function, or intentional display/Excel-only formula;
- deterministic fixtures and Excel-vs-application output comparisons, with documented tolerances and edge cases.

Do not implement every dragged formula as an independent function. Do not remove cell-level traceability merely because formulas share a template.

## Normalization method and limitations

The attached analysis workbook records every source formula and assigns a template ID. Normalization uses formula tokenization and converts relative cell coordinates to offsets from the formula cell; absolute row/column coordinates remain absolute. Worksheet qualifiers and formula operators/functions are retained.

This is a syntactic grouping method. It does not yet perform semantic equivalence proofs, dependency-graph simplification, or business-rule consolidation. Structured references, array/dynamic-array behaviour, named expressions, Excel-specific functions, and unusual reference syntax require separate validation if encountered. No template is accepted as a reusable business function solely because its normalized text matches another formula.

## Acceptance gates

- [ ] Confirm the source workbook hash and freeze the source version.
- [ ] Review all 1,334 normalized templates and group them into semantic calculation families.
- [ ] Resolve all 2,695 direct-reference occurrences into explicit data-flow mappings (or document exceptions).
- [ ] Build and review the dependency graph, including cross-sheet dependencies.
- [ ] Map all 11,866 occurrences to a canonical owner and status; no unmapped cells.
- [ ] Build independent fixtures from the workbook and compare every mapped output.
- [ ] Cover boundary, blank, zero, missing-data, error, and populated-row cases.
- [ ] Run regression, API, and UI/E2E tests; record skips and limitations.
- [ ] Obtain business sign-off for any ambiguous assumptions before claiming parity.

## Source workbook

- File: `Valura_Report_REDACTED 21102026_Karmesh(1).xlsx`
- SHA-256: `2fa2b6367b0195ec711467939e59f921866b1ae68566a998c922ef55463da3d7`
- Worksheets: 22
- Formula cells: 11,866

The downloadable `Valura_Formula_Architecture_Analysis.xlsx` companion contains:
- **Cell Traceability:** all formula occurrences, original formula, cached value, template ID, and formula type.
- **Template Catalogue:** each normalized template, occurrence count, sheet count, representative formula, and normalized structure.
- **Sheet Summary:** formula and template counts by worksheet.
- **Method & Caveats:** source hash, definitions, and limitations.

**Status:** architecture baseline established; semantic consolidation, complete cell-to-engine mapping, and exhaustive output parity remain in progress. No full parity claim is made.
