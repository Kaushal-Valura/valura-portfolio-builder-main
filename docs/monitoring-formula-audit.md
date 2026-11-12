# Monitoring formula audit

## Formula inventory

The Monitoring sheet has 22 formula cells:
- `I6:I20` (15 formulas): traffic-light status for each indicator.
- `E15:E19` (5 formulas): live scenario confidence, blocked lines, review lines, structured-note barrier proximity, and US-situs exposure. `E20` is an advisor-updated drawdown input, not a formula; the 22-cell formula inventory includes E15:E19 and E22:E23 plus 15 status formulas.
- `E22:E23` (2 formulas): counts of RED and AMBER statuses.

## Calculation mapping

- `I6:I20`: if direction is Higher is worse, RED when current >= red threshold, otherwise AMBER when current >= amber threshold, otherwise GREEN. For Lower is worse, comparisons reverse using <=.
- `E15`: Scenario Engine confidence score (live engine output).
- `E16`: count of Portfolio Builder eligibility strings beginning BLOCKED.
- `E17`: count of Portfolio Builder eligibility strings beginning REVIEW.
- `E18`: count of positive portfolio lines with numeric barrier distance below Inputs!D37.
- `E19`: sum of line amounts whose Portfolio Builder US-situs field is Yes.
- `E20`: advisor-maintained drawdown-from-peak input; not calculated by a workbook formula.
- `E22/E23`: COUNTIF of RED / AMBER across I6:I20.

## Backend implementation and correction

The existing portfolio engine calculates all 15 status values and live indicator values from portfolio and scenario outputs. A parity discrepancy was corrected: Monitoring!E19 is a raw US-situs exposure measure from Portfolio Builder column T and must remain populated for a US-person client. It is distinct from the US estate-tax hedge / exposure logic, which is correctly disabled for US persons.

Implementation: `lib/engine.ts`.
Regression coverage: `lib/engine.test.ts`.
- all 15 traffic-light statuses checked against saved workbook cached values;
- E15:E19 live values checked against workbook sample outputs;
- RED and AMBER counts checked against E22:E23;
- US-person test confirms E19 remains populated while the estate-tax hedge is Not needed.

## Scope boundary

The workbook's static market observations, thresholds, directions, action text, sources and event calendar are input data, not formula outputs. Their freshness / source accuracy needs a separate operational data-governance process. No automatic market-data refresh is claimed here.

The sheet is pending the full CI rerun after the correction; do not call it verified until CI passes.
