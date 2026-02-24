#!/usr/bin/env bash
set -euo pipefail

ANVIL_HOST="${ANVIL_HOST:-127.0.0.1}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
ANVIL_CHAIN_ID="${ANVIL_CHAIN_ID:-31337}"
LOCAL_RPC_URL="${LOCAL_RPC_URL:-http://${ANVIL_HOST}:${ANVIL_PORT}}"
ANVIL_START_TIMEOUT_SECONDS="${ANVIL_START_TIMEOUT_SECONDS:-15}"
ANVIL_PID_FILE="${ANVIL_PID_FILE:-/tmp/dai-recovery-anvil.pid}"
ANVIL_LOG_FILE="${ANVIL_LOG_FILE:-/tmp/dai-recovery-anvil.log}"
STARTED_ANVIL=0
ANVIL_PID=""
SCRIPT_SUCCEEDED=0

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
  echo "Reusing existing node."
  echo "Run 'bun run contracts:deploy:local' to deploy verifier."
  SCRIPT_SUCCEEDED=1
  exit 0
fi

cleanup_on_error() {
  if [[ "$SCRIPT_SUCCEEDED" -eq 1 ]]; then
    return
  fi

  if [[ "$STARTED_ANVIL" -eq 1 && -n "$ANVIL_PID" ]] && kill -0 "$ANVIL_PID" >/dev/null 2>&1; then
    kill "$ANVIL_PID" >/dev/null 2>&1 || true
    wait "$ANVIL_PID" 2>/dev/null || true
  fi

  if [[ "$STARTED_ANVIL" -eq 1 ]]; then
    rm -f "$ANVIL_PID_FILE"
  fi
}

trap cleanup_on_error EXIT INT TERM

nohup anvil --host "$ANVIL_HOST" --port "$ANVIL_PORT" --chain-id "$ANVIL_CHAIN_ID" >"$ANVIL_LOG_FILE" 2>&1 &
ANVIL_PID=$!
STARTED_ANVIL=1
echo "$ANVIL_PID" >"$ANVIL_PID_FILE"

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
echo "Local node is running."
echo "Anvil PID: $ANVIL_PID"
echo "Anvil logs: $ANVIL_LOG_FILE"
echo "Run 'bun run contracts:deploy:local' to deploy verifier."
echo "Run 'bun run contracts:local:down' to stop it."
SCRIPT_SUCCEEDED=1
