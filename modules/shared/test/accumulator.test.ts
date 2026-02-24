import { describe, expect, it } from 'bun:test';
import {
  aggregateClaims,
  computeBuildFromPayload,
  createMerkleData,
  hashLeaf,
  normalizeEligibleTransfers,
  verifyProof,
  type ClaimEntry,
  type RawTransferRow,
} from '../src/accumulator';

function sampleRows(): RawTransferRow[] {
  return [
    {
      sender: '0x00000000000000000000000000000000000000aa',
      amount: '10',
      tx_hash: '0x1',
      synced_date: '2026-02-24 23:36:47.000 UTC',
      synced_hash:
        '0xae1314bfc77dfce83bcf5f66d85c9b55adf936d00f726d71f55c5c81b3ebb743',
      synced_block_number: 24530087,
    },
    {
      sender: '0x00000000000000000000000000000000000000bb',
      amount: '0',
      tx_hash: '0x2',
      synced_date: '2026-02-24 23:36:47.000 UTC',
      synced_hash:
        '0xae1314bfc77dfce83bcf5f66d85c9b55adf936d00f726d71f55c5c81b3ebb743',
      synced_block_number: 24530087,
    },
    {
      sender: '0x00000000000000000000000000000000000000aa',
      amount: '15',
      tx_hash: '0x3',
      synced_date: '2026-02-24 23:36:47.000 UTC',
      synced_hash:
        '0xae1314bfc77dfce83bcf5f66d85c9b55adf936d00f726d71f55c5c81b3ebb743',
      synced_block_number: 24530087,
    },
    {
      sender: '0x00000000000000000000000000000000000000cc',
      amount: '7',
      tx_hash: '0x4',
      synced_date: '2026-02-24 23:36:47.000 UTC',
      synced_hash:
        '0xae1314bfc77dfce83bcf5f66d85c9b55adf936d00f726d71f55c5c81b3ebb743',
      synced_block_number: 24530087,
    },
  ];
}

describe('normalizeEligibleTransfers', () => {
  it('filters out zero amounts and tracks stats', () => {
    const { transfers, stats } = normalizeEligibleTransfers(sampleRows());

    expect(stats.totalRows).toBe(4);
    expect(stats.includedRows).toBe(3);
    expect(stats.excludedZeroAmountRows).toBe(1);

    expect(transfers.map((transfer) => transfer.amount.toString())).toEqual([
      '10',
      '15',
      '7',
    ]);
  });

  it('throws on missing amount field', () => {
    const rows: RawTransferRow[] = [
      {
        sender: '0x00000000000000000000000000000000000000aa',
        amount: undefined,
      },
    ];

    expect(() => normalizeEligibleTransfers(rows)).toThrow(
      'rows[0].amount must be a string',
    );
  });
});

describe('aggregation and determinism', () => {
  it('extracts synced input metadata', () => {
    const computed = computeBuildFromPayload({
      result: {
        rows: sampleRows(),
      },
    });

    expect(computed.syncedInput).toEqual({
      synced_date: '2026-02-24 23:36:47.000 UTC',
      synced_hash:
        '0xae1314bfc77dfce83bcf5f66d85c9b55adf936d00f726d71f55c5c81b3ebb743',
      synced_block_number: 24530087,
    });
  });

  it('throws when synced metadata differs between rows', () => {
    const rows = sampleRows();
    rows[1] = {
      ...rows[1],
      synced_hash:
        '0xbe1314bfc77dfce83bcf5f66d85c9b55adf936d00f726d71f55c5c81b3ebb743',
    };

    expect(() =>
      computeBuildFromPayload({
        result: {
          rows,
        },
      }),
    ).toThrow('rows[1].synced_hash must match rows[0].synced_hash');
  });

  it('aggregates duplicate addresses and sorts by normalized address', () => {
    const { transfers } = normalizeEligibleTransfers(sampleRows());
    const claims = aggregateClaims(transfers);

    expect(claims).toEqual([
      {
        address: '0x00000000000000000000000000000000000000aa',
        totalLost: 25n,
      },
      {
        address: '0x00000000000000000000000000000000000000cc',
        totalLost: 7n,
      },
    ]);
  });

  it('produces identical roots regardless of row order', () => {
    const payloadA = {
      result: {
        rows: sampleRows(),
      },
    };

    const payloadB = {
      result: {
        rows: [...sampleRows()].reverse(),
      },
    };

    const rootA = computeBuildFromPayload(payloadA).merkle.merkleRoot;
    const rootB = computeBuildFromPayload(payloadB).merkle.merkleRoot;

    expect(rootA).toBe(rootB);
  });
});

describe('proof verification', () => {
  it('verifies valid proofs and rejects wrong claim tuples', () => {
    const claims: ClaimEntry[] = [
      {
        address: '0x00000000000000000000000000000000000000aa',
        totalLost: 25n,
      },
      {
        address: '0x00000000000000000000000000000000000000cc',
        totalLost: 7n,
      },
      {
        address: '0x00000000000000000000000000000000000000dd',
        totalLost: 9n,
      },
    ];

    const merkle = createMerkleData(claims);

    claims.forEach((claim) => {
      const leaf = hashLeaf(claim);
      const proof = merkle.proofsByAddress[claim.address];
      expect(verifyProof(leaf, proof, merkle.merkleRoot)).toBe(true);
    });

    const wrongLeaf = hashLeaf({
      address: '0x00000000000000000000000000000000000000aa',
      totalLost: 24n,
    });

    expect(
      verifyProof(
        wrongLeaf,
        merkle.proofsByAddress['0x00000000000000000000000000000000000000aa'],
        merkle.merkleRoot,
      ),
    ).toBe(false);
  });
});
