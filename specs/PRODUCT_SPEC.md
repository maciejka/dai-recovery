# Lost DAI Recovery Prototype - Product Specification

## 1. Overview
This prototype helps users check whether they are eligible to recover DAI accidentally sent to the DAI token contract address, using a Merkle-accumulator-based claims dataset.

The prototype has three components:
1. A data pipeline script that reads a JSON list of mistaken transfers and builds an address-level aggregated Merkle accumulator.
2. A Solidity verifier contract deployed to Sepolia that validates Merkle proofs against an immutable root set in the constructor.
3. A web UI that lets users either paste an Ethereum address or connect a wallet, then fetches and displays the precomputed aggregate amount and Merkle proof path for that address.

## 2. Goals
1. Prove that an address and total lost amount can be verified onchain with a Merkle proof.
2. Provide a user flow for lookup by manual address entry and wallet connection.
3. Keep recovery logic simple for phase 1: proof verification only (no DAI transfers yet).
4. Deploy the verifier contract on Sepolia for phase 1 and connect the UI to it.
5. Make Merkle accumulator construction independently reproducible and auditable by third parties.
6. Keep architecture deployment-ready for Ethereum mainnet in later phases.

## 3. Non-Goals (Phase 1)
1. No onchain DAI transfer or claim payout logic.
2. No admin dashboard.
3. No indexing backend required at runtime.
4. No support for multiple chains in one deployment.

## 4. Users and Core User Stories
1. As a user, I can paste an Ethereum address and see whether it exists in the recovery dataset.
2. As a user, I can connect my wallet and auto-check the connected address.
3. As a user, I can see the aggregated amount of lost DAI assigned to my address.
4. As a user, I can verify (via contract call) that my address + amount + proof is valid against the fixed Merkle root.

## 5. Functional Requirements

### 5.1 Data Input
1. Prototype input source is versioned snapshot `data/transfers.json`.
2. File format is JSON with transfer rows read from `result.rows[]`.
3. Each row must minimally contain:
   - `sender` (claimant address)
   - `amount` (raw token amount, integer base units)
   - Optional metadata: `tx_hash`, `date`
4. Eligibility must include only successful ERC-20 `Transfer` events where `to` equals the DAI token contract address on Ethereum mainnet (`0x6B175474E89094C44Da98b954EedeAC495271d0F`), with claimant address mapped from row `sender`.
5. Script must normalize addresses to checksum or lowercase consistently.

### 5.2 Aggregation
1. Group all records by address.
2. Sum amounts per address to compute `totalLost`.
3. Amounts are stored as raw base units (`uint256` semantics) in generated artifacts.
4. Output deterministic aggregated list sorted by address ascending (or explicit deterministic rule).

### 5.3 Merkle Accumulator
1. Build leaves from `(address, totalLost)` pairs.
2. Recommended leaf hash:
   - `leaf = keccak256(abi.encode(address, totalLost))`
3. Tree mode is fixed to sorted-pair hashing:
   - `parent = keccak256(min(childA, childB) || max(childA, childB))`
   - This keeps proofs direction-agnostic and aligns with OpenZeppelin `MerkleProof.verify`.
4. Odd-node handling is fixed to `duplicate_last`:
   - when a level has an unpaired node `X`, compute parent as `keccak256(min(X, X) || max(X, X))`.
   - this rule must be used consistently in script, artifacts, and proof generation.
5. Output artifacts:
   - `accumulator.json`: runtime artifact + reproducibility metadata (amount + index mapping + full tree data required to derive proof, plus build metadata)

### 5.4 UI
1. Input mode A: manual ETH address entry.
2. Input mode B: MetaMask wallet connect (connected address auto-filled).
3. On lookup:
   - find address in `accumulator.json`
   - show `totalLost` and derived Merkle proof path
   - indicate if address not found
4. Add “Verify on Sepolia” action:
   - calls verifier contract via `eth_call` to proof-check function
   - displays valid/invalid result

### 5.5 Smart Contract (Phase 1)
1. Constructor argument sets immutable `merkleRoot`.
2. Expose proof verification function, e.g.:
   - `function verify(address account, uint256 totalAmount, bytes32[] calldata proof) external view returns (bool)`
3. Verification uses OpenZeppelin `MerkleProof` utility (or equivalent audited implementation).
4. Onchain verifier and offchain generator must use identical hashing assumptions:
   - leaf encoding: `abi.encode(address,uint256)`
   - hash: `keccak256`
   - pair mode: `sorted-pair`
   - odd handling: `duplicate_last`
5. No token transfer and no claim-state tracking in phase 1.

### 5.6 Deployment
1. Deploy verifier contract to Sepolia for the initial prototype phase.
2. Store deployed contract address and root in frontend config.
3. Publish frontend to a static host.
4. Deployment configuration must support network-specific values (chain id, contract address, RPC) so the same app can later be deployed to Ethereum mainnet with no contract logic changes.

### 5.7 Third-Party Verifiability
1. Accumulator build process must be fully reproducible from versioned source input and committed script.
2. Repository must include a short verification guide with exact commands to rebuild artifacts from scratch.
3. Generated `accumulator.json` must include metadata needed for auditability:
   - source input file
   - deterministic build configuration (`leafEncoding`, hashing algorithm, pairing mode)
   - input file checksum (SHA-256)
   - script/tooling version metadata
4. Third parties must be able to recompute the same root from the same input and confirm root equality.

## 6. Technical Design

### 6.1 Data Pipeline Flow
1. Use `data/transfers.json` as the versioned input snapshot.
2. Read and validate `result.rows[]` records from the input payload.
3. Run script (TypeScript is acceptable/preferred):
   - validate schema
   - map `sender -> claimantAddress` and parse `amount`
   - aggregate amounts by address
   - build Merkle tree
   - generate `accumulator.json` runtime artifact for lookup/proof derivation + reproducibility metadata
4. Commit generated artifact.

### 6.2 Recommended Project Artifacts
1. `data/transfers.json` - prototype input snapshot from query output.
2. `scripts/build-accumulator.ts` - aggregation + tree builder.
3. `data/accumulator.json` - runtime dataset for UI lookups/proof derivation + build metadata/checksums.
4. `contracts/RecoveryVerifier.sol` - Solidity verifier.
5. `ui/` - frontend app.
6. `REPRODUCIBILITY.md` - third-party verification instructions and expected outputs.

### 6.3 Determinism Requirements
1. Address normalization strategy must be fixed.
2. Amount type must be integer string or BigInt-safe handling.
3. Hashing encoding must be fixed and tested.
4. Tree construction mode must be fixed and tested.
5. Regeneration with same input must produce same root.
6. Script runtime and dependency versions must be pinned (lockfile committed).
7. Input checksum must be recorded and validated during build.

## 7. API/Interface Contracts

### 7.1 accumulator.json shape (example)
```json
{
  "specVersion": "phase1-v1",
  "generatedAt": "2026-02-24T00:00:00Z",
  "source": {
    "inputFile": "transfers.json"
  },
  "merkle": {
    "root": "0x...",
    "leafEncoding": "abi.encode(address,uint256)",
    "hash": "keccak256",
    "pairing": "sorted",
    "oddHandling": "duplicate_last",
    "treeLevels": [["0xleaf..."], ["0xroot..."]]
  },
  "claims": {
    "addresses": ["0x1234...abcd"],
    "amounts": ["2500000000000000000"],
    "leafIndexByAddress": {
      "0x1234...abcd": 0
    }
  },
  "build": {
    "script": {
      "file": "scripts/build-accumulator.ts",
      "packageVersion": "0.1.0"
    },
    "runtime": {
      "bun": "1.3.6",
      "node": "v24.3.0",
      "platform": "linux",
      "arch": "x64"
    },
    "input": {
      "file": "/abs/path/data/transfers.json",
      "sha256": "0x...",
      "totalRows": 894,
      "includedRows": 822,
      "excludedZeroAmountRows": 72,
      "uniqueAddresses": 582
    }
  }
}
```

## 8. Security and Integrity
1. Immutable root in constructor prevents silent dataset mutation.
2. Script must reject malformed addresses and negative/non-integer amounts.
3. Add unit tests for known test vectors (leaf, proof, root).
4. UI should clearly state that phase 1 is verification only (no funds moved).

## 9. Testing Strategy

### 9.1 Script Tests
1. Aggregation correctness for duplicate addresses.
2. Root determinism on repeated runs.
3. Proof correctness for included and excluded addresses.
4. Reproducibility test: clean-environment rebuild reproduces identical root and input checksum metadata.

### 9.2 Contract Tests
1. Valid proof returns `true`.
2. Wrong amount/address/proof returns `false`.
3. Root immutability tested after deployment.
4. Cross-check tests confirm JS-generated proofs verify onchain with the exact tree config (`sorted-pair`, `duplicate_last`).

### 9.3 UI Tests
1. Manual address lookup success/failure.
2. Wallet connect path.
3. Verify button surfaces onchain validation result.

## 10. Milestones
1. M1: Finalize input schema and Merkle spec.
2. M2: Implement script and generate artifacts.
3. M3: Implement and test Solidity verifier.
4. M4: Build UI lookup + wallet connect + verify call.
5. M5: Deploy to Sepolia and run end-to-end demo.
6. M6: Prepare and execute Ethereum mainnet deployment (post-prototype phase).

## 11. Acceptance Criteria (Prototype)
1. Given an eligible address, UI shows aggregated amount and proof.
2. UI verification call to Sepolia contract returns valid for correct tuple.
3. Invalid tuple fails verification.
4. Contract root matches generated artifact root.
5. Full flow reproducible from versioned input JSON.
6. Independent third party can follow documented steps and reproduce the exact same Merkle root.

## 12. Phase 2 Preview (Out of Scope Now)
1. Add onchain claim function with DAI payout.
2. Add double-claim prevention mapping.
3. Add claim event indexing and status UI.
4. Deploy verification/recovery stack to Ethereum mainnet.
