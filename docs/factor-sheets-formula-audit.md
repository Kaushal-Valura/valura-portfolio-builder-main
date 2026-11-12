# F1–F7 factor sheets formula audit

- **Combined formula cells:** 1,788.
- **Saved cached values:** 1,788; missing caches: 0.
- **Sheets:** F1 Rates (253), F2 Inflation (253), F3 Growth & AI (261), F4 Oil & Geopolitics (253), F5 Currency (262), F6 Valuation (253), F7 Credit & Fiscal (253).
- **Formula families per sheet:** C/E/F/J rows 5 and 46–89; D score aggregation and H action text; N:P factor / signal summary formulas.
- **Runtime:** factor definitions and portfolio weighted exposures in `data/assumptions.json`, `data/subclasses.json`, and `lib/engine.ts`; structured-note factor overlays in `lib/structured-notes.ts`.

## Formula responsibilities
- Factor score / outlook / narrative action classification.
- Subclass exposure weights linked from Asset Class Master.
- Weighted aggregate score by Level 1 asset class and total factor exposure.
- Dynamic portfolio exposure / contribution calculations and summary indicators.

## Verification gaps
- All 1,788 cached values exist; current tests validate portfolio factor exposure and structured-note factor overlays, not every factor-sheet coordinate.
- Need per-sheet parity fixtures for every formula cell, with factor threshold boundaries (-1.5, -0.5, 0.5, 1.5), zero total exposure, empty asset-class weights, and missing factor inputs.
- F3 and F5 contain additional H formulas compared with the other factor sheets; F5 also contains a K formula. These sheet-specific cells must not be omitted by a shared template implementation.

**Status: shared factor engine exists; formula-by-formula parity remains pending.**