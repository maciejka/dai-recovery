import { createHash } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import { basename, resolve } from 'node:path';
import {
  encodeAbiParameters,
  encodePacked,
  getAddress,
  isAddress,
  keccak256,
  type Hex,
} from 'viem';

const LEAF_ENCODING = 'abi.encode(address,uint256)';
const HASH_ALGORITHM = 'keccak256';
const PAIRING_MODE = 'sorted';
const ODD_HANDLING = 'duplicate_last';
const DEFAULT_SPEC_VERSION = 'phase1-v1';

type Address = `0x${string}`;

export interface RawTransferRow {
  sender: unknown;
  amount: unknown;
  tx_hash?: unknown;
  date?: unknown;
  synced_date?: unknown;
  synced_hash?: unknown;
  synced_block_number?: unknown;
  [key: string]: unknown;
}

export interface EligibleTransfer {
  sender: Address;
  amount: bigint;
  txHash?: string;
  date?: string;
}

export interface ClaimEntry {
  address: Address;
  totalLost: bigint;
}

export interface BuildStats {
  totalRows: number;
  includedRows: number;
  excludedZeroAmountRows: number;
  uniqueAddresses: number;
}

export interface MerkleData {
  leaves: Hex[];
  treeLevels: Hex[][];
  merkleRoot: Hex;
  leafIndexByAddress: Record<Address, number>;
  proofsByAddress: Record<Address, Hex[]>;
}

export interface ComputedBuild {
  claims: ClaimEntry[];
  merkle: MerkleData;
  stats: BuildStats;
  syncedInput: SyncedInputMetadata;
  totalAmount: bigint;
}

export interface SyncedInputMetadata {
  synced_date: string;
  synced_hash: string;
  synced_block_number: number;
}

export interface BuildArtifactsOptions {
  inputPath: string;
  outputDir: string;
  generatedAt?: string;
  specVersion?: string;
}

export interface BuildArtifactsResult {
  merkleRoot: Hex;
  claimsCount: number;
  outputDir: string;
  files: {
    accumulator: string;
  };
  stats: BuildStats;
}

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256Hex(content: string | Uint8Array): string {
  const hash = createHash('sha256').update(content).digest('hex');
  return `0x${hash}`;
}

function parseNonNegativeInteger(value: unknown, fieldPath: string): bigint {
  if (typeof value === 'bigint') {
    invariant(value >= 0n, `${fieldPath} must be non-negative`);
    return value;
  }

  if (typeof value === 'number') {
    invariant(Number.isInteger(value), `${fieldPath} must be an integer`);
    invariant(Number.isSafeInteger(value), `${fieldPath} number is not safe`);
    invariant(value >= 0, `${fieldPath} must be non-negative`);
    return BigInt(value);
  }

  invariant(typeof value === 'string', `${fieldPath} must be a string`);
  invariant(
    /^\d+$/.test(value),
    `${fieldPath} must be a non-negative integer string`,
  );

  return BigInt(value);
}

function normalizeAddress(value: unknown, fieldPath: string): Address {
  invariant(typeof value === 'string', `${fieldPath} must be a string`);
  invariant(isAddress(value), `${fieldPath} is not a valid Ethereum address`);

  return getAddress(value).toLowerCase() as Address;
}

export function extractRows(payload: unknown): RawTransferRow[] {
  invariant(
    typeof payload === 'object' && payload !== null,
    'Input JSON must be an object',
  );
  const result = (payload as { result?: unknown }).result;
  invariant(
    typeof result === 'object' && result !== null,
    'Input JSON missing result object',
  );

  const rows = (result as { rows?: unknown }).rows;
  invariant(Array.isArray(rows), 'Input JSON missing result.rows array');

  return rows as RawTransferRow[];
}

export function normalizeEligibleTransfers(rows: RawTransferRow[]): {
  transfers: EligibleTransfer[];
  stats: Omit<BuildStats, 'uniqueAddresses'>;
} {
  const transfers: EligibleTransfer[] = [];
  let excludedZeroAmountRows = 0;

  for (let index = 0; index < rows.length; index += 1) {
    const row = rows[index];
    invariant(
      typeof row === 'object' && row !== null,
      `rows[${index}] must be an object`,
    );

    const sender = normalizeAddress(row.sender, `rows[${index}].sender`);
    const amount = parseNonNegativeInteger(row.amount, `rows[${index}].amount`);

    if (amount === 0n) {
      excludedZeroAmountRows += 1;
      continue;
    }

    const txHash = typeof row.tx_hash === 'string' ? row.tx_hash : undefined;
    const date = typeof row.date === 'string' ? row.date : undefined;

    transfers.push({ sender, amount, txHash, date });
  }

  return {
    transfers,
    stats: {
      totalRows: rows.length,
      includedRows: transfers.length,
      excludedZeroAmountRows,
    },
  };
}

function parseSyncedInputMetadata(
  row: RawTransferRow,
  rowIndex: number,
): SyncedInputMetadata {
  const dateFieldPath = `rows[${rowIndex}].synced_date`;
  invariant(
    typeof row.synced_date === 'string' && row.synced_date.length > 0,
    `${dateFieldPath} must be a non-empty string`,
  );

  const hashFieldPath = `rows[${rowIndex}].synced_hash`;
  invariant(
    typeof row.synced_hash === 'string' && row.synced_hash.length > 0,
    `${hashFieldPath} must be a non-empty string`,
  );

  const blockFieldPath = `rows[${rowIndex}].synced_block_number`;
  const syncedBlockNumber = parseNonNegativeInteger(
    row.synced_block_number,
    blockFieldPath,
  );
  invariant(
    syncedBlockNumber <= BigInt(Number.MAX_SAFE_INTEGER),
    `${blockFieldPath} number is not safe`,
  );

  return {
    synced_date: row.synced_date,
    synced_hash: row.synced_hash,
    synced_block_number: Number(syncedBlockNumber),
  };
}

export function extractSyncedInputMetadata(
  rows: RawTransferRow[],
): SyncedInputMetadata {
  invariant(rows.length > 0, 'Input JSON result.rows array must not be empty');

  const firstRow = rows[0];
  invariant(
    typeof firstRow === 'object' && firstRow !== null,
    'rows[0] must be an object',
  );
  const expected = parseSyncedInputMetadata(firstRow, 0);

  for (let index = 1; index < rows.length; index += 1) {
    const row = rows[index];
    invariant(
      typeof row === 'object' && row !== null,
      `rows[${index}] must be an object`,
    );
    const current = parseSyncedInputMetadata(row, index);

    invariant(
      current.synced_date === expected.synced_date,
      `rows[${index}].synced_date must match rows[0].synced_date`,
    );
    invariant(
      current.synced_hash === expected.synced_hash,
      `rows[${index}].synced_hash must match rows[0].synced_hash`,
    );
    invariant(
      current.synced_block_number === expected.synced_block_number,
      `rows[${index}].synced_block_number must match rows[0].synced_block_number`,
    );
  }

  return expected;
}

export function aggregateClaims(transfers: EligibleTransfer[]): ClaimEntry[] {
  const totalsByAddress = new Map<Address, bigint>();

  for (const transfer of transfers) {
    const current = totalsByAddress.get(transfer.sender) ?? 0n;
    totalsByAddress.set(transfer.sender, current + transfer.amount);
  }

  return [...totalsByAddress.entries()]
    .map(([address, totalLost]) => ({ address, totalLost }))
    .sort((left, right) => left.address.localeCompare(right.address));
}

export function hashLeaf(claim: ClaimEntry): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: 'address' }, { type: 'uint256' }],
      [claim.address, claim.totalLost],
    ),
  );
}

function sortHashes(left: Hex, right: Hex): [Hex, Hex] {
  return left.toLowerCase() <= right.toLowerCase()
    ? [left, right]
    : [right, left];
}

function hashPair(left: Hex, right: Hex): Hex {
  const [first, second] = sortHashes(left, right);
  return keccak256(encodePacked(['bytes32', 'bytes32'], [first, second]));
}

export function buildMerkleTree(leaves: Hex[]): Hex[][] {
  invariant(leaves.length > 0, 'Cannot build Merkle tree without leaves');

  const treeLevels: Hex[][] = [leaves];

  while (treeLevels[treeLevels.length - 1].length > 1) {
    const currentLevel = treeLevels[treeLevels.length - 1];
    const nextLevel: Hex[] = [];

    for (let index = 0; index < currentLevel.length; index += 2) {
      const left = currentLevel[index];
      const right = currentLevel[index + 1] ?? currentLevel[index];
      nextLevel.push(hashPair(left, right));
    }

    treeLevels.push(nextLevel);
  }

  return treeLevels;
}

export function createProof(treeLevels: Hex[][], leafIndex: number): Hex[] {
  invariant(treeLevels.length > 0, 'Tree levels cannot be empty');
  invariant(leafIndex >= 0, 'Leaf index must be non-negative');
  invariant(leafIndex < treeLevels[0].length, 'Leaf index out of bounds');

  const proof: Hex[] = [];
  let currentIndex = leafIndex;

  for (
    let levelIndex = 0;
    levelIndex < treeLevels.length - 1;
    levelIndex += 1
  ) {
    const level = treeLevels[levelIndex];
    let siblingIndex =
      currentIndex % 2 === 0 ? currentIndex + 1 : currentIndex - 1;

    if (siblingIndex >= level.length) {
      siblingIndex = currentIndex;
    }

    proof.push(level[siblingIndex]);
    currentIndex = Math.floor(currentIndex / 2);
  }

  return proof;
}

export function verifyProof(
  leaf: Hex,
  proof: Hex[],
  expectedRoot: Hex,
): boolean {
  let computed = leaf;
  for (const sibling of proof) {
    computed = hashPair(computed, sibling);
  }
  return computed.toLowerCase() === expectedRoot.toLowerCase();
}

export function createMerkleData(claims: ClaimEntry[]): MerkleData {
  invariant(
    claims.length > 0,
    'No eligible claims after filtering; cannot build Merkle artifacts',
  );

  const leaves = claims.map(hashLeaf);
  const treeLevels = buildMerkleTree(leaves);
  const merkleRoot = treeLevels[treeLevels.length - 1][0];

  const leafIndexByAddress = {} as Record<Address, number>;
  const proofsByAddress = {} as Record<Address, Hex[]>;

  claims.forEach((claim, index) => {
    leafIndexByAddress[claim.address] = index;
    proofsByAddress[claim.address] = createProof(treeLevels, index);
  });

  return {
    leaves,
    treeLevels,
    merkleRoot,
    leafIndexByAddress,
    proofsByAddress,
  };
}

export function computeBuildFromPayload(payload: unknown): ComputedBuild {
  const rows = extractRows(payload);
  const syncedInput = extractSyncedInputMetadata(rows);
  const normalized = normalizeEligibleTransfers(rows);
  const claims = aggregateClaims(normalized.transfers);
  const merkle = createMerkleData(claims);
  const totalAmount = claims.reduce((sum, claim) => sum + claim.totalLost, 0n);

  return {
    claims,
    merkle,
    stats: {
      ...normalized.stats,
      uniqueAddresses: claims.length,
    },
    syncedInput,
    totalAmount,
  };
}

async function loadPackageVersion(projectRoot: string): Promise<string | null> {
  const packageJsonPath = resolve(projectRoot, 'package.json');
  try {
    const packageText = await readFile(packageJsonPath, 'utf8');
    const parsed = JSON.parse(packageText) as { version?: unknown };
    return typeof parsed.version === 'string' ? parsed.version : null;
  } catch {
    return null;
  }
}

export async function buildAndWriteArtifacts(
  options: BuildArtifactsOptions,
): Promise<BuildArtifactsResult> {
  const inputPath = resolve(options.inputPath);
  const outputDir = resolve(options.outputDir);
  const generatedAt = options.generatedAt ?? new Date().toISOString();
  const specVersion = options.specVersion ?? DEFAULT_SPEC_VERSION;

  const inputText = await readFile(inputPath, 'utf8');
  const inputJson = JSON.parse(inputText) as unknown;
  const inputSha256 = sha256Hex(inputText);

  const computed = computeBuildFromPayload(inputJson);

  const addresses = computed.claims.map((claim) => claim.address);
  const amounts = computed.claims.map((claim) => claim.totalLost.toString());

  const projectRoot = resolve(outputDir, '..');
  const packageVersion = await loadPackageVersion(projectRoot);

  const accumulator = {
    specVersion,
    generatedAt,
    source: {
      inputFile: basename(inputPath),
    },
    merkle: {
      root: computed.merkle.merkleRoot,
      leafEncoding: LEAF_ENCODING,
      hash: HASH_ALGORITHM,
      pairing: PAIRING_MODE,
      oddHandling: ODD_HANDLING,
      treeLevels: computed.merkle.treeLevels,
    },
    claims: {
      addresses,
      amounts,
      leafIndexByAddress: computed.merkle.leafIndexByAddress,
    },
    build: {
      script: {
        file: 'modules/accumulator/scripts/build-accumulator.ts',
        packageVersion,
      },
      runtime: {
        bun: process.versions.bun ?? null,
        node: process.version,
        platform: process.platform,
        arch: process.arch,
      },
      input: {
        file: inputPath,
        sha256: inputSha256,
        totalRows: computed.stats.totalRows,
        includedRows: computed.stats.includedRows,
        excludedZeroAmountRows: computed.stats.excludedZeroAmountRows,
        uniqueAddresses: computed.stats.uniqueAddresses,
        totalAmount: computed.totalAmount.toString(),
        synced_date: computed.syncedInput.synced_date,
        synced_hash: computed.syncedInput.synced_hash,
        synced_block_number: computed.syncedInput.synced_block_number,
      },
    },
  };

  const accumulatorText = stableJson(accumulator);

  await mkdir(outputDir, { recursive: true });

  const accumulatorPath = resolve(outputDir, 'accumulator.json');
  const legacyClaimsAuditPath = resolve(outputDir, 'claims.json');
  const legacyMerkleRootPath = resolve(outputDir, 'merkle-root.json');
  const legacyClaimsCompactPath = resolve(outputDir, 'claims-compact.json');
  const legacyBuildManifestPath = resolve(outputDir, 'build-manifest.json');

  await writeFile(accumulatorPath, accumulatorText, 'utf8');

  await Promise.all([
    unlink(legacyClaimsAuditPath).catch(() => {}),
    unlink(legacyMerkleRootPath).catch(() => {}),
    unlink(legacyClaimsCompactPath).catch(() => {}),
    unlink(legacyBuildManifestPath).catch(() => {}),
  ]);

  return {
    merkleRoot: computed.merkle.merkleRoot,
    claimsCount: computed.claims.length,
    outputDir,
    files: {
      accumulator: accumulatorPath,
    },
    stats: computed.stats,
  };
}
