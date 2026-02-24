#!/usr/bin/env bash
set -euo pipefail

ANVIL_PID_FILE="${ANVIL_PID_FILE:-/tmp/dai-recovery-anvil.pid}"

if [[ ! -f "$ANVIL_PID_FILE" ]]; then
  echo "No Anvil PID file found at $ANVIL_PID_FILE."
  echo "If Anvil is running outside contracts:local:up, stop it manually."
  exit 0
fi

ANVIL_PID="$(cat "$ANVIL_PID_FILE")"
if [[ -z "$ANVIL_PID" || ! "$ANVIL_PID" =~ ^[0-9]+$ ]]; then
  echo "Invalid PID file content in $ANVIL_PID_FILE."
  rm -f "$ANVIL_PID_FILE"
  exit 1
fi

if ! kill -0 "$ANVIL_PID" >/dev/null 2>&1; then
  echo "No running process found for PID $ANVIL_PID. Removing stale PID file."
  rm -f "$ANVIL_PID_FILE"
  exit 0
fi

PROCESS_NAME="$(ps -p "$ANVIL_PID" -o comm= | tr -d ' ')"
if [[ "$PROCESS_NAME" != "anvil" ]]; then
  echo "PID $ANVIL_PID is '$PROCESS_NAME', not 'anvil'. Refusing to stop it."
  exit 1
fi

kill "$ANVIL_PID" >/dev/null 2>&1 || true
for _ in $(seq 1 40); do
  if ! kill -0 "$ANVIL_PID" >/dev/null 2>&1; then
    rm -f "$ANVIL_PID_FILE"
    echo "Stopped Anvil (PID $ANVIL_PID)."
    exit 0
  fi
  sleep 0.1
done

echo "Anvil (PID $ANVIL_PID) did not stop in time."
exit 1
