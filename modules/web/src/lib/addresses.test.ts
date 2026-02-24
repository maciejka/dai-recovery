import { describe, expect, it } from 'vitest';
import { normalizeAddress, resolveLookupTarget } from './addresses';

describe('normalizeAddress', () => {
  it('normalizes valid addresses to lowercase', () => {
    expect(normalizeAddress('0x52908400098527886E0F7030069857D2E4169EE7')).toBe(
      '0x52908400098527886e0f7030069857d2e4169ee7',
    );
  });

  it('throws on invalid address input', () => {
    expect(() => normalizeAddress('abc')).toThrow(
      'Address is not a valid Ethereum address',
    );
  });
});

describe('resolveLookupTarget', () => {
  it('uses connected wallet when requested', () => {
    const resolved = resolveLookupTarget({
      manualInput: '0x0000000000000000000000000000000000000001',
      walletAddress: '0x00000000000000000000000000000000000000aa',
      useWalletAddress: true,
    });

    expect(resolved).toBe('0x00000000000000000000000000000000000000aa');
  });

  it('throws when wallet lookup is requested without a connected wallet', () => {
    expect(() =>
      resolveLookupTarget({
        manualInput: '0x0000000000000000000000000000000000000001',
        useWalletAddress: true,
      }),
    ).toThrow('Wallet is not connected');
  });
});
