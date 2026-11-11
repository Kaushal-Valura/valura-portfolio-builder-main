# Valura Portfolio Builder

A web app for building client portfolios. The advisor enters the client and the investment amount, sets the client's wishes on the lever desk and presses **Optimise**: the optimiser decides the allocation and fills the builder, and the advisor can then drag, resize or remove lines. Eligibility, mandate, risk, scenarios, next best actions, hedges, monitoring and the client summary all recalculate live.

## Run it

Needs Node.js 20 or newer (`node -v` to check). Nothing else: no database, no API keys, no environment variables. All data ships in `data/`.

```bash
git clone <repo-url>
cd valura-portfolio-builder
npm install
npm run dev        # open http://localhost:3000
```

Press **Load sample client** in the top bar to see a filled-in portfolio straight away.

Other commands:

```bash
npm test           # engine, builder and optimiser checks
npm run build      # production build
npm start          # serve the production build on http://localhost:3000
```


## Portfolio Builder allocation rules

- **Optimise** uses the product universe and factor model in `data/optimiser.json`: proxy return histories feed the covariance model; house capital-market assumptions, Black-Litterman views, advisor levers and portfolio constraints feed the expected-return and weight calculation. The solver targets the selected annual volatility; it is not a fixed asset-class percentage recipe.
- **Product facts** shown in the catalogue come from `data/products.json`. The `ret`, `vol`, `beta`, `risk`, fee, yield, domicile, liquidity, eligibility and geography fields are configured data. They are not live quotes. The assumptions file documents the house-proxy methodology and flags illustrative placeholders. Validate product terms and market inputs before client execution.
- **Manual selection** splits an active sleeve's target dollars equally across its selected products. Adding a second product to a 20% sleeve changes the two default allocations to 10% each; the advisor can then edit either amount or percentage.
- **Budget guard** clamps a manual amount edit to the remaining client budget, so total selected amounts cannot exceed the initial investment.
- **Removing the last product** in a sleeve deactivates that sleeve and redistributes its target proportionally among the remaining active sleeves. The inactive sleeve is hidden and can be restored with its `Add` control. Restoring a sleeve shares the portfolio target equally across active sleeves.
- **Product filters** include source, asset class, and India look-through exposure. Products already held in the portfolio are excluded from the available catalogue.

## Layout

- `app/`, `components/`: the UI (Next.js, Tailwind, recharts, dnd-kit). The page is a single 8-step flow: client, build, why this mix, risk, scenarios, actions and hedges, monitoring, client summary.
- `lib/engine.ts`: one pure `analyse(client, lines, data)` function that computes everything the screens show.
- `lib/builder.ts`: the Builder's add / remove / edit / Optimise rules.
- `lib/optimiser.ts`: the optimiser (Ledoit-Wolf factor covariance, Black-Litterman returns, ADMM solve to a target volatility).
- `data/`: products, sub-classes, assumptions, optimiser inputs, the sample client and the test cases in `parity.json`.
- `lib/*.test.ts`: `engine.test.ts` and `parity.test.ts` check the engine against recorded results for the sample client and 21 test portfolios; `builder.test.ts` checks that any sequence of edits gives the same numbers as building the final portfolio from scratch; `optimiser.test.ts` compares against the original prototype and skips when that file is not present (it is not in this repo).

Not in v1: live Scenario Engine signal blending (final probabilities are imported, and the advisor can override them), saved clients, an AI agent, and the prototype's own report views (frontier, Monte Carlo, shock lab).
