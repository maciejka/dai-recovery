# Lost DAI Recovery - Implementation Plan

## 1. Scope and Objective
Implement the phase-1 prototype defined in:
- `specs/PRODUCT_SPEC.md`
- `specs/ARCHITECTURE.md`

Target outcome: deterministic Merkle dataset generation, onchain proof verification contract on Sepolia, and UI flow for lookup + verify.

## 2. Preconditions and Decisions (M1)
1. Freeze data schema contract for input rows.
   - Canonical amount field is `amount`.
   - Build validates that `amount` is present and integer-safe.
2. Eligibility rule for zero-amount rows is fixed.
   - Filter out zero-value transfers before aggregation and Merkle leaf generation.
3. Pin toolchain versions and lockfile before implementation.

Deliverables:
- `specs/DECISIONS.md` (finalized schema + zero-amount filtering rule)
- Initial repository scaffold and lockfile

Exit criteria:
- Decisions documented and approved
- Build/test commands reproducible on clean checkout

## 3. Workstream A - Data Pipeline and Artifacts (M2)
### Implementation
1. Build `scripts/build-accumulator.ts`:
   - Read `data/transfers.json` and validate `result.rows[]`.
   - Normalize addresses consistently (lowercase or checksum; pick one and lock it).
   - Parse `amount` as integer-safe (`BigInt`) values.
   - Filter out rows where `amount == 0`.
   - Aggregate `totalLost` by address.
   - Sort address list deterministically.
2. Merkle generation:
   - Leaf: `keccak256(abi.encode(address,uint256))`.
   - Pairing: sorted-pair hashing.
   - Odd handling: duplicate-last.
3. Emit artifacts:
   - `data/accumulator.json`
4. Reproducibility metadata:
   - input SHA-256
   - source input metadata
   - script + runtime versions
   - deterministic generation metadata

### Tests
1. Unit: schema validation, aggregation, deterministic sorting.
2. Crypto vectors: leaf hash, parent hash, odd-node behavior.
3. Determinism: repeated runs produce same root.
4. Negative tests: malformed address, missing amount, non-integer amount.

Exit criteria:
- Artifacts generated from `data/transfers.json`
- Determinism test passes
- `accumulator.json` committed

## 4. Workstream B - Solidity Verifier (M3)
### Implementation
1. Create `contracts/RecoveryVerifier.sol`:
   - immutable `merkleRoot` in constructor
   - `verify(address,uint256,bytes32[]) external view returns (bool)`
   - in-contract sorted-pair Merkle proof verification compatible with standard `MerkleProof.verify` semantics
2. Configure Foundry project and deployment scripts for Sepolia.

### Tests
1. Valid tuple returns `true`.
2. Wrong amount/address/proof returns `false`.
3. Root immutability validated.
4. Cross-check against JS pipeline proofs.

Exit criteria:
- Contract tests green
- Bytecode deployed on Sepolia
- Deployed address + root documented

## 5. Workstream C - UI Lookup and Verify Flow (M4)
### Implementation
1. Build `ui/` app (TypeScript):
   - Manual address input
   - MetaMask connect and autofill
   - Address normalization aligned with pipeline
2. On lookup:
   - resolve entry in `accumulator.json`
   - derive proof path from stored tree levels
   - show `totalLost` + proof
3. Verify action:
   - `eth_call` to Sepolia `verify(account,totalAmount,proof)`
   - clear valid/invalid/error states
4. Network config externalization:
   - `chainId`, `rpcUrl`, `verifierAddress`, `merkleRoot`

### Tests
1. UI lookup success/failure paths.
2. Wallet connect path.
3. Verify action with valid and invalid tuples.
4. Error handling: bad address, wrong network, RPC failure.

Exit criteria:
- Acceptance user flows functional end-to-end against Sepolia verifier

## 6. Workstream D - Reproducibility and Documentation (M5)
1. Create `REPRODUCIBILITY.md`:
   - exact commands to rebuild artifacts
   - expected root + checksum comparison steps
2. Publish short third-party verification checklist.
3. Add CI job:
   - run pipeline
   - validate generated accumulator root and input checksum metadata
   - run contract and UI tests

Exit criteria:
- Independent rebuild reproduces exact Merkle root and matching input checksum metadata
- CI enforces determinism and regression safety

## 7. Milestone Timeline (Suggested)
1. Day 1: M1 decisions + scaffold + lock toolchain
2. Day 2-3: M2 pipeline + artifacts + script tests
3. Day 4: M3 contract + tests + JS/Solidity cross-check
4. Day 5-6: M4 UI implementation + integration tests
5. Day 7: M5 deployment polish + reproducibility docs + demo run

## 8. Definition of Done (Mapped to Spec Acceptance)
1. UI shows amount + proof for eligible address.
2. Sepolia verifier returns valid for correct tuple.
3. Invalid tuple fails verification.
4. Contract root equals generated accumulator Merkle root.
5. Full flow reproducible from versioned input.
6. Third party can reproduce exact Merkle root using documented commands.

## 9. Immediate Next Actions
1. Update `data/transfers.json` (or pre-processing step) to use `amount` key consistently.
2. Scaffold repository structure and initialize TypeScript + Foundry + UI workspaces.
3. Implement `scripts/build-accumulator.ts` first, including strict `amount` validation and zero filtering.
