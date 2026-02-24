import { describe, expect, it } from 'vitest';
import {
  deriveProof,
  lookupClaim,
  parseAccumulatorArtifact,
} from './accumulator';

const fixture = parseAccumulatorArtifact({
  merkle: {
    root: '0x1111111111111111111111111111111111111111111111111111111111111111',
    treeLevels: [
      [
        '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
        '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
        '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      ],
      [
        '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
        '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
      ],
      ['0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'],
    ],
  },
  claims: {
    addresses: [
      '0x00000000000000000000000000000000000000aa',
      '0x00000000000000000000000000000000000000bb',
      '0x00000000000000000000000000000000000000cc',
    ],
    amounts: ['10', '20', '30'],
    leafIndexByAddress: {
      '0x00000000000000000000000000000000000000aa': 0,
      '0x00000000000000000000000000000000000000bb': 1,
      '0x00000000000000000000000000000000000000cc': 2,
    },
  },
  build: {
    input: {
      synced_date: '2026-02-24 23:36:47.000 UTC',
      synced_hash:
        '0xae1314bfc77dfce83bcf5f66d85c9b55adf936d00f726d71f55c5c81b3ebb743',
      synced_block_number: 24530087,
    },
  },
});

describe('deriveProof', () => {
  it('uses duplicate-last sibling for odd nodes', () => {
    const proof = deriveProof(fixture.merkle.treeLevels, 2);

    expect(proof).toEqual([
      '0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
      '0xdddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
    ]);
  });
});

describe('lookupClaim', () => {
  it('returns totalLost and derived proof for known addresses', () => {
    const claim = lookupClaim(
      fixture,
      '0x00000000000000000000000000000000000000bb',
    );

    expect(claim).not.toBeNull();
    expect(claim?.totalLost).toBe(20n);
    expect(claim?.proof).toEqual([
      '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
    ]);
  });

  it('returns null when address does not exist in the dataset', () => {
    const claim = lookupClaim(
      fixture,
      '0x00000000000000000000000000000000000000dd',
    );

    expect(claim).toBeNull();
  });
});

describe('parseAccumulatorArtifact', () => {
  it('normalizes synced_block_number to an integer string', () => {
    expect(fixture.build.input.synced_block_number).toBe('24530087');
  });

  it('throws when build input synced metadata is missing', () => {
    expect(() =>
      parseAccumulatorArtifact({
        merkle: fixture.merkle,
        claims: fixture.claims,
      }),
    ).toThrow('Accumulator build object is missing');
  });
});
