"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useConnect } from "wagmi";
import { injected } from "wagmi/connectors";
import { FaArrowLeftLong, FaEthereum, FaWallet } from "react-icons/fa6";
import {
  AUTH_PROFILE_STORAGE_KEY,
  type StoredProfile,
} from "./authStorage";
import { useSiweAuth } from "@/src/hooks/useSiweAuth";

type EthereumProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
};

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

  return "Sign in with Ethereum failed. Check wallet and backend connection, then try again.";
}

export function LoginPage() {
  const router = useRouter();
  const { connectAsync } = useConnect();
  const { signIn } = useSiweAuth();
  const [error, setError] = useState("");
  const [selectedWalletAddress, setSelectedWalletAddress] = useState<string | null>(null);
  const [isSwitchingWallet, setIsSwitchingWallet] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [hasProfile] = useState<boolean>(() => {
    if (typeof window === "undefined") {
      return false;
    }
    return Boolean(localStorage.getItem(AUTH_PROFILE_STORAGE_KEY));
  });

  const requestWalletSelection = async (): Promise<string | null> => {
    const provider = getEthereumProvider();
    let connectedAddress: string | undefined;

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
        connectedAddress = accounts[0];
      } catch {
        // Fallback to connector-based selection below.
      }
    }

    if (!connectedAddress) {
      const connection = await connectAsync({ connector: injected() });
      connectedAddress = connection.accounts[0];
    }

    return connectedAddress ?? null;
  };

  const handleSwitchWallet = async () => {
    setError("");
    setIsSwitchingWallet(true);
    try {
      const wallet = await requestWalletSelection();
      if (!wallet) {
        setError("Wallet switch failed.");
        return;
      }
      setSelectedWalletAddress(wallet);
    } catch (error: unknown) {
      setError(getReadableAuthError(error));
    } finally {
      setIsSwitchingWallet(false);
    }
  };

  const handleLogin = async () => {
    setError("");
    setIsSigningIn(true);
    const raw = localStorage.getItem(AUTH_PROFILE_STORAGE_KEY);
    if (!raw) {
      setError("No account found. Please create an account first.");
      setIsSigningIn(false);
      return;
    }

    try {
      const stored = JSON.parse(raw) as StoredProfile;
      const connectedAddress = selectedWalletAddress ?? (await requestWalletSelection());

      if (!connectedAddress) {
        setError("Wallet connection failed.");
        return;
      }

      if ((stored.authWalletAddress ?? "").toLowerCase() !== connectedAddress.toLowerCase()) {
        setError("Connected wallet does not match this account.");
        return;
      }

      await signIn(connectedAddress);
      router.replace("/");
    } catch (error: unknown) {
      setError(getReadableAuthError(error));
    } finally {
      setIsSigningIn(false);
    }
  };

  return (
    <main className="dv-main">
      <section className="dv-auth-wrap">
        <div className="dv-auth-shell dv-screen">
          <p className="dv-label">AUTH</p>
          <h1 className="dv-hero-title">LOGIN</h1>
          <p className="dv-subcopy">Use your wallet to sign in with Ethereum.</p>

          {error ? <p className="dv-inline-error">{error}</p> : null}

          <div className="dv-auth-actions">
            <Link href="/" className="dv-btn-light dv-auth-btn" style={{ textDecoration: "none", textAlign: "center" }}>
              <FaArrowLeftLong className="dv-auth-btn-icon" aria-hidden="true" />
              <span className="dv-auth-btn-label">Back</span>
            </Link>
            <button type="button" className="dv-btn-light dv-auth-btn" onClick={() => void handleSwitchWallet()} disabled={isSwitchingWallet || isSigningIn}>
              <FaWallet className="dv-auth-btn-icon" aria-hidden="true" />
              <span className="dv-auth-btn-label">{isSwitchingWallet ? "Switching..." : "Switch Wallet"}</span>
            </button>
            <button type="button" className="dv-btn-primary dv-auth-btn dv-auth-btn--brand" onClick={() => void handleLogin()} disabled={isSigningIn}>
              <FaEthereum className="dv-auth-btn-icon" aria-hidden="true" />
              <span className="dv-auth-btn-label">{isSigningIn ? "Signing In..." : "Sign In with Ethereum"}</span>
            </button>
          </div>

          {!hasProfile ? (
            <p className="dv-subcopy" style={{ fontSize: "0.95rem" }}>
              No account found on this device. <Link href="/" style={{ color: "#0448ff" }}>Create one now</Link>.
            </p>
          ) : null}
        </div>
      </section>
    </main>
  );
}
