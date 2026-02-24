import { useCallback, useEffect, useMemo, useState } from 'react';
import { ConnectKitButton } from 'connectkit';
import { formatUnits } from 'viem';
import { useAccount, usePublicClient } from 'wagmi';
import { networkConfig } from './config/network';
import {
  lookupClaim,
  parseAccumulatorArtifact,
  type AccumulatorArtifact,
  type ClaimLookupResult,
} from './lib/accumulator';
import { normalizeAddress, resolveLookupTarget } from './lib/addresses';
import { verifyClaimWithEthCall, type VerificationResult } from './lib/verify';

type ArtifactState =
  | { status: 'loading' }
  | { status: 'ready'; artifact: AccumulatorArtifact }
  | { status: 'error'; message: string };

type LookupState =
  | { status: 'idle' }
  | { status: 'found'; claim: ClaimLookupResult }
  | { status: 'not_found'; address: string }
  | { status: 'error'; message: string };

function formatProof(proof: `0x${string}`[]): string {
  return proof.join(', ');
}

export default function App() {
  const [artifactState, setArtifactState] = useState<ArtifactState>({
    status: 'loading',
  });
  const [addressInput, setAddressInput] = useState('');
  const [lookupState, setLookupState] = useState<LookupState>({
    status: 'idle',
  });
  const [verificationState, setVerificationState] =
    useState<VerificationResult | null>(null);

  const {
    address: connectedAddress,
    chainId: connectedChainId,
    isConnected,
  } = useAccount();
  const publicClient = usePublicClient({ chainId: networkConfig.chainId });

  useEffect(() => {
    let isMounted = true;

    async function loadArtifact() {
      try {
        const response = await fetch('/accumulator.json');
        if (!response.ok) {
          throw new Error(
            `Failed to load accumulator.json (${response.status})`,
          );
        }

        const payload = (await response.json()) as unknown;
        const artifact = parseAccumulatorArtifact(payload);

        if (isMounted) {
          setArtifactState({ status: 'ready', artifact });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        const message = error instanceof Error ? error.message : String(error);
        setArtifactState({
          status: 'error',
          message,
        });
      }
    }

    void loadArtifact();

    return () => {
      isMounted = false;
    };
  }, []);

  const artifact =
    artifactState.status === 'ready' ? artifactState.artifact : null;

  const runLookup = useCallback(
    (source: { useWalletAddress: boolean }) => {
      setVerificationState(null);

      if (!artifact) {
        setLookupState({
          status: 'error',
          message: 'Accumulator artifact is not loaded yet.',
        });
        return;
      }

      try {
        const normalizedAddress = resolveLookupTarget({
          manualInput: addressInput,
          walletAddress: connectedAddress,
          useWalletAddress: source.useWalletAddress,
        });

        setAddressInput(normalizedAddress);
        const claim = lookupClaim(artifact, normalizedAddress);

        if (!claim) {
          setLookupState({ status: 'not_found', address: normalizedAddress });
          return;
        }

        setLookupState({ status: 'found', claim });
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLookupState({ status: 'error', message });
      }
    },
    [addressInput, artifact, connectedAddress],
  );

  useEffect(() => {
    if (!connectedAddress || !artifact) {
      return;
    }

    const normalized = normalizeAddress(connectedAddress);
    setAddressInput(normalized);
    const claim = lookupClaim(artifact, normalized);

    if (!claim) {
      setLookupState({ status: 'not_found', address: normalized });
      return;
    }

    setLookupState({ status: 'found', claim });
    setVerificationState(null);
  }, [artifact, connectedAddress]);

  const configuredRootMismatch =
    artifact &&
    networkConfig.merkleRoot &&
    networkConfig.merkleRoot.toLowerCase() !==
      artifact.merkle.root.toLowerCase();

  const canVerify =
    lookupState.status === 'found' && !configuredRootMismatch && publicClient;

  const handleVerify = useCallback(async () => {
    if (lookupState.status !== 'found' || !publicClient || !artifact) {
      return;
    }

    const claim = lookupState.claim;

    const result = await verifyClaimWithEthCall(
      {
        connectedChainId: isConnected ? connectedChainId : undefined,
        expectedChainId: networkConfig.chainId,
        verifierAddress: networkConfig.verifierAddress,
        configuredMerkleRoot: networkConfig.merkleRoot,
        artifactMerkleRoot: artifact.merkle.root,
      },
      {
        account: claim.address,
        totalAmount: claim.totalLost,
        proof: claim.proof,
      },
      (params) => publicClient.readContract(params),
    );

    setVerificationState(result);
  }, [artifact, connectedChainId, isConnected, lookupState, publicClient]);

  const statusBanner = useMemo(() => {
    if (artifactState.status === 'loading') {
      return 'Loading accumulator dataset...';
    }

    if (artifactState.status === 'error') {
      return `Dataset error: ${artifactState.message}`;
    }

    return `Dataset ready. Merkle root: ${artifactState.artifact.merkle.root}`;
  }, [artifactState]);

  return (
    <main className="app-shell">
      <div className="background-gradient" />
      <section className="panel">
        <header className="panel-header">
          <p className="eyebrow">Lost DAI Recovery</p>
          <h1>Lookup and Sepolia Verification</h1>
          <p className="status-line">{statusBanner}</p>
        </header>

        <div className="controls">
          <label htmlFor="wallet-address">Address</label>
          <input
            id="wallet-address"
            value={addressInput}
            onChange={(event) => setAddressInput(event.target.value)}
            placeholder="0x..."
            autoComplete="off"
          />

          <div className="actions">
            <button
              type="button"
              onClick={() => runLookup({ useWalletAddress: false })}
            >
              Lookup Address
            </button>
            <button
              type="button"
              onClick={() => runLookup({ useWalletAddress: true })}
              disabled={!connectedAddress}
            >
              Use Wallet
            </button>
            <ConnectKitButton showBalance={false} />
          </div>
        </div>

        {lookupState.status === 'found' && (
          <section className="result-card">
            <h2>Claim Found</h2>
            <p>
              <strong>Address:</strong> {lookupState.claim.address}
            </p>
            <p>
              <strong>Total Lost (raw):</strong>{' '}
              {lookupState.claim.totalLostRaw}
            </p>
            <p>
              <strong>Total Lost (DAI):</strong>{' '}
              {formatUnits(lookupState.claim.totalLost, 18)}
            </p>
            <p>
              <strong>Proof Length:</strong> {lookupState.claim.proof.length}
            </p>
            <textarea
              readOnly
              value={formatProof(lookupState.claim.proof)}
              rows={4}
              aria-label="Merkle proof"
            />

            <button
              type="button"
              onClick={() => void handleVerify()}
              disabled={!canVerify}
            >
              Verify on Sepolia
            </button>
          </section>
        )}

        {lookupState.status === 'not_found' && (
          <p className="error-line">
            No dataset entry for {lookupState.address}.
          </p>
        )}

        {lookupState.status === 'error' && (
          <p className="error-line">Lookup error: {lookupState.message}</p>
        )}

        {configuredRootMismatch && (
          <p className="error-line">
            Config root mismatch: `VITE_MERKLE_ROOT` does not match the loaded
            accumulator.
          </p>
        )}

        {verificationState?.status === 'valid' && (
          <p className="success-line">Verification result: valid tuple.</p>
        )}
        {verificationState?.status === 'invalid' && (
          <p className="error-line">Verification result: invalid tuple.</p>
        )}
        {verificationState?.status === 'error' && (
          <p className="error-line">
            Verification failed: {verificationState.message}
          </p>
        )}

        <footer className="meta">
          <p>Configured chain ID: {networkConfig.chainId}</p>
          <p>Configured RPC URL: {networkConfig.rpcUrl}</p>
          <p>
            Verifier address:{' '}
            {networkConfig.verifierAddress ??
              'Set VITE_VERIFIER_ADDRESS in modules/web/.env'}
          </p>
        </footer>
      </section>
    </main>
  );
}
