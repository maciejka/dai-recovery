#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ACCUMULATOR_PATH="$ROOT_DIR/data/accumulator.json"
DEFAULT_LOCAL_RPC_URL="http://127.0.0.1:8545"
DEFAULT_ANVIL_PRIVATE_KEY="0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80"

if [[ ! -f "$ACCUMULATOR_PATH" ]]; then
  echo "Missing $ACCUMULATOR_PATH. Run 'bun run build:merkle' first."
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "'jq' is required for contracts:deploy:local."
  exit 1
fi

MERKLE_ROOT_VALUE="${MERKLE_ROOT:-$(jq -r '.merkle.root' "$ACCUMULATOR_PATH")}"
LOCAL_RPC_URL_VALUE="${LOCAL_RPC_URL:-$DEFAULT_LOCAL_RPC_URL}"
PRIVATE_KEY_VALUE="${PRIVATE_KEY:-$DEFAULT_ANVIL_PRIVATE_KEY}"

if [[ ! "$MERKLE_ROOT_VALUE" =~ ^0x[0-9a-fA-F]{64}$ ]]; then
  echo "Invalid MERKLE_ROOT value: $MERKLE_ROOT_VALUE"
  exit 1
fi

cd "$ROOT_DIR/modules/foundry"
MERKLE_ROOT="$MERKLE_ROOT_VALUE" forge script DeployRecoveryVerifier.s.sol:DeployRecoveryVerifier \
  --rpc-url "$LOCAL_RPC_URL_VALUE" \
  --private-key "$PRIVATE_KEY_VALUE" \
  --broadcast -vvvv
