"use client";

import { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { WagmiProvider, createConfig, http } from "wagmi";
import { base, baseSepolia, mainnet, polygon } from "wagmi/chains";
import { coinbaseWallet, injected, walletConnect } from "wagmi/connectors";

const walletConnectProjectId = process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID?.trim() ?? "";
const hasRuntimeWindow = typeof window !== "undefined";
const hasWebCryptoSubtle = hasRuntimeWindow && typeof window.crypto?.subtle !== "undefined";
const shouldEnableCoinbaseSdk = hasRuntimeWindow && window.isSecureContext && hasWebCryptoSubtle;
const configuredChains = [base, baseSepolia, mainnet, polygon] as const;

const wagmiConfig = createConfig({
  chains: configuredChains,
  connectors: [
    injected({
      shimDisconnect: true,
      unstable_shimAsyncInject: 2_000,
    }),
    ...(walletConnectProjectId
      ? [
          walletConnect({
            projectId: walletConnectProjectId,
            metadata: {
              name: "DeadVault",
              description: "DeadVault mobile and desktop wallet access",
              url: "https://deadvault.app",
              icons: ["https://deadvault.app/icon.png"],
            },
            showQrModal: true,
          }),
        ]
      : []),
    ...(shouldEnableCoinbaseSdk
      ? [
          coinbaseWallet({
            appName: "DeadVault",
          }),
        ]
      : []),
  ],
  transports: {
    [base.id]: http(),
    [baseSepolia.id]: http(),
    [mainnet.id]: http(),
    [polygon.id]: http(),
  },
});

const queryClient = new QueryClient();

export function Web3Provider({ children }: { children: ReactNode }) {
  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
    </WagmiProvider>
  );
}
