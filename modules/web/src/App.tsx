import { useCallback, useEffect, useRef, useState } from 'react';
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

const WEI_PER_DAI = 10n ** 18n;

function formatDaiAmount(amount: bigint): string {
  const whole = amount / WEI_PER_DAI;
  const fraction = (amount % WEI_PER_DAI)
    .toString()
    .padStart(18, '0')
    .replace(/0+$/u, '');
  const groupedWhole = whole.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
  return fraction.length > 0 ? `${groupedWhole}.${fraction}` : groupedWhole;
}

function formatRoundedUpWholeDai(amount: bigint): string {
  const roundedUpWhole = (amount + WEI_PER_DAI - 1n) / WEI_PER_DAI;
  return roundedUpWhole.toString().replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
}

function formatIntegerString(value: string): string {
  return value.replace(/\B(?=(\d{3})+(?!\d))/gu, ',');
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
        const response = await fetch(
          `${import.meta.env.BASE_URL}accumulator.json`,
        );
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
  const artifactFallbackValue =
    artifactState.status === 'loading'
      ? 'Loading...'
      : artifactState.status === 'error'
        ? `Unavailable (${artifactState.message})`
        : 'Unavailable';

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

  const runVerification = useCallback(
    async (claim: ClaimLookupResult, verificationKey: string) => {
      if (!publicClient || !artifact) {
        return;
      }

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
    },
    [artifact, connectedChainId, isConnected, publicClient],
  );

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
  }, [connectedChainId, lookupState, runVerification]);

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
        <header className="panel-header panel-header-hero">
          <h1>Dai Recovery</h1>
        </header>

        <section className="general-info">
          <article className="meta-item meta-item-group">
            <p className="meta-line">
              <span className="label-text">Accumulator Root</span>{' '}
              <span className="meta-inline-value" title={artifact?.merkle.root}>
                {artifact ? artifact.merkle.root : artifactFallbackValue}
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
            <p className="meta-line">
              <span className="label-text">Total Amount (DAI)</span>{' '}
              <span
                className="meta-inline-value"
                title={artifact?.build.input.totalAmount}
              >
                {artifact
                  ? formatRoundedUpWholeDai(
                      BigInt(artifact.build.input.totalAmount),
                    )
                  : artifactFallbackValue}
              </span>
            </p>
            <p className="meta-line">
              <span className="label-text">Synced up to</span>{' '}
              <span
                className="meta-inline-value"
                title={
                  artifact
                    ? `Block ${artifact.build.input.synced_block_number} - ${artifact.build.input.synced_date}`
                    : undefined
                }
              >
                {artifact
                  ? `Block ${formatIntegerString(artifact.build.input.synced_block_number)} - ${artifact.build.input.synced_date}`
                  : artifactFallbackValue}
              </span>
            </p>
          </article>
        </section>

        <div className="content-grid">
          <section className="info-column">
            <article className="narrative-card">
              <h2 className="narrative-title">What This Is</h2>
              <p className="narrative-text">
                This tool verifies whether an address is included in the DAI
                loss recovery dataset. The dataset aggregates mistaken DAI
                transfers by sender address and commits them into a
                deterministic Merkle accumulator root. Your address is checked
                locally and then confirmed with an onchain `eth_call` against
                the deployed verifier contract.
              </p>
              <p className="narrative-text">
                This page is a proof-verification interface only. It does not
                move funds, execute claims, or request approvals. The right-hand
                form checks whether an address maps to a valid tuple (`address`,
                `total amount`, `proof`) under the current accumulator root.
              </p>
              <p className="narrative-text">
                If an address is included, the UI shows the exact recorded loss
                amount and whether onchain verification succeeds against the
                configured verifier contract. If it is not included, the UI
                reports that no dataset entry exists for that address.
              </p>
            </article>
          </section>

          <section className="form-column">
            <section className="result-card check-section">
              <div className="check-section-header">
                <h2>Check Your Address</h2>
                <div className="header-actions">
                  <ConnectKitButton showBalance={false} />
                </div>
              </div>
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
                  Config root mismatch: `VITE_MERKLE_ROOT` does not match the
                  loaded accumulator.
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
                    <span className="row-value">
                      {formatDaiAmount(lookupState.claim.totalLost)}
                    </span>
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
        </div>
      </section>
    </main>
  );
}
