"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAccount, useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { FaEthereum, FaWallet } from "react-icons/fa6";
import { DeadVaultApp } from "./DeadVaultApp";
import {
  AUTH_PROFILE_STORAGE_KEY,
  type Recipient,
  type StoredProfile,
} from "./authStorage";
import { useSiweAuth } from "@/src/hooks/useSiweAuth";
import { DMS_TOKEN_STORAGE_KEY } from "@/app/lib/api/config";

type EthereumProvider = {
  isCoinbaseWallet?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

const MAX_RECIPIENTS = 5;

function normalizeProfile(profile: StoredProfile): StoredProfile {
  return {
    ...profile,
    contracts: Array.isArray(profile.contracts) ? profile.contracts : [],
  };
}

function getEthereumProvider(): EthereumProvider | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return (window as Window & { ethereum?: EthereumProvider }).ethereum;
}

function getReadableAuthError(error: unknown): string {
  if (typeof error === "object" && error !== null) {
    const maybeCode = (error as { code?: number }).code;
    if (maybeCode === 4001) {
      return "Wallet request was rejected.";
    }

    const maybeStatus = (error as { status?: number }).status;
    if (maybeStatus === 401) {
      return "Signature verification failed or nonce expired. Please try again.";
    }

    const maybeMessage = (error as { message?: string }).message;
    if (maybeMessage) {
      if (maybeMessage.toLowerCase().includes("failed to fetch")) {
        return "Backend unreachable. Check NEXT_PUBLIC_API_BASE_URL and backend status.";
      }
      if (maybeMessage.toLowerCase().includes("no injected") || maybeMessage.toLowerCase().includes("provider")) {
        return "No wallet provider found. Install or enable Coinbase Wallet/MetaMask.";
      }
      return maybeMessage;
    }
  }

  return "Sign In with Ethereum failed. Please try again.";
}

export function DeadVaultShell() {
  const [ready, setReady] = useState(false);
  const [profile, setProfile] = useState<StoredProfile | null>(null);
  const [hasExistingAccount, setHasExistingAccount] = useState(false);

  useEffect(() => {
    queueMicrotask(() => {
      try {
        const raw = localStorage.getItem(AUTH_PROFILE_STORAGE_KEY);
        const token = localStorage.getItem(DMS_TOKEN_STORAGE_KEY);
        if (!raw) {
          if (token) {
            setHasExistingAccount(true);
          }
          setReady(true);
          return;
        }
        const parsed = normalizeProfile(JSON.parse(raw) as StoredProfile);
        if (parsed.onboardingCompleted) {
          if (token) {
            setProfile(parsed);
          } else {
            setHasExistingAccount(true);
          }
        }
      } catch {
        // Ignore malformed local profile and allow user to onboard again.
      }
      setReady(true);
    });
  }, []);

  const handleWalletAddressChange = useCallback((walletAddress: string | null) => {
    setProfile((current) => {
      if (!current) {
        return current;
      }
      const next = { ...current, walletAddress };
      localStorage.setItem(AUTH_PROFILE_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const handleDeleteAccount = useCallback(() => {
    localStorage.removeItem(AUTH_PROFILE_STORAGE_KEY);
    localStorage.removeItem(DMS_TOKEN_STORAGE_KEY);
    setProfile(null);
    setHasExistingAccount(false);
  }, []);

  const handleLogout = useCallback(() => {
    localStorage.removeItem(DMS_TOKEN_STORAGE_KEY);
    setProfile(null);
    setHasExistingAccount(true);
  }, []);

  if (!ready) {
    return (
      <main className="dv-main">
        <section className="dv-auth-wrap">
          <div className="dv-auth-shell">
            <h1 className="dv-hero-title">LOADING</h1>
            <p className="dv-subcopy">Preparing your vault session...</p>
          </div>
        </section>
      </main>
    );
  }

  if (!profile) {
    if (hasExistingAccount) {
      return (
        <main className="dv-main">
          <section className="dv-auth-wrap">
            <div className="dv-auth-shell dv-screen">
              <p className="dv-label">WELCOME BACK</p>
              <h1 className="dv-hero-title">SIGN IN REQUIRED</h1>
              <p className="dv-subcopy">An existing DeadVault account was found on this device. Sign in with Ethereum to continue or create a new account.</p>
              <div className="dv-auth-actions">
                <Link href="/login" className="dv-btn-primary" style={{ textDecoration: "none", textAlign: "center" }}>
                  Go To Login
                </Link>
                <button type="button" className="dv-btn-light" onClick={() => setHasExistingAccount(false)}>
                  Create New Account
                </button>
              </div>
            </div>
          </section>
        </main>
      );
    }

    return <CreateAccountFlow onComplete={setProfile} />;
  }

  return (
    <DeadVaultApp
      initialWalletAddress={profile.walletAddress}
      onWalletAddressChange={handleWalletAddressChange}
      onDeleteAccount={handleDeleteAccount}
      onLogout={handleLogout}
    />
  );
}

function CreateAccountFlow({ onComplete }: { onComplete: (profile: StoredProfile) => void }) {
  const { address } = useAccount();
  const { connectAsync } = useConnect();
  const { signIn } = useSiweAuth();
  const [step, setStep] = useState(0);
  const [authWalletAddress, setAuthWalletAddress] = useState<string | null>(null);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [walletError, setWalletError] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientWallet, setRecipientWallet] = useState("");
  const [recipientNote, setRecipientNote] = useState("");
  const [recipients, setRecipients] = useState<Recipient[]>([]);
  const [skipWallet, setSkipWallet] = useState(false);
  const [skipRecipients, setSkipRecipients] = useState(false);
  const [formError, setFormError] = useState("");

  const stepTitle = useMemo(() => {
    if (step === 0) return "Create Account";
    if (step === 1) return "Connect Coinbase Wallet";
    if (step === 2) return "Add Recipients";
    return "Review & Finish";
  }, [step]);

  const connectCoinbase = async () => {
    const provider = getEthereumProvider();
    if (!provider || !provider.isCoinbaseWallet) {
      setWalletError("Coinbase Wallet not detected. Install Coinbase Wallet first.");
      return;
    }

    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      const first = accounts[0] ?? null;
      setWalletAddress(first);
      setWalletError(first ? "" : "No account returned by Coinbase Wallet.");
      if (first) {
        setSkipWallet(false);
      }
    } catch {
      setWalletError("Wallet connection request was cancelled or failed.");
    }
  };

  const signInWithEthereum = async () => {
    setFormError("");
    setIsSigningIn(true);
    try {
      const provider = getEthereumProvider();
      let connectedAddress: string | undefined = address ?? undefined;

      if (provider) {
        try {
          await provider.request({
            method: "wallet_requestPermissions",
            params: [{ eth_accounts: {} }],
          });
        } catch {
          // Some wallets do not support this method; fallback to account request.
        }

        try {
          const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
          connectedAddress = accounts[0] ?? connectedAddress;
        } catch {
          // Fallback to connector-based selection below.
        }
      }

      if (!connectedAddress) {
        const connection = await connectAsync({ connector: injected() });
        connectedAddress = connection.accounts[0];
      }
      if (!connectedAddress) {
        setFormError("Wallet connection failed.");
        return;
      }

      await signIn(connectedAddress);
      setAuthWalletAddress(connectedAddress);
      if (!walletAddress) {
        setWalletAddress(connectedAddress);
      }
      setSkipWallet(false);
    } catch (error: unknown) {
      setFormError(getReadableAuthError(error));
    } finally {
      setIsSigningIn(false);
    }
  };

  const addRecipient = () => {
    setFormError("");
    if (recipients.length >= MAX_RECIPIENTS) {
      setFormError("You can only add up to 5 recipients.");
      return;
    }
    if (!recipientName.trim() || !recipientWallet.trim()) {
      setFormError("Recipient name and wallet are required.");
      return;
    }

    const nextRecipient: Recipient = {
      name: recipientName.trim(),
      wallet: recipientWallet.trim(),
      note: recipientNote.trim(),
    };

    setRecipients((current) => [...current, nextRecipient]);
    setRecipientName("");
    setRecipientWallet("");
    setRecipientNote("");
    setSkipRecipients(false);
  };

  const removeRecipient = (index: number) => {
    setRecipients((current) => current.filter((_, i) => i !== index));
  };

  const validateAndContinue = () => {
    setFormError("");

    if (step === 0) {
      if (!authWalletAddress) {
        setFormError("Please complete Sign In with Ethereum.");
        return;
      }
    }

    if (step === 1 && !walletAddress && !skipWallet) {
      setFormError("Connect a Coinbase wallet or choose skip.");
      return;
    }

    if (step === 2 && recipients.length === 0 && !skipRecipients) {
      setFormError("Add at least one recipient or choose skip.");
      return;
    }

    setStep((current) => Math.min(current + 1, 3));
  };

  const finishOnboarding = async () => {
    const nextProfile: StoredProfile = {
      authWalletAddress: authWalletAddress ?? "",
      walletAddress,
      recipients,
      contracts: [],
      skipped: {
        wallet: skipWallet || !walletAddress,
        recipients: skipRecipients || recipients.length === 0,
      },
      onboardingCompleted: true,
      createdAt: new Date().toISOString(),
    };

    localStorage.setItem(AUTH_PROFILE_STORAGE_KEY, JSON.stringify(nextProfile));
    onComplete(nextProfile);
  };

  return (
    <main className="dv-main">
      <section className="dv-auth-wrap">
        <div className="dv-auth-shell dv-screen">
          <p className="dv-label">ONBOARDING</p>
          <h1 className="dv-hero-title">{stepTitle.toUpperCase()}</h1>
          <p className="dv-subcopy">Set up your account with Sign In with Ethereum, wallet access, and beneficiaries. You can skip optional steps and return later.</p>

          <div className="dv-auth-stepper">
            <span className={step >= 0 ? "is-active" : ""}>Account</span>
            <span className={step >= 1 ? "is-active" : ""}>Wallet</span>
            <span className={step >= 2 ? "is-active" : ""}>Recipients</span>
            <span className={step >= 3 ? "is-active" : ""}>Finish</span>
          </div>

          {step === 0 ? (
            <div className="dv-profile-card dv-auth-grid dv-auth-grid--account">
              <p className="dv-subcopy">Connected wallet: <strong>{authWalletAddress ?? address ?? "Not connected"}</strong></p>
              <button type="button" className="dv-btn-primary dv-auth-btn dv-auth-btn--brand" onClick={() => void signInWithEthereum()} disabled={isSigningIn}>
                <FaEthereum className="dv-auth-btn-icon" aria-hidden="true" />
                <span className="dv-auth-btn-label">{isSigningIn ? "Signing In..." : "Sign In with Ethereum"}</span>
              </button>
            </div>
          ) : null}

          {step === 1 ? (
            <div className="dv-profile-card dv-auth-grid">
              <p className="dv-subcopy">Connect Coinbase Wallet now, or skip and connect later in settings.</p>
              <div className="dv-profile-row">
                <strong>{walletAddress ?? "No wallet connected"}</strong>
                <button type="button" className="dv-btn-light dv-auth-btn" onClick={connectCoinbase}>
                  <FaWallet className="dv-auth-btn-icon" aria-hidden="true" />
                  <span className="dv-auth-btn-label">Connect Coinbase</span>
                </button>
              </div>
              <button type="button" className="dv-auth-skip" onClick={() => setSkipWallet((v) => !v)}>
                {skipWallet ? "Undo Skip" : "Skip Wallet For Now"}
              </button>
              {walletError ? <p className="dv-inline-error">{walletError}</p> : null}
            </div>
          ) : null}

          {step === 2 ? (
            <div className="dv-profile-card dv-auth-grid">
              <p className="dv-subcopy">Add up to 5 recipients. Each recipient can be used in future smart contract distribution.</p>
              <label>
                Recipient Name
                <input className="dv-auth-input" type="text" value={recipientName} onChange={(e) => setRecipientName(e.target.value)} placeholder="Jane Doe" />
              </label>
              <label>
                Recipient Wallet
                <input className="dv-auth-input" type="text" value={recipientWallet} onChange={(e) => setRecipientWallet(e.target.value)} placeholder="0x..." />
              </label>
              <label>
                Note (optional)
                <input className="dv-auth-input" type="text" value={recipientNote} onChange={(e) => setRecipientNote(e.target.value)} placeholder="Primary beneficiary" />
              </label>
              <div className="dv-auth-actions">
                <button type="button" className="dv-btn-light" onClick={addRecipient}>Add Recipient</button>
                <button type="button" className="dv-auth-skip" onClick={() => setSkipRecipients((v) => !v)}>
                  {skipRecipients ? "Undo Skip" : "Skip Recipients For Now"}
                </button>
              </div>

              <ul className="dv-auth-list">
                {recipients.map((recipient, index) => (
                  <li key={`${recipient.wallet}-${index}`}>
                    <div>
                      <strong>{recipient.name}</strong>
                      <p>{recipient.wallet}</p>
                    </div>
                    <button type="button" onClick={() => removeRecipient(index)}>Remove</button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {step === 3 ? (
            <div className="dv-profile-card dv-auth-grid">
              <div className="dv-profile-row">
                <span>Authentication</span>
                <strong>{authWalletAddress ? "SIWE Complete" : "Not complete"}</strong>
              </div>
              <div className="dv-profile-row">
                <span>Wallet</span>
                <strong>{walletAddress ?? (skipWallet ? "Skipped" : "Not connected")}</strong>
              </div>
              <div className="dv-profile-row">
                <span>Recipients</span>
                <strong>{skipRecipients ? "Skipped" : `${recipients.length} added`}</strong>
              </div>
              <p className="dv-subcopy">You can update wallet and recipients later from settings.</p>
            </div>
          ) : null}

          {formError ? <p className="dv-inline-error">{formError}</p> : null}

          <div className="dv-auth-actions">
            {step > 0 ? (
              <button type="button" className="dv-btn-light" onClick={() => setStep((current) => Math.max(current - 1, 0))}>
                Back
              </button>
            ) : <span />}

            {step < 3 ? (
              <button type="button" className="dv-btn-primary" onClick={validateAndContinue}>Continue</button>
            ) : (
              <button type="button" className="dv-btn-primary" onClick={() => void finishOnboarding()}>Create Account</button>
            )}
          </div>

          {step === 0 ? (
            <p className="dv-subcopy" style={{ fontSize: "0.95rem" }}>
              Already have an account? <Link href="/login" style={{ color: "#0448ff" }}>Back to Login</Link>.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
