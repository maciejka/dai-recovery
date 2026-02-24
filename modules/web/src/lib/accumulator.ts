import type { Address, Hex } from 'viem';

export interface AccumulatorArtifact {
  merkle: {
    root: Hex;
    treeLevels: Hex[][];
  };
  claims: {
    addresses: Address[];
    amounts: string[];
    leafIndexByAddress: Record<string, number>;
  };
  build: {
    input: {
      synced_date: string;
      synced_hash: string;
      synced_block_number: string;
    };
  };
}

export interface ClaimLookupResult {
  address: Address;
  totalLost: bigint;
  totalLostRaw: string;
  leafIndex: number;
  proof: Hex[];
}

function isHex32(value: unknown): value is Hex {
  return typeof value === 'string' && /^0x[0-9a-fA-F]{64}$/u.test(value);
}

function parseNonNegativeIntegerString(
  value: unknown,
  fieldPath: string,
): string {
  if (typeof value === 'number') {
    if (!Number.isInteger(value) || !Number.isSafeInteger(value) || value < 0) {
      throw new Error(`${fieldPath} must be a non-negative integer`);
    }
    return String(value);
  }

  if (typeof value === 'string' && /^\d+$/u.test(value)) {
    return value;
  }

  throw new Error(`${fieldPath} must be a non-negative integer`);
}

export function parseAccumulatorArtifact(
  payload: unknown,
): AccumulatorArtifact {
  if (typeof payload !== 'object' || payload === null) {
    throw new Error('Accumulator artifact must be an object');
  }

  const candidate = payload as {
    merkle?: { root?: unknown; treeLevels?: unknown };
    claims?: {
      addresses?: unknown;
      amounts?: unknown;
      leafIndexByAddress?: unknown;
    };
    build?: {
      input?: {
        synced_date?: unknown;
        synced_hash?: unknown;
        synced_block_number?: unknown;
      };
    };
  };

  if (!candidate.merkle || !isHex32(candidate.merkle.root)) {
    throw new Error('Accumulator merkle.root is missing or invalid');
  }
  if (!Array.isArray(candidate.merkle.treeLevels)) {
    throw new Error('Accumulator merkle.treeLevels must be an array');
  }
  if (!candidate.claims) {
    throw new Error('Accumulator claims object is missing');
  }

  const { addresses, amounts, leafIndexByAddress } = candidate.claims;
  if (!Array.isArray(addresses) || !Array.isArray(amounts)) {
    throw new Error('Accumulator claims.addresses/amounts must be arrays');
  }
  if (
    typeof leafIndexByAddress !== 'object' ||
    leafIndexByAddress === null ||
    Array.isArray(leafIndexByAddress)
  ) {
    throw new Error('Accumulator claims.leafIndexByAddress must be an object');
  }
  if (addresses.length !== amounts.length) {
    throw new Error('Accumulator claims arrays must have matching lengths');
  }
  if (
    typeof candidate.build !== 'object' ||
    candidate.build === null ||
    Array.isArray(candidate.build)
  ) {
    throw new Error('Accumulator build object is missing');
  }
  if (
    typeof candidate.build.input !== 'object' ||
    candidate.build.input === null ||
    Array.isArray(candidate.build.input)
  ) {
    throw new Error('Accumulator build.input object is missing');
  }

  const { synced_date, synced_hash, synced_block_number } =
    candidate.build.input;
  if (typeof synced_date !== 'string' || synced_date.length === 0) {
    throw new Error(
      'Accumulator build.input.synced_date must be a non-empty string',
    );
  }
  if (typeof synced_hash !== 'string' || synced_hash.length === 0) {
    throw new Error(
      'Accumulator build.input.synced_hash must be a non-empty string',
    );
  }

  const normalizedTreeLevels = candidate.merkle.treeLevels.map(
    (level, levelIndex) => {
      if (!Array.isArray(level)) {
        throw new Error(
          `Accumulator merkle.treeLevels[${levelIndex}] must be an array`,
        );
      }

      return level.map((node, nodeIndex) => {
        if (!isHex32(node)) {
          throw new Error(
            `Accumulator merkle.treeLevels[${levelIndex}][${nodeIndex}] must be a bytes32 hex string`,
          );
        }
        return node;
      });
    },
  );

  const normalizedAddresses = addresses.map((address, index) => {
    if (typeof address !== 'string') {
      throw new Error(
        `Accumulator claims.addresses[${index}] must be a string`,
      );
    }
    return address as Address;
  });

  const normalizedAmounts = amounts.map((amount, index) => {
    if (typeof amount !== 'string' || !/^\d+$/u.test(amount)) {
      throw new Error(
        `Accumulator claims.amounts[${index}] must be an integer string`,
      );
    }
    return amount;
  });

  return {
    merkle: {
      root: candidate.merkle.root,
      treeLevels: normalizedTreeLevels,
    },
    claims: {
      addresses: normalizedAddresses,
      amounts: normalizedAmounts,
      leafIndexByAddress: leafIndexByAddress as Record<string, number>,
    },
    build: {
      input: {
        synced_date,
        synced_hash,
        synced_block_number: parseNonNegativeIntegerString(
          synced_block_number,
          'Accumulator build.input.synced_block_number',
        ),
      },
    },
  };
}

export function deriveProof(treeLevels: Hex[][], leafIndex: number): Hex[] {
  if (treeLevels.length === 0) {
    throw new Error('Tree levels cannot be empty');
  }
  if (leafIndex < 0 || leafIndex >= treeLevels[0].length) {
    throw new Error('Leaf index out of bounds');
  }

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

export function lookupClaim(
  artifact: AccumulatorArtifact,
  normalizedAddress: Address,
): ClaimLookupResult | null {
  const leafIndex = artifact.claims.leafIndexByAddress[normalizedAddress];

  if (typeof leafIndex !== 'number') {
    return null;
  }

  const totalLostRaw = artifact.claims.amounts[leafIndex];
  if (typeof totalLostRaw !== 'string') {
    throw new Error(`No amount found for leaf index ${leafIndex}`);
  }

  return {
    address: normalizedAddress,
    totalLost: BigInt(totalLostRaw),
    totalLostRaw,
    leafIndex,
    proof: deriveProof(artifact.merkle.treeLevels, leafIndex),
  };
}
