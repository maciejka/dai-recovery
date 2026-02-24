#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../.." && pwd)"
ANVIL_HOST="${ANVIL_HOST:-127.0.0.1}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
ANVIL_CHAIN_ID="${ANVIL_CHAIN_ID:-31337}"
LOCAL_RPC_URL="${LOCAL_RPC_URL:-http://${ANVIL_HOST}:${ANVIL_PORT}}"
ANVIL_START_TIMEOUT_SECONDS="${ANVIL_START_TIMEOUT_SECONDS:-15}"
ANVIL_PID_FILE="${ANVIL_PID_FILE:-/tmp/dai-recovery-anvil.pid}"

if ! command -v anvil >/dev/null 2>&1; then
  echo "'anvil' is required for contracts:local:up. Install Foundry first."
  exit 1
fi

json_rpc_ping() {
  curl -fs \
    -H 'content-type: application/json' \
    --data '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' \
    "$LOCAL_RPC_URL" >/dev/null 2>&1
}

if json_rpc_ping; then
  echo "Anvil RPC already reachable at $LOCAL_RPC_URL."
  echo "Reusing existing node and deploying verifier..."
  LOCAL_RPC_URL="$LOCAL_RPC_URL" bash "$ROOT_DIR/modules/foundry/scripts/deploy-local.sh"
  echo "Deployment complete against existing local node."
  exit 0
fi

ANVIL_LOG_FILE="$(mktemp -t dai-recovery-anvil.XXXXXX.log)"
anvil --host "$ANVIL_HOST" --port "$ANVIL_PORT" --chain-id "$ANVIL_CHAIN_ID" >"$ANVIL_LOG_FILE" 2>&1 &
ANVIL_PID=$!
echo "$ANVIL_PID" >"$ANVIL_PID_FILE"

cleanup() {
  if kill -0 "$ANVIL_PID" >/dev/null 2>&1; then
    kill "$ANVIL_PID" >/dev/null 2>&1 || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi
  rm -f "$ANVIL_PID_FILE"
}

trap cleanup EXIT INT TERM

max_attempts=$((ANVIL_START_TIMEOUT_SECONDS * 4))
for _ in $(seq 1 "$max_attempts"); do
  if ! kill -0 "$ANVIL_PID" >/dev/null 2>&1; then
    echo "Anvil process exited before RPC became ready."
    echo "Anvil logs:"
    tail -n 80 "$ANVIL_LOG_FILE" || true
    exit 1
  fi

  if json_rpc_ping; then
    break
  fi
  sleep 0.25
done

if ! json_rpc_ping; then
  echo "Anvil did not become ready at $LOCAL_RPC_URL in ${ANVIL_START_TIMEOUT_SECONDS}s."
  echo "Anvil logs:"
  tail -n 80 "$ANVIL_LOG_FILE" || true
  exit 1
fi

echo "Anvil started at $LOCAL_RPC_URL (chain id: $ANVIL_CHAIN_ID)"
LOCAL_RPC_URL="$LOCAL_RPC_URL" bash "$ROOT_DIR/modules/foundry/scripts/deploy-local.sh"

echo "Local node is running."
echo "Press Ctrl+C to stop Anvil."
wait "$ANVIL_PID"
