"use client";

import { useSignMessage, useAccount } from "wagmi";
import { useState } from "react";
import { getNonce, verifySignature } from "@/app/lib/api/endpoints";
import { DMS_TOKEN_STORAGE_KEY } from "@/app/lib/api/config";

export function useSiweAuth() {
  const { address } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [token, setToken] = useState<string | null>(() => {
    if (typeof window === "undefined") {
      return null;
    }
    return localStorage.getItem(DMS_TOKEN_STORAGE_KEY);
  });

  async function signIn(walletAddress?: string) {
    const targetAddress = walletAddress ?? address;
    if (!targetAddress) throw new Error("No wallet connected");

    const { nonce } = await getNonce(targetAddress);

    const message = `Sign in to Dead Man's Switch\nWallet: ${targetAddress}\nNonce: ${nonce}`;
    const signature = await signMessageAsync({ message });

    const { token } = await verifySignature({ walletAddress: targetAddress, nonce, signature });

    localStorage.setItem(DMS_TOKEN_STORAGE_KEY, token);
    setToken(token);
    return { token, address: targetAddress };
  }

  return {
    token,
    signIn,
    signOut: () => {
      localStorage.removeItem(DMS_TOKEN_STORAGE_KEY);
      setToken(null);
    },
    isAuthenticated: !!token,
  };
}
