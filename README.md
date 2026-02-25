# Dai Recovery

Prototype for verifying Lost DAI recovery eligibility with a deterministic Merkle accumulator and an onchain verifier.

Source-of-truth specs:
- `specs/PRODUCT_SPEC.md`
- `specs/ARCHITECTURE.md`
- `specs/DECISIONS.md`

## Prerequisites

- Bun `1.3.x`
- Foundry (`forge`, `cast`, `anvil`)
- Node.js (used by some helper scripts)
- `jq` (required by local deploy script)

## Setup

Install dependencies:

```bash
bun install --frozen-lockfile
bun install --frozen-lockfile --cwd modules/web
```

## Project Layout

- `modules/shared/src/accumulator.ts` deterministic accumulator implementation
- `modules/accumulator/scripts/build-accumulator.ts` accumulator build entrypoint
- `modules/foundry/` Solidity verifier + tests + deploy scripts
- `modules/web/` Vite frontend
- `data/transfers.json` input snapshot
- `data/accumulator.json` generated artifact (gitignored)

## Core Commands

- `bun run build:merkle` rebuild `data/accumulator.json`
- `bun run contracts:build` compile contracts
- `bun run contracts:test` run Solidity tests
- `bun run contracts:deploy:local` deploy verifier to local Anvil RPC
- `bun run contracts:deploy:sepolia` deploy verifier to Sepolia
- `bun run contracts:local:up` start or reuse local Anvil
- `bun run contracts:local:down` stop Anvil started by this repo
- `bun run ui:env:anvil` generate `modules/web/.env.local` for local mode
- `bun run ui:env:sepolia` validate `modules/web/.env.sepolia` exists
- `bun run ui:dev` run frontend in Sepolia mode
- `bun run ui:dev:local` run frontend in local Anvil mode
- `bun run ui:build` build frontend in Sepolia mode
- `bun run ui:build:local` build frontend in local Anvil mode
- `bun run qa` format/lint/typecheck/test gate for TS packages

## Local End-to-End

```bash
bun run build:merkle
bun run contracts:local:up
bun run contracts:deploy:local
bun run ui:dev:local
```

## Sepolia Deployment

1. Rebuild accumulator and export deploy env:

```bash
bun run build:merkle
export MERKLE_ROOT="$(jq -r '.merkle.root' data/accumulator.json)"
export SEPOLIA_RPC_URL="https://sepolia.infura.io/v3/<YOUR_PROJECT_ID>"
export PRIVATE_KEY="0x<DEPLOYER_PRIVATE_KEY>"
```

2. Deploy:

```bash
bun run contracts:deploy:sepolia
```

3. Update frontend config in `modules/web/.env.sepolia`:
- `VITE_VERIFIER_ADDRESS` to the deployed address
- `VITE_MERKLE_ROOT` to the deployed root (should match `data/accumulator.json`)
- `VITE_RPC_URL` to a browser-friendly Sepolia RPC

4. Run the app:

```bash
bun run ui:dev
```

## GitHub Pages

Pages is deployed via GitHub Actions workflow:
- `.github/workflows/deploy-pages.yml`

Behavior:
- Runs on pushes to `main`
- Builds frontend with `VITE_BASE_PATH=/dai-recovery/`
- Publishes `modules/web/dist` to Pages

Site URL:
- `https://maciejka.github.io/dai-recovery/`

## Recommended Pre-PR Checks

```bash
bun run qa
bun run build:merkle
bun run ui:typecheck
bun run ui:test
```
