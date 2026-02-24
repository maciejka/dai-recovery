import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..', '..', '..');
const accumulatorPath = resolve(rootDir, 'data', 'accumulator.json');
const deployRunPath = resolve(
  rootDir,
  'modules',
  'foundry',
  'broadcast',
  'DeployRecoveryVerifier.s.sol',
  '31337',
  'run-latest.json',
);

const DEFAULT_LOCAL_RPC_URL = 'http://127.0.0.1:8545';
const DEFAULT_LOCAL_CHAIN_ID = '31337';
const DEFAULT_WALLETCONNECT_PROJECT_ID = '00000000000000000000000000000000';

function fail(message) {
  console.error(message);
  process.exit(1);
}

function parseHex32(value, label) {
  if (typeof value !== 'string' || !/^0x[0-9a-fA-F]{64}$/u.test(value)) {
    fail(`Invalid ${label}: ${String(value)}`);
  }
  return value;
}

function parseAddress(value, label) {
  if (
    typeof value !== 'string' ||
    !/^0x[0-9a-fA-F]{40}$/u.test(value)
  ) {
    fail(`Invalid ${label}: ${String(value)}`);
  }
  return value;
}

async function readJson(path) {
  try {
    const file = await readFile(path, 'utf8');
    return JSON.parse(file);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    fail(`Failed to read ${path}: ${message}`);
  }
}

async function main() {
  const accumulator = await readJson(accumulatorPath);
  const deployRun = await readJson(deployRunPath);

  const merkleRoot = parseHex32(accumulator?.merkle?.root, 'merkle root');
  const verifierAddress = parseAddress(
    deployRun?.returns?.deployed?.value,
    'deployed verifier address',
  );

  const env = {
    ...process.env,
    VITE_CHAIN_ID: process.env.VITE_CHAIN_ID ?? DEFAULT_LOCAL_CHAIN_ID,
    VITE_RPC_URL: process.env.VITE_RPC_URL ?? DEFAULT_LOCAL_RPC_URL,
    VITE_VERIFIER_ADDRESS:
      process.env.VITE_VERIFIER_ADDRESS ?? verifierAddress,
    VITE_MERKLE_ROOT: process.env.VITE_MERKLE_ROOT ?? merkleRoot,
    VITE_WALLETCONNECT_PROJECT_ID:
      process.env.VITE_WALLETCONNECT_PROJECT_ID ??
      DEFAULT_WALLETCONNECT_PROJECT_ID,
  };

  const child = spawn('bun', ['run', '--cwd', 'modules/web', 'build'], {
    cwd: rootDir,
    env,
    stdio: 'inherit',
  });

  child.on('exit', (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }
    process.exit(code ?? 1);
  });
}

await main();
