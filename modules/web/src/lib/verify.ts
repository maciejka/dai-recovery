import type { Address, Hex } from 'viem';
import { recoveryVerifierAbi } from '../abi/recoveryVerifierAbi';

interface VerificationContext {
  connectedChainId?: number;
  expectedChainId: number;
  verifierAddress: Address | null;
  configuredMerkleRoot: Hex | null;
  artifactMerkleRoot: Hex;
}

interface VerificationPayload {
  account: Address;
  totalAmount: bigint;
  proof: Hex[];
}

interface ReadContractParams {
  abi: typeof recoveryVerifierAbi;
  address: Address;
  functionName: 'verify';
  args: [Address, bigint, Hex[]];
}

type ReadContractFn = (params: ReadContractParams) => Promise<boolean>;

export type VerificationResult =
  | { status: 'valid' }
  | { status: 'invalid' }
  | { status: 'error'; message: string };

function shortError(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

export async function verifyClaimWithEthCall(
  context: VerificationContext,
  payload: VerificationPayload,
  readContract: ReadContractFn,
): Promise<VerificationResult> {
  if (
    context.connectedChainId !== undefined &&
    context.connectedChainId !== context.expectedChainId
  ) {
    return {
      status: 'error',
      message: `Wrong network: switch wallet to chain ${context.expectedChainId}.`,
    };
  }

  if (!context.verifierAddress) {
    return {
      status: 'error',
      message: 'Verifier address is not configured.',
    };
  }

  if (
    context.configuredMerkleRoot &&
    context.configuredMerkleRoot.toLowerCase() !==
      context.artifactMerkleRoot.toLowerCase()
  ) {
    return {
      status: 'error',
      message: 'Configured merkle root does not match accumulator root.',
    };
  }

  try {
    const isValid = await readContract({
      abi: recoveryVerifierAbi,
      address: context.verifierAddress,
      functionName: 'verify',
      args: [payload.account, payload.totalAmount, payload.proof],
    });

    return isValid ? { status: 'valid' } : { status: 'invalid' };
  } catch (error) {
    return {
      status: 'error',
      message: `RPC failure: ${shortError(error)}`,
    };
  }
}
