import {
  getAddress,
  isAddress,
  defineChain,
  type Address,
  type Hex,
} from 'viem';
import { sepolia } from 'viem/chains';

const DEFAULT_CHAIN_ID = 11155111;
const DEFAULT_RPC_URL = 'https://rpc.sepolia.org';
const DEFAULT_WALLETCONNECT_PROJECT_ID = '00000000000000000000000000000000';

function parseChainId(value: string | undefined): number {
  if (!value) {
    return DEFAULT_CHAIN_ID;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    return DEFAULT_CHAIN_ID;
  }

  return parsed;
}

function parseAddress(value: string | undefined): Address | null {
  if (!value || !isAddress(value)) {
    return null;
  }

  return getAddress(value);
}

function parseHex32(value: string | undefined): Hex | null {
  if (!value || !/^0x[0-9a-fA-F]{64}$/u.test(value)) {
    return null;
  }

  return value as Hex;
}

function createChain(chainId: number, rpcUrl: string) {
  if (chainId === sepolia.id) {
    return {
      ...sepolia,
      rpcUrls: {
        default: { http: [rpcUrl] },
        public: { http: [rpcUrl] },
      },
    };
  }

  return defineChain({
    id: chainId,
    name: `Chain ${chainId}`,
    nativeCurrency: {
      name: 'Ether',
      symbol: 'ETH',
      decimals: 18,
    },
    rpcUrls: {
      default: { http: [rpcUrl] },
    },
    testnet: true,
  });
}

const chainId = parseChainId(import.meta.env.VITE_CHAIN_ID);
const rpcUrl = import.meta.env.VITE_RPC_URL ?? DEFAULT_RPC_URL;

export const networkConfig = {
  chainId,
  rpcUrl,
  verifierAddress: parseAddress(import.meta.env.VITE_VERIFIER_ADDRESS),
  merkleRoot: parseHex32(import.meta.env.VITE_MERKLE_ROOT),
  walletConnectProjectId:
    import.meta.env.VITE_WALLETCONNECT_PROJECT_ID ??
    DEFAULT_WALLETCONNECT_PROJECT_ID,
  chain: createChain(chainId, rpcUrl),
};
