# Private Assets Master formula audit

- **Formula cells:** 400; cached values: 230; missing cached values: 170.
- **Rows:** 9–48 (40 fund slots); formula columns I, J, AX:BE.
- **Runtime:** `lib/private-assets.ts`, integrated through `lib/master-data.ts`.

## Formula families
- I:J: subclass code to Level 1 / subclass name lookup.
- AX: expected return: target net IRR × realisation factor, else asset-class fallback.
- AY: de-smoothed reported volatility, else asset-class fallback.
- AZ: beta override, else asset-class fallback.
- BA: risk rating plus due-diligence penalty and cap.
- BB: redemption / structure liquidity classification.
- BC: management + performance fee drag approximation.
- BD: domicile-based US-situs flag.
- BE: look-through geography total / validation.

## Verification gaps
- 230 saved values are available; 170 formula cells have no saved cached value and require semantic tests or recalculation.
- Existing tests cover return, volatility, beta, DD risk uplift, cap, fee drag, unknown subclass and blank slots.
- Need coordinate-level parity for all 400 cells and explicit Excel edge cases: zero vs blank inputs, unknown subclass, DD rating boundary, unsupported redemption frequency, geography tolerance boundary, and empty fund ID.
- **Potential discrepancy to resolve:** current implementation returns the target-net-IRR result even when subclass code is unknown, which matches AX formula precedence; confirm downstream output treatment for unknown codes rather than suppressing the calculated return.

**Status: module and tests exist; complete sheet parity not yet evidenced.**