# Product Master — Add Product workflow

## Scope

This feature adds public products to the Product Master catalogue. It does not change the workbook or the existing static master records.

## User-entered fields

The form captures independent Product Master fields only:

- Identification: product name, product type, ticker / ISIN.
- Classification: Level 2 sub-asset class, Level 3 / strategy.
- Geography: primary geography and US / India / rest-of-world look-through percentages.
- Currency and tags: currency, underlying currency, sector / industry, segment, style, domicile.
- Manager and economics: manager / issuer, expense ratio, fund AUM.
- Access and liquidity: liquidity, lock-up / term, minimum investment, accredited-only, distribution channel, Valura platform access.
- Bond / fixed-maturity conditional fields: bond issuer, credit rating, coupon, maturity, yield to maturity, modified duration and seniority.
- Optional overrides: expected return, volatility, beta, risk rating and four scenario returns.
- Optional metadata: three tags and notes.
- US situs override is optional; leaving it blank means use the workbook domicile rule.

Product ID is generated as the next available P### identifier.

## Backend-derived fields

The API at `POST /api/products` validates the inputs and calls the existing Product Master formula port. It calculates:

| Excel column | Output | Rule |
|---|---|---|
| G | Asset class (Level 1) | Level 2 code lookup in Asset Class Master |
| H | Sub-asset class name | Level 2 code lookup in Asset Class Master |
| U | US situs | Explicit override, otherwise US domicile rule |
| AT | Expected return | Return override, otherwise bond YTM less workbook credit-loss adjustment, otherwise asset-class default |
| AU | Volatility | Volatility override, otherwise asset-class default |
| AV | Beta | Beta override, otherwise asset-class default |
| AW | Risk rating | Risk override, otherwise asset-class default |
| AX | Look-through check | US + India + rest-of-world must equal 100% |

The form requires the three geography weights to total 100% (with a 0.1 percentage-point tolerance). Bond-specific fields are required only for Bond and Fixed maturity plan types. Duplicate names and tickers / ISINs are rejected. Dropdown values are allowlisted and numeric fields are checked for finite values and workbook-appropriate ranges. Persisted browser records are revalidated before being restored, including generated ID shape and finite model outputs.

All entered form values are also stored under `product.productMasterFields`; formula dependencies are stored in the raw Product Master input record; derived outputs are stored on the runtime product record.

## Runtime integration

- New products are added to the live `data.products` array.
- The Builder product catalogue receives them immediately.
- The Builder now hides products with Valura platform access set to No, accreditation restrictions that the client does not meet, or a minimum ticket above the client's available amount.
- Manual add / drag-and-drop selections are resolved by product ID in the existing portfolio analysis engine, so the return, volatility, beta, risk, geography and eligibility calculations use the newly derived values.
- Saved additions are reloaded and re-derived from raw inputs on the next visit.

## Persistence boundary

This repository has no configured database, database credentials, or shared product API. The current implementation persists additions in browser `localStorage` under `valura:custom-public-products:v1`. This is device/browser scoped and is not shared across advisors or browsers. The server API performs validation and formula calculation but does not write to a shared database. A database adapter is a separate follow-up once the target database is selected and configured.

## Known optimiser boundary

The existing optimiser uses its own static universe in `data/optimiser.json` and does not yet construct factor loadings for newly added products. New products are available for manual catalogue selection and live portfolio calculations, but they are not automatically eligible for the Optimise recommendation until a product-to-optimiser-risk mapping is designed.

## Tests

`lib/product-catalog.test.ts` covers ID generation, formula-derived outputs, percentage normalization, zero overrides, bond YTM adjustment and return precedence, situs override precedence, required fields, duplicate checks, geography validation, dropdown and numeric boundaries, and persisted-record integrity. `lib/builder.test.ts` covers platform access, accreditation and minimum-ticket eligibility. Both are included in `npm test`.
