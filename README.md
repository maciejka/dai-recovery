# Dai Recovery

Prototype for verifying Lost DAI recovery eligibility with a deterministic Merkle accumulator and an onchain verifier.

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

Contributor-oriented project structure, command catalog, and pre-PR checks are documented in `AGENTS.md`.

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
