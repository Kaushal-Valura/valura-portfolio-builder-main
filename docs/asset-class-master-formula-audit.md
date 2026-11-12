# Asset Class Master formula audit

- **Formula cells:** 671; saved cached values: 671; missing caches: 0.
- **Formula families:** B:D and J/N subclass lookups (44 rows each); E:M/O factor and scenario inputs (11 rows); W:AG portfolio aggregation (34 rows each).
- **Dependencies:** Portfolio Builder line IDs / amounts / subclass keys / line risk-factor fields; factor sheets; Inputs; scenario assumptions.
- **Runtime touchpoints:** `data/subclasses.json`, `lib/master-data.ts`, and aggregation / covariance / factor code in `lib/engine.ts`.

## Main formula responsibilities
1. Subclass master lookup and display mapping.
2. Asset-class expected return, volatility, beta, risk, scenario and factor attributes.
3. Held-line count, invested amount, portfolio weight and weighted metrics by subclass.
4. Factor exposure and portfolio aggregation outputs consumed by F1–F7 and Risk & Hedging.

## Verification gaps
- 671/671 cached cells are available in the supplied workbook, but existing engine tests compare only selected outputs, not every formula coordinate.
- Build a coordinate-to-output parity fixture for all rows/columns, including empty subclasses, unheld rows, zero total value and unknown IDs.
- Validate that factor weights and subclass aggregation use the exact Excel denominator and fallback when no holdings exist.

**Status: existing runtime implementation; full cell-by-cell parity not yet evidenced.**