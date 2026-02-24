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
