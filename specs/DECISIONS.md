# Workstream A Decisions

## 1. Amount Field
- Canonical transfer amount key is `amount`.
- Pipeline validates `rows[].amount` as a non-negative integer value (string, bigint, or safe integer number).

## 2. Zero-Amount Handling
- `amount == 0` rows are excluded from eligibility.
- Excluded rows are counted in build stats and emitted in `accumulator.json` metadata.

## 3. Address Normalization
- Addresses are validated with EVM format checks and normalized to lowercase canonical form.
- Aggregation key and all output artifacts use this normalized lowercase address.

## 4. Merkle Configuration
- Leaf: `keccak256(abi.encode(address,uint256))`
- Pairing: sorted-pair hashing
- Odd-node handling: duplicate-last
