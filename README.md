# Dai Recovery

Prototype for verifying Lost DAI recovery eligibility with a deterministic Merkle accumulator and an onchain verifier.

- Site: [maciejka.github.io/dai-recovery](https://maciejka.github.io/dai-recovery/)
- Dune dashboard: [Lost DAI](https://dune.com/aundumla/lost-dai?utm_source=share&utm_medium=copy&utm_campaign=dashboard)

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

## Accumulator Construction and Verification

This section describes how the accumulator is built and how proofs are checked.

Construction pipeline (`bun run build:merkle`):
1. Query transfer rows in Dune using `data/transafers.sql`, then export that query result to `data/transfers.json`.
2. Load `data/transfers.json` and read `result.rows`.
3. Validate every row (`sender` must be a valid address, `amount` must be a non-negative integer).
4. Filter out rows with `amount = 0`.
5. Require `synced_date`, `synced_hash`, and `synced_block_number` to match across all rows.
6. Aggregate repeated addresses into one `totalLost` value per address.
7. Normalize addresses and sort claims lexicographically for stable ordering.
8. Build leaf hashes as `keccak256(abi.encode(address, uint256))`.
9. Build parent nodes using sorted-pair hashing (`keccak256(abi.encodePacked(min(a,b), max(a,b)))`), duplicating the last node on odd-width levels.
10. Write `data/accumulator.json` with:
   - `merkle.root` and full `merkle.treeLevels`
   - `claims.addresses`, `claims.amounts`, and `claims.leafIndexByAddress`
   - Build provenance (`input sha256`, row counters, `totalAmount`, `synced_*` fields, runtime info)

How that artifact is used:
- Deployment injects `merkle.root` into `RecoveryVerifier` constructor as immutable `merkleRoot`.
- The UI loads `accumulator.json`, maps a wallet address to its leaf index, derives its Merkle proof from `treeLevels`, and calls `verify(account, totalAmount, proof)`.
- The contract recomputes `leaf = keccak256(abi.encode(account, totalAmount))`, processes the sorted proof, and returns `true` only when the result equals the stored root.
- The UI also rejects verification when configured root and artifact root differ.

How lost amounts are verified for a wallet:
1. The app normalizes an address and looks it up in `claims.leafIndexByAddress`.
2. If an index exists, the app reads `claims.amounts[index]` as the wallet's aggregated lost amount.
3. The app derives the Merkle proof from `merkle.treeLevels` and that index.
4. The app calls `RecoveryVerifier.verify(address, aggregatedAmount, proof)`.
5. `true` means that exact `(address, aggregatedAmount)` tuple is included under the deployed root; `false` means it is not.

Implementation and test anchors:
- Shared deterministic builder: `modules/shared/src/accumulator.ts`
- Onchain verifier: `modules/foundry/RecoveryVerifier.sol`
- Shared unit tests: `modules/shared/test/accumulator.test.ts`
- Dataset-wide proof and artifact-freshness tests: `modules/shared/test/accumulator.dataset.test.ts`
- Solidity dataset-wide proof verification tests: `modules/foundry/RecoveryVerifier.t.sol`

## CI

Continuous integration runs via:
- `.github/workflows/ci.yml`

Current CI coverage:
- `bun run build:merkle`
- `bun run qa`
- `bun run ui:typecheck`
- `bun run ui:test`
- `bun run contracts:test`

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
- [maciejka.github.io/dai-recovery](https://maciejka.github.io/dai-recovery/)
