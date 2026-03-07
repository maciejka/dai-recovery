import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'bun:test';
import type { Hex } from 'viem';
import {
  computeBuildFromPayload,
  createProof,
  hashLeaf,
  verifyProof,
  type ClaimEntry,
} from '../src/accumulator';

const DATASET_PATH = resolve(import.meta.dir, '../../../data/transfers.json');
const ACCUMULATOR_PATH = resolve(
  import.meta.dir,
  '../../../data/accumulator.json',
);
const SAMPLE_COUNT = 64;
const SEED = 0x5eed1234;

interface AccumulatorArtifact {
  source: {
    inputFile: string;
  };
  merkle: {
    root: Hex;
    treeLevels: Hex[][];
  };
  claims: {
    addresses: ClaimEntry['address'][];
    amounts: string[];
    leafIndexByAddress: Record<ClaimEntry['address'], number>;
  };
  build: {
    input: {
      sha256: string;
      totalRows: number;
      includedRows: number;
      excludedZeroAmountRows: number;
      uniqueAddresses: number;
      totalAmount: string;
      synced_date: string;
      synced_hash: string;
      synced_block_number: number;
    };
  };
}

function loadDatasetBuild() {
  const payload = JSON.parse(readFileSync(DATASET_PATH, 'utf8')) as unknown;
  return computeBuildFromPayload(payload);
}

function loadAccumulatorArtifact(): AccumulatorArtifact {
  return JSON.parse(
    readFileSync(ACCUMULATOR_PATH, 'utf8'),
  ) as AccumulatorArtifact;
}

function createPrng(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(state, 1_664_525) + 1_013_904_223) >>> 0;
    return state;
  };
}

function sampleIndices(length: number, count: number, seed: number): number[] {
  const next = createPrng(seed);
  const indices = [...Array(length).keys()];

  for (let index = indices.length - 1; index > 0; index -= 1) {
    const swapIndex = next() % (index + 1);
    [indices[index], indices[swapIndex]] = [indices[swapIndex], indices[index]];
  }

  return indices.slice(0, Math.min(length, count));
}

function randomWord(next: () => number): Hex {
  let hex = '0x';

  for (let index = 0; index < 8; index += 1) {
    hex += next().toString(16).padStart(8, '0');
  }

  return hex as Hex;
}

function mutateAddress(address: ClaimEntry['address'], next: () => number) {
  const chars = address.slice(2).split('');
  const charIndex = next() % chars.length;
  const original = Number.parseInt(chars[charIndex] ?? '0', 16);
  chars[charIndex] = ((original + 1 + (next() % 15)) % 16).toString(16);
  return `0x${chars.join('')}` as ClaimEntry['address'];
}

function mutateProofWord(proof: Hex[], next: () => number): Hex[] {
  const mutated = [...proof];
  const proofIndex = next() % mutated.length;
  const bitIndex = BigInt(next() % 256);
  const value = BigInt(mutated[proofIndex]);
  mutated[proofIndex] =
    `0x${(value ^ (1n << bitIndex)).toString(16).padStart(64, '0')}` as Hex;
  return mutated;
}

function shuffleProof(proof: Hex[], next: () => number): Hex[] {
  const shuffled = [...proof];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = next() % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }

  return shuffled;
}

describe('real dataset proofs', () => {
  it('keeps data/accumulator.json in sync with data/transfers.json', () => {
    const payloadText = readFileSync(DATASET_PATH, 'utf8');
    const computed = computeBuildFromPayload(
      JSON.parse(payloadText) as unknown,
    );
    const artifact = loadAccumulatorArtifact();

    expect(artifact.source.inputFile).toBe('transfers.json');
    expect(artifact.merkle.root).toBe(computed.merkle.merkleRoot);
    expect(artifact.merkle.treeLevels).toEqual(computed.merkle.treeLevels);
    expect(artifact.claims.addresses).toEqual(
      computed.claims.map((claim) => claim.address),
    );
    expect(artifact.claims.amounts).toEqual(
      computed.claims.map((claim) => claim.totalLost.toString()),
    );
    expect(artifact.claims.leafIndexByAddress).toEqual(
      computed.merkle.leafIndexByAddress,
    );

    const payloadSha256 = createHash('sha256')
      .update(payloadText)
      .digest('hex');
    expect(artifact.build.input.sha256).toBe(`0x${payloadSha256}`);
    expect(artifact.build.input.totalRows).toBe(computed.stats.totalRows);
    expect(artifact.build.input.includedRows).toBe(computed.stats.includedRows);
    expect(artifact.build.input.excludedZeroAmountRows).toBe(
      computed.stats.excludedZeroAmountRows,
    );
    expect(artifact.build.input.uniqueAddresses).toBe(
      computed.stats.uniqueAddresses,
    );
    expect(artifact.build.input.totalAmount).toBe(
      computed.totalAmount.toString(),
    );
    expect(artifact.build.input.synced_date).toBe(
      computed.syncedInput.synced_date,
    );
    expect(artifact.build.input.synced_hash).toBe(
      computed.syncedInput.synced_hash,
    );
    expect(artifact.build.input.synced_block_number).toBe(
      computed.syncedInput.synced_block_number,
    );
  });

  it('builds a valid proof for every aggregated account in data/transfers.json', () => {
    const computed = loadDatasetBuild();

    expect(computed.claims.length).toBe(computed.stats.uniqueAddresses);
    expect(computed.claims.length).toBe(computed.merkle.leaves.length);

    computed.claims.forEach((claim) => {
      const leafIndex = computed.merkle.leafIndexByAddress[claim.address];
      const derivedProof = createProof(computed.merkle.treeLevels, leafIndex);
      const storedProof = computed.merkle.proofsByAddress[claim.address];

      expect(leafIndex).toBeDefined();
      expect(storedProof).toEqual(derivedProof);
      expect(
        verifyProof(hashLeaf(claim), storedProof, computed.merkle.merkleRoot),
      ).toBe(true);
    });
  });

  it('rejects deterministic invalid proof mutations built from real claims', () => {
    const computed = loadDatasetBuild();
    const next = createPrng(SEED);

    sampleIndices(computed.claims.length, SAMPLE_COUNT, SEED).forEach(
      (index) => {
        const claim = computed.claims[index];
        const proof = computed.merkle.proofsByAddress[claim.address];
        const leaf = hashLeaf(claim);
        const otherIndex = (index + 1) % computed.claims.length;
        const otherClaim = computed.claims[otherIndex];
        const wrongAmountLeaf = hashLeaf({
          address: claim.address,
          totalLost: claim.totalLost + 1n,
        });
        const wrongAddressLeaf = hashLeaf({
          address: mutateAddress(claim.address, next),
          totalLost: claim.totalLost,
        });

        expect(
          verifyProof(wrongAmountLeaf, proof, computed.merkle.merkleRoot),
        ).toBe(false);
        expect(
          verifyProof(wrongAddressLeaf, proof, computed.merkle.merkleRoot),
        ).toBe(false);
        expect(
          verifyProof(
            leaf,
            computed.merkle.proofsByAddress[otherClaim.address],
            computed.merkle.merkleRoot,
          ),
        ).toBe(false);
        expect(
          verifyProof(
            leaf,
            mutateProofWord(proof, next),
            computed.merkle.merkleRoot,
          ),
        ).toBe(false);
        expect(
          verifyProof(leaf, proof.slice(0, -1), computed.merkle.merkleRoot),
        ).toBe(false);
        expect(
          verifyProof(
            leaf,
            [...proof, randomWord(next)],
            computed.merkle.merkleRoot,
          ),
        ).toBe(false);
        expect(
          verifyProof(
            leaf,
            shuffleProof(proof, next),
            computed.merkle.merkleRoot,
          ),
        ).toBe(false);
      },
    );
  });

  it('rejects deterministic garbage proofs with the expected depth', () => {
    const computed = loadDatasetBuild();
    const next = createPrng(SEED ^ 0x0badf00d);

    sampleIndices(
      computed.claims.length,
      SAMPLE_COUNT,
      SEED ^ 0x12345678,
    ).forEach((index) => {
      const claim = computed.claims[index];
      const proofLength = computed.merkle.proofsByAddress[claim.address].length;
      const garbageProof = Array.from({ length: proofLength }, () =>
        randomWord(next),
      );

      expect(
        verifyProof(hashLeaf(claim), garbageProof, computed.merkle.merkleRoot),
      ).toBe(false);
    });
  });
});
