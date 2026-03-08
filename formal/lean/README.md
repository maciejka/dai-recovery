# Lean Verification Scaffold

This directory contains the source-level formal verification work for
`modules/foundry/RecoveryVerifier.sol`.

## Scope

The current scaffold proves properties of the Merkle verifier semantics, not
the compiled bytecode. The goal is to formalize the pure logic shared by:

- `modules/foundry/RecoveryVerifier.sol`
- `modules/shared/src/accumulator.ts`

## Trusted Base

The current proof boundary trusts:

- Solidity source as the implementation under review
- ABI encoding behavior for `abi.encode(address,uint256)`
- packed encoding behavior for `abi.encodePacked(bytes32,bytes32)`
- `keccak256` as the hash/compression primitive

The Lean model treats hashing abstractly and proves structural properties of
proof construction and verification around that abstraction.

## Current Modules

- `DaiRecoveryFormal/Spec.lean`
  Defines the core verifier semantics: `hashPair`, `processProof`, and
  `verify`.
- `DaiRecoveryFormal/Tree.lean`
  Defines a duplicate-last-aware Merkle tree witness model and proves that any
  witnessed proof reconstructs the tree root.
- `DaiRecoveryFormal/Layers.lean`
  Mirrors the flat layer representation used by the TypeScript accumulator,
  including pairwise duplicate-last reduction and index-based proof
  construction.
- `DaiRecoveryFormal/Soundness.lean`
  Captures the conditional soundness boundary: if leaf hashing is injective and
  each proof step is injective for a fixed sibling, two distinct claims cannot
  verify with the same proof.
- `DaiRecoveryFormal/Fixtures.lean`
  Generated sample fixture data derived from `data/accumulator.json`.

## Next Steps

1. Prove that the flat layer model agrees with the duplicate-last tree witness
   model.
2. Prove completeness for generated proofs from the flat representation.
3. Use the generated fixtures to drive additional executable Lean examples.
4. Add `lake build` to CI once the Lean toolchain is available in the
   development environment.

## Local Usage

Install Lean via `elan`, then run:

```bash
bun run formal:lean
```

This repo does not currently include Lean in the base development image, so the
command will fail until the toolchain is installed locally.

The Lean package depends on Mathlib and will fetch it on first build.
