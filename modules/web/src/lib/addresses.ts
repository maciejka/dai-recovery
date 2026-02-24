import { getAddress, isAddress, type Address } from 'viem';

export function normalizeAddress(value: string): Address {
  const trimmed = value.trim();
  if (!isAddress(trimmed)) {
    throw new Error('Address is not a valid Ethereum address');
  }
  return getAddress(trimmed).toLowerCase() as Address;
}

interface ResolveLookupTargetParams {
  manualInput: string;
  walletAddress?: Address;
  useWalletAddress: boolean;
}

export function resolveLookupTarget({
  manualInput,
  walletAddress,
  useWalletAddress,
}: ResolveLookupTargetParams): Address {
  if (useWalletAddress) {
    if (!walletAddress) {
      throw new Error('Wallet is not connected');
    }
    return normalizeAddress(walletAddress);
  }

  return normalizeAddress(manualInput);
}
