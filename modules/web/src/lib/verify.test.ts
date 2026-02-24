import { describe, expect, it, vi } from 'vitest';
import { verifyClaimWithEthCall } from './verify';

const context = {
  expectedChainId: 11155111,
  verifierAddress: '0x00000000000000000000000000000000000000aa' as const,
  configuredMerkleRoot:
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as const,
  artifactMerkleRoot:
    '0xffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff' as const,
};

const payload = {
  account: '0x00000000000000000000000000000000000000bb' as const,
  totalAmount: 10n,
  proof: [
    '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' as const,
  ],
};

describe('verifyClaimWithEthCall', () => {
  it('returns valid when eth_call returns true', async () => {
    const readContract = vi.fn(async () => true);

    const result = await verifyClaimWithEthCall(context, payload, readContract);
    expect(result).toEqual({ status: 'valid' });
  });

  it('returns invalid when eth_call returns false', async () => {
    const readContract = vi.fn(async () => false);

    const result = await verifyClaimWithEthCall(context, payload, readContract);
    expect(result).toEqual({ status: 'invalid' });
  });

  it('returns a wrong-network error before calling RPC', async () => {
    const readContract = vi.fn(async () => true);

    const result = await verifyClaimWithEthCall(
      {
        ...context,
        connectedChainId: 1,
      },
      payload,
      readContract,
    );

    expect(result).toEqual({
      status: 'error',
      message: 'Wrong network: switch wallet to chain 11155111.',
    });
    expect(readContract).not.toHaveBeenCalled();
  });

  it('returns RPC errors cleanly', async () => {
    const readContract = vi.fn(async () => {
      throw new Error('timeout');
    });

    const result = await verifyClaimWithEthCall(context, payload, readContract);
    expect(result).toEqual({
      status: 'error',
      message: 'RPC failure: timeout',
    });
  });
});
