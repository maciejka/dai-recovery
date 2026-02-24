import { useEffect, useRef, useState } from 'react';
import { ConnectKitButton } from 'connectkit';
import { useAccount, usePublicClient } from 'wagmi';
import { networkConfig } from './config/network';
import {
  lookupClaim,
  parseAccumulatorArtifact,
  type AccumulatorArtifact,
  type ClaimLookupResult,
} from './lib/accumulator';
import { normalizeAddress } from './lib/addresses';
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

const WEI_PER_CENT = 10n ** 16n;
const HALF_CENT_IN_WEI = 5n * 10n ** 15n;
const SIMULATED_VERIFICATION_DELAY_MS = 1200;

function formatDaiMoney(amount: bigint): string {
  const roundedCents = (amount + HALF_CENT_IN_WEI) / WEI_PER_CENT;
  const whole = roundedCents / 100n;
  const cents = roundedCents % 100n;
  const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return `${groupedWhole}.${cents.toString().padStart(2, '0')}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
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
  const lastAutoVerificationKeyRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!connectedAddress) {
      return;
    }

    setAddressInput(normalizeAddress(connectedAddress));
  }, [connectedAddress]);

  useEffect(() => {
    setVerificationState(null);

    if (!artifact) {
      return;
    }

    const trimmed = addressInput.trim();
    if (!trimmed) {
      setLookupState({ status: 'idle' });
      return;
    }

    try {
      const normalized = normalizeAddress(trimmed);
      const claim = lookupClaim(artifact, normalized);

      if (!claim) {
        setLookupState({ status: 'not_found', address: normalized });
        return;
      }

      setLookupState({ status: 'found', claim });
    } catch (error) {
      if (trimmed.length < 42) {
        setLookupState({ status: 'idle' });
        return;
      }

      const message = error instanceof Error ? error.message : String(error);
      setLookupState({ status: 'error', message });
    }
  }, [addressInput, artifact]);

  const configuredRootMismatch =
    artifact &&
    networkConfig.merkleRoot &&
    networkConfig.merkleRoot.toLowerCase() !==
      artifact.merkle.root.toLowerCase();

  async function runVerification(
    claim: ClaimLookupResult,
    verificationKey: string,
  ) {
    if (!publicClient || !artifact) {
      return;
    }

    await sleep(SIMULATED_VERIFICATION_DELAY_MS);

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

    if (lastAutoVerificationKeyRef.current !== verificationKey) {
      return;
    }

    setVerificationState(result);
  }

  useEffect(() => {
    if (lookupState.status !== 'found') {
      lastAutoVerificationKeyRef.current = null;
      return;
    }

    const claim = lookupState.claim;
    const autoVerificationKey = `${claim.address}:${claim.totalLostRaw}:${connectedChainId ?? 'none'}`;
    if (lastAutoVerificationKeyRef.current === autoVerificationKey) {
      return;
    }

    lastAutoVerificationKeyRef.current = autoVerificationKey;
    void runVerification(claim, autoVerificationKey);
  }, [artifact, connectedChainId, isConnected, lookupState, publicClient]);

  const verificationBadge =
    verificationState === null
      ? { text: 'Checking', className: 'badge badge-pending' }
      : verificationState.status === 'valid'
        ? { text: 'Valid', className: 'badge badge-valid' }
        : verificationState.status === 'invalid'
          ? { text: 'Invalid', className: 'badge badge-invalid' }
          : { text: 'Error', className: 'badge badge-invalid' };

  return (
    <main className="app-shell">
      <div className="background-gradient" />
      <section className="panel">
        <header className="panel-header">
          <div className="header-top">
            <h1>Dai Recovery</h1>
            <div className="header-actions">
              <ConnectKitButton showBalance={false} />
            </div>
          </div>

          <div className="meta-grid">
            <article className="meta-item meta-item-group">
              <p className="meta-line">
                <span className="label-text">Accumulator Root</span>{' '}
                <span className="meta-inline-value" title={artifact?.merkle.root}>
                  {artifact
                    ? artifact.merkle.root
                    : artifactState.status === 'loading'
                      ? 'Loading...'
                      : artifactState.status === 'error'
                        ? `Unavailable (${artifactState.message})`
                        : 'Unavailable'}
                </span>
              </p>
              <p className="meta-line">
                <span className="label-text">Verifier Address</span>{' '}
                <span
                  className="meta-inline-value"
                  title={networkConfig.verifierAddress ?? undefined}
                >
                  {networkConfig.verifierAddress ?? 'Not configured'}
                </span>
              </p>
            </article>
          </div>
        </header>

        <section className="result-card">
          <div className="result-controls">
            <div className="address-row">
              <label className="label-text" htmlFor="wallet-address">
                Address
              </label>
              <input
                className="address-input"
                id="wallet-address"
                value={addressInput}
                onChange={(event) => setAddressInput(event.target.value)}
                placeholder="0x..."
                autoComplete="off"
              />
            </div>
          </div>

          {artifactState.status === 'loading' && (
            <p className="result-message">Loading accumulator dataset...</p>
          )}
          {artifactState.status === 'error' && (
            <p className="result-message error-line">
              Dataset error: {artifactState.message}
            </p>
          )}

          {configuredRootMismatch && (
            <p className="result-message error-line">
              Config root mismatch: `VITE_MERKLE_ROOT` does not match the loaded
              accumulator.
            </p>
          )}

          {lookupState.status === 'idle' && (
            <p className="result-message">
              Enter an address to check lost dai claim.
            </p>
          )}

          {lookupState.status === 'found' && (
            <div className="result-list">
              <p className="result-row">
                <span className="label-text">Total Lost (DAI)</span>
                <span className="row-value">{formatDaiMoney(lookupState.claim.totalLost)}</span>
              </p>
              <p className="result-row">
                <span className="label-text">Verification</span>
                <span className={verificationBadge.className}>
                  {verificationBadge.text}
                </span>
              </p>
              {verificationState?.status === 'error' && (
                <p className="result-message error-line">
                  Verification failed: {verificationState.message}
                </p>
              )}
            </div>
          )}

          {lookupState.status === 'not_found' && (
            <p className="result-message error-line">
              No dataset entry for {lookupState.address}.
            </p>
          )}

          {lookupState.status === 'error' && (
            <p className="result-message error-line">
              Lookup error: {lookupState.message}
            </p>
          )}
        </section>
      </section>
    </main>
  );
}
