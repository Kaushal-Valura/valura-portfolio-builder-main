# Lists formula audit

- **Formula cells:** 150; cached values: 37; missing cached values: 113.
- **Formula region:** Z4:Z153, dynamically mirrors Product Master IDs from B9:B158.
- **Formula:** blank product ID remains blank; otherwise product ID is copied into the list range.
- **Runtime dependency:** product master records in `data/products.json` and derived master records.

## Verification gaps
- Validate all 150 list slots against the 150 Product Master slots, including 27 populated IDs and 53+ blank positions.
- The workbook's cached results are present for only 37 formulas; blank cache entries must be checked against the corresponding source cell and formula semantics.
- Check ordering, blank propagation and newly added product IDs.

**Status: simple formula mapping identified; runtime list output and slot parity test still required.**