# Structured Notes formula audit

- **Formula cells:** 990; cached values: 834; missing cached values: 156.
- **Rows:** 9–38 (30 term-sheet slots); formula columns H:K and AO:BQ (33 calculated columns per row).
- **Runtime:** `lib/structured-notes.ts`, integrated through `lib/master-data.ts`.

## Formula families
- H:K: structure-type classification, subclass lookup and payoff-family mapping.
- AO:AR: underlying subclass return / volatility / beta / risk assumptions.
- AS: risk-equivalent exposure.
- AT: barrier distance.
- AU: lognormal probability of finishing below barrier.
- AV: maximum principal loss.
- AW: annualised expected return approximation.
- AX:BB: volatility, beta, risk, issuer credit risk and domicile / US-situs mapping.
- BC:BI: factor score derivation / issuer credit adjustment.
- BJ:BQ: scenario payoff mapping for base, bull, bear and tail cases.

## Verification gaps
- 834 saved cached outputs are available; 156 require formula-semantic or recalculated-workbook validation.
- Existing tests cover major payoff families, barrier probability, risk equivalent, tracker fee, issuer adjustment, unsupported types and factor clamping.
- Need all 990 formula coordinates compared, including blanks, missing barrier inputs, zero volatility, zero / negative tenor, missing current level, cap / protection boundaries, issuer rating categories and scenario return edge cases.
- Confirm whether `defaultIncomeCoupon` is used where the workbook formula references the assumptions cell, and whether all note types and issuer rating labels match the workbook validation lists.

**Status: module and tests exist; full formula parity not yet evidenced.**