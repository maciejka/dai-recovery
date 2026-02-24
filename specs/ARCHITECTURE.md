# Lost DAI Recovery Prototype - Architecture

## 1. Scope
This architecture covers phase 1 of the Lost DAI Recovery app:
1. Build a deterministic Merkle accumulator from mistaken DAI transfers.
2. Let users check eligibility by address input or MetaMask.
3. Verify proofs onchain against an immutable root.

Out of scope:
1. Onchain claim/payout logic.
2. Double-claim prevention.

## 2. High-Level Components
1. Data Pipeline (`modules/accumulator/scripts/build-accumulator.ts`)
   - Reads versioned input JSON (`data/transfers.json`).
   - Validates rows and filters to eligible transfers.
   - Aggregates `totalLost` per claimant (`sender` address in input rows).
   - Builds Merkle tree and outputs reproducible artifacts.
2. Smart Contract (`modules/foundry/RecoveryVerifier.sol`)
   - Stores immutable `merkleRoot` in constructor.
   - Exposes `verify(address,uint256,bytes32[]) -> bool`.
   - Uses in-contract sorted-pair Merkle proof verification logic compatible with common `MerkleProof.verify` semantics.
3. Web UI (`modules/web/`)
   - Manual address input and MetaMask connect.
   - Finds amount/proof data from precomputed artifact.
   - Calls verifier contract on the configured chain via `eth_call`.

## 3. Design Constraints (Authoritative in Product Spec)
1. Data eligibility, Merkle construction, and hashing assumptions are defined in `PRODUCT_SPEC.md` section `5.1` through `5.3`.
2. This architecture is constrained to those exact rules and does not redefine them independently.
3. Any future rule change must be updated in `PRODUCT_SPEC.md` first, then reflected here if architecture impact exists.

## 4. Artifacts
1. `data/transfers.json`
   - Canonical source input snapshot.
2. `data/accumulator.json` (runtime + reproducibility artifact)
   - Includes Merkle root/config/tree levels, runtime lookup fields (`addresses`, `amounts`, `leafIndexByAddress`), and build/input metadata.

## 5. Runtime Flow
1. User opens UI.
2. User enters address or connects MetaMask.
3. UI normalizes address and checks artifact membership.
4. If found, UI resolves `totalLost` and proof path (proof is used internally).
5. UI calls contract `verify(account, totalLost, proof)` automatically.
6. UI displays valid/invalid result.

## 6. Environment Strategy
1. Phase 1 network: Sepolia deployment, with Anvil local profile for development/testing.
2. Network config is externalized (`chainId`, `rpcUrl`, `verifierAddress`, `merkleRoot`) and synchronized into `modules/web/.env.local` for active mode.
3. No contract logic change needed to move between local/sepolia/mainnet; only deployment/config changes.

## 7. Prototype-Critical Quality Gates
1. Determinism: repeated builds with same input produce identical root.
2. Cross-check: JS-generated proof verifies on Solidity contract.
3. Reproducibility: third party can recompute root from committed input + script.
4. UX failures handled: invalid address, not in dataset, wrong network, RPC/contract call failure.

## 8. Minimal Tech Stack
1. TypeScript for pipeline and UI.
2. Solidity for verifier contract.
3. `viem` (and optional `wagmi`) for wallet/contract interaction.
4. Configured RPC provider (Sepolia or local Anvil) for verification calls.
5. Foundry for solidity development
