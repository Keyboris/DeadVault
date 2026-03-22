"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { IconType } from "react-icons";
import {
  checkIn,
  getCheckInStatus,
  getContracts as getContractsRequest,
} from "@/app/lib/api/endpoints";
import { DMS_TOKEN_STORAGE_KEY } from "@/app/lib/api/config";
import {
  FaArrowUpRightFromSquare,
  FaAt,
  FaBuildingColumns,
  FaChevronRight,
  FaCircleInfo,
  FaClock,
  FaGear,
  FaFileContract,
  FaHeartPulse,
  FaKey,
  FaLock,
  FaPlus,
  FaShieldHalved,
  FaTableCellsLarge,
  FaWallet,
} from "react-icons/fa6";

type ScreenName = "home" | "payment" | "address" | "settings";
const HOME_HERO_TEXT = "MONEY HAS NO VALUE IN DEATH";

function TypingHeroTitle({
  text,
  className,
  typingMs = 55,
  pauseMs = 1200,
}: {
  text: string;
  className: string;
  typingMs?: number;
  pauseMs?: number;
}) {
  const [visibleCount, setVisibleCount] = useState(0);

  useEffect(() => {
    if (visibleCount >= text.length) {
      const hold = window.setTimeout(() => {
        setVisibleCount(0);
      }, pauseMs);
      return () => window.clearTimeout(hold);
    }

    const step = window.setTimeout(() => {
      setVisibleCount((current) => Math.min(current + 1, text.length));
    }, typingMs);

    return () => window.clearTimeout(step);
  }, [visibleCount, text, typingMs, pauseMs]);

  return (
    <h1 className={className} aria-label={text}>
      {text.slice(0, visibleCount)}
      <span className="dv-typing-cursor" aria-hidden="true">|</span>
    </h1>
  );
}

function formatCountdown(isoTime: string | null, currentMs: number): string {
  if (!isoTime) {
    return "00:00:00:00";
  }

  const target = new Date(isoTime).getTime();
  if (Number.isNaN(target)) {
    return "00:00:00:00";
  }

  const diffMs = Math.max(0, target - currentMs);
  const totalSeconds = Math.floor(diffMs / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(days).padStart(2, "0")}:${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

function screenFromPath(pathname: string): ScreenName {
  if (pathname.startsWith("/settings")) {
    return "settings";
  }
  if (pathname.startsWith("/payment")) {
    return "payment";
  }
  if (pathname.startsWith("/address")) {
    return "address";
  }
  return "home";
}

function pathFromScreen(screen: ScreenName): string {
  if (screen === "settings") {
    return "/settings";
  }
  if (screen === "payment") {
    return "/payment";
  }
  if (screen === "address") {
    return "/address";
  }
  return "/";
}

function navigateWithTransition(push: (path: string) => void, path: string) {
  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => { finished: Promise<void> };
  };

  if (typeof doc.startViewTransition === "function") {
    doc.startViewTransition(() => {
      push(path);
    });
    return;
  }

  push(path);
}

type EventItem = {
  title: string;
  desc: string;
  age: string;
  Icon: IconType;
  muted?: boolean;
};

type ChainName = "Ethereum" | "Polygon";

type EthereumProvider = {
  isCoinbaseWallet?: boolean;
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (event: string, listener: (...args: unknown[]) => void) => void;
  removeListener?: (event: string, listener: (...args: unknown[]) => void) => void;
};

const BASE_CHAIN_ID_HEX = "0x2105";

function getEthereumProvider(): EthereumProvider | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  const maybeEthereum = (window as Window & { ethereum?: EthereumProvider }).ethereum;
  return maybeEthereum;
}

function shortAddress(address: string): string {
  if (address.length < 10) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

const mobileEvents: EventItem[] = [
  { title: "Contract Authorized", desc: "Signature verification complete", age: "12m", Icon: FaFileContract },
  { title: "Vault Heartbeat Detected", desc: "Pulse confirmed at 04:00 UTC", age: "4h", Icon: FaHeartPulse },
  { title: "Access Key Rotated", desc: "Security layer update applied", age: "1d", Icon: FaKey },
  { title: "Asset Audit Complete", desc: "0.42 ETH verified in storage", age: "2d", Icon: FaWallet },
  { title: "Legacy Genesis", desc: "Vault initialization successful", age: "5d", Icon: FaClock, muted: true },
];

const desktopEvents: EventItem[] = [
  {
    title: "Contract Authorized",
    desc: "Smart contract execution path validated by 3-of-5 multisig nodes.",
    age: "12M",
    Icon: FaShieldHalved,
  },
  {
    title: "Vault Heartbeat Detected",
    desc: "Liveness check performed successfully. The countdown remains stable.",
    age: "4H",
    Icon: FaHeartPulse,
  },
  {
    title: "Access Key Rotated",
    desc: "Zero-knowledge proof generated for new ephemeral governance keys.",
    age: "1D",
    Icon: FaKey,
  },
  {
    title: "Ledger Sync Complete",
    desc: "Vault state synchronized across all global ledger observers.",
    age: "3D",
    Icon: FaBuildingColumns,
  },
];

export function DeadVaultApp({
  initialWalletAddress = null,
  onWalletAddressChange,
  onDeleteAccount,
  onLogout,
}: {
  initialWalletAddress?: string | null;
  onWalletAddressChange?: (walletAddress: string | null) => void;
  onDeleteAccount: () => void;
  onLogout?: () => void;
}) {
  const [screen, setScreen] = useState<ScreenName>("home");
  const [desktop, setDesktop] = useState(false);
  const [autoTrigger, setAutoTrigger] = useState(true);
  const [privacyShield, setPrivacyShield] = useState(false);
  const [securityAlerts, setSecurityAlerts] = useState(true);
  const [biometricUnlock, setBiometricUnlock] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState(true);
  const [chain, setChain] = useState<ChainName>("Ethereum");
  const [walletAddress, setWalletAddress] = useState<string | null>(initialWalletAddress);
  const [walletChainId, setWalletChainId] = useState<string | null>(null);
  const [walletError, setWalletError] = useState<string>("");
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusText, setStatusText] = useState("UNKNOWN");
  const [contractStatus, setContractStatus] = useState("UNKNOWN");
  const [vaultValueEth, setVaultValueEth] = useState("0");
  const [vaultValueError, setVaultValueError] = useState("");
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const pathname = usePathname();
  const router = useRouter();
  const countdownText = formatCountdown(nextDueAt, clockTick);

  const refreshContracts = useCallback(async () => {
    const token = localStorage.getItem(DMS_TOKEN_STORAGE_KEY);
    if (!token) {
      setContractStatus("UNAUTHENTICATED");
      setVaultValueEth("0");
      setVaultValueError("Please sign in to load contracts.");
      return;
    }

    try {
      const response = await getContractsRequest();
      const activeContract = response.find((c) => c.status === "ACTIVE") ?? response[0];
      setContractStatus(activeContract?.status ?? "NO_VAULT");
      setVaultValueEth(activeContract?.ethBalanceEther ?? "0");
      setVaultValueError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Contract list is temporarily unavailable.";
      setContractStatus("UNAVAILABLE");
      setVaultValueEth("0");
      setVaultValueError(message);
    }
  }, []);

  const refreshCheckInStatus = async () => {
    const token = localStorage.getItem(DMS_TOKEN_STORAGE_KEY);
    if (!token) {
      setStatusText("UNAUTHENTICATED");
      setStatusError("Please sign in to load check-in status.");
      return;
    }

    try {
      const status = await getCheckInStatus();
      setStatusText(status.status);
      setStatusError("");
      setNextDueAt(status.nextDueAt);
      const derivedDays = Math.max(0, Math.floor(status.secondsRemaining / 86400));
      setDaysRemaining(derivedDays);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check-in status is temporarily unavailable.";
      setStatusError(message);
      setStatusText("UNAVAILABLE");
      setNextDueAt(null);
      setDaysRemaining(null);
    }
  };

  const handleCheckIn = async () => {
    const token = localStorage.getItem(DMS_TOKEN_STORAGE_KEY);
    if (!token) {
      setStatusError("Please sign in before checking in.");
      return;
    }

    setIsCheckingIn(true);
    try {
      const response = await checkIn();
      setNextDueAt(response.nextDueAt);
      setStatusText("ACTIVE");
      setStatusError("");
      await refreshCheckInStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check-in failed. Please try again.";
      setStatusError(message);
    } finally {
      setIsCheckingIn(false);
    }
  };

  const navigateToScreen = (nextScreen: ScreenName) => {
    setScreen(nextScreen);
    const nextPath = pathFromScreen(nextScreen);
    if (pathname !== nextPath) {
      navigateWithTransition(router.push, nextPath);
    }
  };

  const openActionPage = (slug: string) => {
    navigateWithTransition(router.push, `/action/${slug}`);
  };

  const validateBaseNetwork = (chainId: string | null) => {
    if (!chainId) {
      setWalletError("Could not detect current network from Coinbase Wallet.");
      return;
    }
    if (chainId.toLowerCase() !== BASE_CHAIN_ID_HEX) {
      setWalletError("Please switch Coinbase Wallet to Base network to continue.");
      return;
    }
    setWalletError("");
  };

  const connectCoinbaseWallet = async () => {
    const provider = getEthereumProvider();

    if (!provider || !provider.isCoinbaseWallet) {
      setWalletError("Coinbase Wallet not detected. Install Coinbase Wallet extension/app first.");
      return;
    }

    try {
      await provider.request({ method: "eth_requestAccounts" });
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      const chainId = (await provider.request({ method: "eth_chainId" })) as string;
      const firstAccount = accounts[0] ?? null;
      setWalletAddress(firstAccount);
      setWalletChainId(chainId ?? null);
      if (!firstAccount) {
        setWalletError("No connected Coinbase wallet account.");
        return;
      }
      validateBaseNetwork(chainId ?? null);
    } catch {
      setWalletError("Wallet connection request was cancelled or failed.");
    }
  };

  const changeCoinbaseWallet = async () => {
    const provider = getEthereumProvider();
    if (!provider || !provider.isCoinbaseWallet) {
      setWalletError("Coinbase Wallet not detected. Install Coinbase Wallet extension/app first.");
      return;
    }

    try {
      // Re-requesting accounts opens wallet account selection in compatible Coinbase clients.
      await provider.request({ method: "eth_requestAccounts" });
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      const chainId = (await provider.request({ method: "eth_chainId" })) as string;
      const firstAccount = accounts[0] ?? null;
      setWalletAddress(firstAccount);
      setWalletChainId(chainId ?? null);
      if (!firstAccount) {
        setWalletError("No connected Coinbase wallet account.");
        return;
      }
      validateBaseNetwork(chainId ?? null);
    } catch {
      setWalletError("Wallet change request was cancelled or failed.");
    }
  };

  const disconnectCoinbaseWallet = () => {
    setWalletAddress(null);
    setWalletChainId(null);
    setWalletError("");
  };

  useEffect(() => {
    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => {
      const isDesktop = media.matches;
      setDesktop(isDesktop);
    };
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const syncedScreen = screenFromPath(pathname);
    setScreen(syncedScreen);
  }, [pathname]);

  useEffect(() => {
    setWalletAddress(initialWalletAddress);
  }, [initialWalletAddress]);

  useEffect(() => {
    onWalletAddressChange?.(walletAddress);
  }, [walletAddress, onWalletAddressChange]);

  useEffect(() => {
    async function loadExistingCoinbaseSession() {
      const provider = getEthereumProvider();
      if (!provider || !provider.isCoinbaseWallet) {
        return;
      }

      try {
        const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
        const chainId = (await provider.request({ method: "eth_chainId" })) as string;
        const firstAccount = accounts[0] ?? null;
        setWalletAddress(firstAccount);
        setWalletChainId(chainId ?? null);
        if (!firstAccount) {
          setWalletError("No connected Coinbase wallet account.");
          return;
        }
        validateBaseNetwork(chainId ?? null);
      } catch {
        setWalletAddress(null);
        setWalletChainId(null);
      }
    }

    loadExistingCoinbaseSession();
  }, []);

  useEffect(() => {
    const provider = getEthereumProvider();
    if (!provider || !provider.isCoinbaseWallet || !provider.on || !provider.removeListener) {
      return;
    }

    const handleAccountsChanged = (accounts: unknown) => {
      const nextAccounts = Array.isArray(accounts) ? (accounts as string[]) : [];
      const nextAccount = nextAccounts[0] ?? null;
      setWalletAddress(nextAccount);
      if (!nextAccount) {
        setWalletError("No connected Coinbase wallet account.");
      } else if (walletChainId?.toLowerCase() === BASE_CHAIN_ID_HEX) {
        setWalletError("");
      }
    };

    const handleChainChanged = (chainId: unknown) => {
      const nextChainId = typeof chainId === "string" ? chainId : null;
      setWalletChainId(nextChainId);
      validateBaseNetwork(nextChainId);
    };

    provider.on("accountsChanged", handleAccountsChanged);
    provider.on("chainChanged", handleChainChanged);

    return () => {
      provider.removeListener?.("accountsChanged", handleAccountsChanged);
      provider.removeListener?.("chainChanged", handleChainChanged);
    };
  }, [walletChainId]);

  useEffect(() => {
    let mounted = true;
    async function animate() {
      const animeModule = await import("animejs");
      const anime = animeModule.default;
      if (!mounted || !anime) {
        return;
      }
      anime({
        targets: ".dv-screen",
        opacity: [0, 1],
        translateY: [18, 0],
        duration: 420,
        easing: "easeOutQuart",
      });
    }
    animate();
    return () => {
      mounted = false;
    };
  }, [screen, desktop]);

  useEffect(() => {
    const timer = setInterval(() => {
      setClockTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    refreshCheckInStatus();
    const poll = setInterval(() => {
      void refreshCheckInStatus();
    }, 30000);
    return () => clearInterval(poll);
  }, []);

  useEffect(() => {
    void refreshContracts();
  }, [refreshContracts]);

  return (
    <div className="dv-root">
      <header className="dv-topbar">
        <div className="dv-brand-wrap">
          <FaLock className="dv-icon-inline dv-blue" aria-hidden="true" />
          <span className="dv-brand">DeadVault</span>
        </div>

        {desktop ? (
          <nav className="dv-header-nav" aria-label="Top navigation">
            <button type="button" className={screen === "home" ? "is-active" : ""} onClick={() => navigateToScreen("home")}>Home</button>
            <button type="button" className={screen === "payment" ? "is-active" : ""} onClick={() => navigateToScreen("payment")}>Payment</button>
            <button type="button" className={screen === "address" ? "is-active" : ""} onClick={() => navigateToScreen("address")}>Address</button>
          </nav>
        ) : null}

        <button
          className="dv-icon-btn"
          type="button"
          aria-label="Open settings"
          onClick={() => {
            navigateToScreen("settings");
          }}
        >
          <FaGear className="dv-icon-inline" aria-hidden="true" />
        </button>
      </header>

      <main className="dv-main dv-screen">
        {screen === "home" ? (
          desktop ? (
            <DesktopDashboard
              chain={chain}
              countdownText={countdownText}
              checkInStatus={statusText}
              contractStatus={contractStatus}
              vaultValueEth={vaultValueEth}
              vaultValueError={vaultValueError}
              daysRemaining={daysRemaining}
              onSelectChain={setChain}
              onOpenAction={openActionPage}
            />
          ) : (
            <MobileDashboard
              chain={chain}
              countdownText={countdownText}
              checkInStatus={statusText}
              contractStatus={contractStatus}
              vaultValueEth={vaultValueEth}
              vaultValueError={vaultValueError}
              daysRemaining={daysRemaining}
              onSelectChain={setChain}
              onOpenAction={openActionPage}
            />
          )
        ) : null}

        {screen === "payment" ? (
          desktop ? (
            <DesktopNotifications
              statusText={statusText}
              statusError={statusError}
              isCheckingIn={isCheckingIn}
              onCheckIn={handleCheckIn}
            />
          ) : (
            <MobileNotifications
              statusText={statusText}
              statusError={statusError}
              isCheckingIn={isCheckingIn}
              onCheckIn={handleCheckIn}
            />
          )
        ) : null}

        {screen === "address" ? (
          desktop ? (
            <DesktopProfile
              autoTrigger={autoTrigger}
              privacyShield={privacyShield}
              walletAddress={walletAddress}
              walletError={walletError}
              contractStatus={contractStatus}
              onToggleAuto={() => setAutoTrigger((v) => !v)}
              onTogglePrivacy={() => setPrivacyShield((v) => !v)}
              onConnectWallet={connectCoinbaseWallet}
              onChangeWallet={changeCoinbaseWallet}
              onDisconnectWallet={disconnectCoinbaseWallet}
            />
          ) : (
            <MobileProfile
              autoTrigger={autoTrigger}
              privacyShield={privacyShield}
              walletAddress={walletAddress}
              walletError={walletError}
              contractStatus={contractStatus}
              onToggleAuto={() => setAutoTrigger((v) => !v)}
              onTogglePrivacy={() => setPrivacyShield((v) => !v)}
              onConnectWallet={connectCoinbaseWallet}
              onChangeWallet={changeCoinbaseWallet}
              onDisconnectWallet={disconnectCoinbaseWallet}
            />
          )
        ) : null}

        {screen === "settings" ? (
          desktop ? (
            <DesktopSettings
              securityAlerts={securityAlerts}
              biometricUnlock={biometricUnlock}
              sessionTimeout={sessionTimeout}
              walletAddress={walletAddress}
              walletError={walletError}
              onToggleSecurityAlerts={() => setSecurityAlerts((v) => !v)}
              onToggleBiometricUnlock={() => setBiometricUnlock((v) => !v)}
              onToggleSessionTimeout={() => setSessionTimeout((v) => !v)}
              onConnectWallet={connectCoinbaseWallet}
              onChangeWallet={changeCoinbaseWallet}
              onDisconnectWallet={disconnectCoinbaseWallet}
              onLogout={onLogout}
              onDeleteAccount={onDeleteAccount}
            />
          ) : (
            <MobileSettings
              securityAlerts={securityAlerts}
              biometricUnlock={biometricUnlock}
              sessionTimeout={sessionTimeout}
              walletAddress={walletAddress}
              walletError={walletError}
              onToggleSecurityAlerts={() => setSecurityAlerts((v) => !v)}
              onToggleBiometricUnlock={() => setBiometricUnlock((v) => !v)}
              onToggleSessionTimeout={() => setSessionTimeout((v) => !v)}
              onConnectWallet={connectCoinbaseWallet}
              onChangeWallet={changeCoinbaseWallet}
              onDisconnectWallet={disconnectCoinbaseWallet}
              onLogout={onLogout}
              onDeleteAccount={onDeleteAccount}
            />
          )
        ) : null}
      </main>

      <nav className="dv-bottom-nav" aria-label="Bottom navigation">
        <button type="button" className={screen === "home" ? "is-active" : ""} onClick={() => navigateToScreen("home")}>
          <FaTableCellsLarge className="dv-nav-icon" aria-hidden="true" />
          {desktop ? <span>Home</span> : null}
        </button>
        <button type="button" className={screen === "payment" ? "is-active" : ""} onClick={() => navigateToScreen("payment")}>
          <FaWallet className="dv-nav-icon" aria-hidden="true" />
          {desktop ? <span>Payment</span> : null}
        </button>
        <button type="button" className={screen === "address" ? "is-active" : ""} onClick={() => navigateToScreen("address")}>
          <FaAt className="dv-nav-icon" aria-hidden="true" />
          {desktop ? <span>Address</span> : null}
        </button>
      </nav>
    </div>
  );
}

type DashboardProps = {
  chain: ChainName;
  countdownText: string;
  checkInStatus: string;
  contractStatus: string;
  vaultValueEth: string;
  vaultValueError: string;
  daysRemaining: number | null;
  onSelectChain: (chain: ChainName) => void;
  onOpenAction: (slug: string) => void;
};

function MobileDashboard({
  chain,
  countdownText,
  checkInStatus,
  contractStatus,
  vaultValueEth,
  vaultValueError,
  daysRemaining,
  onSelectChain,
  onOpenAction,
}: DashboardProps) {
  return (
    <section className="dv-mobile-stack dv-dashboard-screen">
      <div className="dv-countdown-wrap">
        <h2 className="dv-countdown">{countdownText}</h2>
        <p className="dv-label">COUNT DOWN TILL NEXT AUTH</p>
        <p className="dv-subcopy">Status: {checkInStatus}{daysRemaining !== null ? ` (${daysRemaining}d)` : ""}</p>
      </div>

      <TypingHeroTitle className="dv-hero-title" text={HOME_HERO_TEXT} />

      <div className="dv-vault-card">
        <div className="dv-chain-row">
          <button type="button" className={chain === "Ethereum" ? "is-selected" : ""} onClick={() => onSelectChain("Ethereum")}>Ethereum</button>
          <button type="button" className={chain === "Polygon" ? "is-selected" : ""} onClick={() => onSelectChain("Polygon")}>Polygon</button>
        </div>

        <div className="dv-action-row">
          <div>
            <span>Wallet Balance</span>
            <strong>{vaultValueEth} ETH</strong>
          </div>
          <FaChevronRight className="dv-icon-inline" aria-hidden="true" />
        </div>
        {vaultValueError ? <p className="dv-inline-error">{vaultValueError}</p> : null}

        <div className="dv-action-row">
          <div>
            <span>Contract Status</span>
            <strong>{contractStatus}</strong>
          </div>
          <FaCircleInfo className="dv-icon-inline" aria-hidden="true" />
        </div>

        <div className="dv-action-row">
          <div>
            <span>Next Distribution</span>
            <strong>From check-in status</strong>
          </div>
          <FaClock className="dv-icon-inline" aria-hidden="true" />
        </div>

        <button type="button" className="dv-btn-primary" onClick={() => onOpenAction("manage-vault")}>MANAGE VAULT</button>
      </div>
    </section>
  );
}

function DesktopDashboard({
  chain,
  countdownText,
  checkInStatus,
  contractStatus,
  vaultValueEth,
  vaultValueError,
  daysRemaining,
  onSelectChain,
  onOpenAction,
}: DashboardProps) {
  return (
    <section className="dv-desktop-grid dv-dashboard-screen">
      <div className="dv-col-left">
        <div>
          <p className="dv-label">COUNT DOWN TILL NEXT AUTH</p>
          <h2 className="dv-countdown dv-desktop-count">{countdownText}</h2>
          <p className="dv-subcopy">Status: {checkInStatus}{daysRemaining !== null ? ` (${daysRemaining}d)` : ""}</p>
        </div>
        <TypingHeroTitle className="dv-hero-title dv-desktop-hero" text={HOME_HERO_TEXT} />

        <div className="dv-vault-card">
          <div className="dv-balance-head">
            <div>
              <span>VAULT BALANCE</span>
              <h3>{vaultValueEth} ETH</h3>
              <span style={{ marginTop: "0.35rem", letterSpacing: "0.08em" }}>STATUS: {contractStatus}</span>
            </div>
            <div className="dv-chain-row">
              <button type="button" className={chain === "Ethereum" ? "is-selected" : ""} onClick={() => onSelectChain("Ethereum")}>Ethereum</button>
              <button type="button" className={chain === "Polygon" ? "is-selected" : ""} onClick={() => onSelectChain("Polygon")}>Polygon</button>
            </div>
          </div>
          {vaultValueError ? <p className="dv-inline-error">{vaultValueError}</p> : null}
          <div className="dv-balance-actions">
            <button type="button" className="dv-btn-light" onClick={() => onOpenAction("withdraw-assets")}>Withdraw Assets</button>
            <button type="button" className="dv-fab" onClick={() => onOpenAction("create-vault-item")}>
              <FaPlus aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="dv-col-right">
        <div className="dv-status-card">
          <div className="dv-status-left">
            <FaShieldHalved aria-hidden="true" />
            <div>
              <h4>VAULT INTEGRITY</h4>
              <p>Encryption Level: Quantum Proof</p>
            </div>
          </div>
          <strong>99.9%</strong>
        </div>
      </div>
    </section>
  );
}

function MobileNotifications({
  statusText,
  statusError,
  isCheckingIn,
  onCheckIn,
}: {
  statusText: string;
  statusError: string;
  isCheckingIn: boolean;
  onCheckIn: () => void;
}) {
  return (
    <section className="dv-mobile-stack">
      <h1 className="dv-hero-title">PAYMENT ACTIVITY</h1>
      <p className="dv-subcopy">Track every transfer and payment event tied to your legacy vault.</p>
      <div className="dv-profile-card">
        <span>CHECK-IN</span>
        <p className="dv-subcopy">Current status: {statusText}</p>
        {statusError ? <p className="dv-inline-error">{statusError}</p> : null}
        <button type="button" className="dv-btn-primary dv-checkin-btn" onClick={onCheckIn} disabled={isCheckingIn}>
          {isCheckingIn ? "Checking In..." : "I Am Alive"}
        </button>
      </div>
      <div className="dv-list">
        {mobileEvents.map((event) => (
          <article key={event.title} className={`dv-event-item ${event.muted ? "is-muted" : ""}`}>
            <div className="dv-event-main">
              <span className="dv-event-icon-wrap"><event.Icon className="dv-event-icon" aria-hidden="true" /></span>
              <div>
                <h3>{event.title}</h3>
                <p>{event.desc}</p>
              </div>
            </div>
            <span className="dv-age">{event.age}</span>
          </article>
        ))}
      </div>
      <p className="dv-end-record">END OF RECORD</p>
    </section>
  );
}

function DesktopNotifications({
  statusText,
  statusError,
  isCheckingIn,
  onCheckIn,
}: {
  statusText: string;
  statusError: string;
  isCheckingIn: boolean;
  onCheckIn: () => void;
}) {
  return (
    <section className="dv-desktop-stack">
      <h1 className="dv-hero-title dv-desktop-hero">PAYMENT ACTIVITY</h1>
      <p className="dv-subcopy dv-notification-callout">Track all outgoing and incoming payment events. Every entry is <span>immutable</span>.</p>
      <div className="dv-profile-card">
        <span>CHECK-IN</span>
        <p className="dv-subcopy">Current status: {statusText}</p>
        {statusError ? <p className="dv-inline-error">{statusError}</p> : null}
        <button type="button" className="dv-btn-primary dv-checkin-btn" onClick={onCheckIn} disabled={isCheckingIn}>
          {isCheckingIn ? "Checking In..." : "I Am Alive"}
        </button>
      </div>
      <div className="dv-list">
        {desktopEvents.map((event) => (
          <article key={event.title} className="dv-event-item dv-event-item-lg">
            <div className="dv-event-main">
              <span className="dv-event-icon-wrap"><event.Icon className="dv-event-icon" aria-hidden="true" /></span>
              <div>
                <h3>{event.title}</h3>
                <p>{event.desc}</p>
              </div>
            </div>
            <div className="dv-event-right">
              <span className="dv-age">{event.age}</span>
              <FaArrowUpRightFromSquare aria-hidden="true" />
            </div>
          </article>
        ))}
      </div>
      <footer className="dv-events-footer">
        <div>
          <span>MEMENTO VIVERE</span>
          <p>EXISTENTIAL ASSET MANAGEMENT</p>
        </div>
        <strong>DV-04</strong>
      </footer>
    </section>
  );
}

type ProfileProps = {
  autoTrigger: boolean;
  privacyShield: boolean;
  walletAddress: string | null;
  walletError: string;
  contractStatus: string;
  onToggleAuto: () => void;
  onTogglePrivacy: () => void;
  onConnectWallet: () => void;
  onChangeWallet: () => void;
  onDisconnectWallet: () => void;
};

type SettingsProps = {
  securityAlerts: boolean;
  biometricUnlock: boolean;
  sessionTimeout: boolean;
  walletAddress: string | null;
  walletError: string;
  onToggleSecurityAlerts: () => void;
  onToggleBiometricUnlock: () => void;
  onToggleSessionTimeout: () => void;
  onConnectWallet: () => void;
  onChangeWallet: () => void;
  onDisconnectWallet: () => void;
  onDeleteAccount: () => void;
  onLogout?: () => void;
};

function MobileProfile({ autoTrigger, privacyShield, walletAddress, walletError, contractStatus, onToggleAuto, onTogglePrivacy, onConnectWallet, onChangeWallet, onDisconnectWallet }: ProfileProps) {
  return (
    <section className="dv-mobile-stack">
      <h1 className="dv-hero-title">ADDRESS SETTINGS</h1>
      <p className="dv-subcopy">Manage recipient identity, routing preferences, and delivery safeguards.</p>
      <div className="dv-profile-card">
        <span>CONNECTED WALLET (COINBASE)</span>
        <div className="dv-profile-row">
          <strong>{walletAddress ? shortAddress(walletAddress) : "Not connected"}</strong>
          {walletAddress ? <button type="button" onClick={onChangeWallet}>Change</button> : <button type="button" onClick={onConnectWallet}>Connect</button>}
        </div>
        {walletAddress ? <button type="button" className="dv-wallet-disconnect" onClick={onDisconnectWallet}>Disconnect</button> : null}
        {walletError ? <p className="dv-inline-error">{walletError}</p> : null}
      </div>
      <h2 className="dv-section-title">CONTRACT</h2>
      <div className="dv-vault-card">
        <span>VAULT STATUS</span>
        <h3>{contractStatus}</h3>
        <p>Heartbeat monitoring engaged</p>
      </div>
      <div className="dv-profile-card">
        <div className="dv-toggle-row">
          <div>
            <span>Auto-Trigger</span>
            <p>Execute on heartbeat failure</p>
          </div>
          <button type="button" className={autoTrigger ? "toggle on" : "toggle"} onClick={onToggleAuto}><i /></button>
        </div>
        <div className="dv-toggle-row">
          <div>
            <span>Privacy Shield</span>
            <p>Obfuscate recipient addresses</p>
          </div>
          <button type="button" className={privacyShield ? "toggle on" : "toggle"} onClick={onTogglePrivacy}><i /></button>
        </div>
      </div>
    </section>
  );
}

function DesktopProfile({ autoTrigger, privacyShield, walletAddress, walletError, contractStatus, onToggleAuto, onTogglePrivacy, onConnectWallet, onChangeWallet, onDisconnectWallet }: ProfileProps) {
  return (
    <section className="dv-desktop-grid">
      <div className="dv-col-left">
        <h1 className="dv-hero-title dv-desktop-hero">ADDRESS SETTINGS</h1>
        <p className="dv-subcopy">Manage recipient identity, routing preferences, and delivery safeguards.</p>
      </div>
      <div className="dv-col-right dv-desktop-stack">
        <div className="dv-profile-card">
          <span>CONNECTED WALLET (COINBASE)</span>
          <div className="dv-profile-row">
            <strong>{walletAddress ? shortAddress(walletAddress) : "Not connected"}</strong>
            {walletAddress ? <button type="button" onClick={onChangeWallet}>Change</button> : <button type="button" onClick={onConnectWallet}>Connect</button>}
          </div>
          {walletAddress ? <button type="button" className="dv-wallet-disconnect" onClick={onDisconnectWallet}>Disconnect</button> : null}
          {walletError ? <p className="dv-inline-error">{walletError}</p> : null}
        </div>
        <div className="dv-vault-card">
          <span>VAULT STATUS</span>
          <h3>{contractStatus}</h3>
        </div>
        <div className="dv-profile-card">
          <span>SECURITY PARAMETERS</span>
          <div className="dv-toggle-row">
            <div>
              <span>Auto-Trigger</span>
              <p>Initiate transfer protocol after inactivity period</p>
            </div>
            <button type="button" className={autoTrigger ? "toggle on" : "toggle"} onClick={onToggleAuto}><i /></button>
          </div>
          <div className="dv-toggle-row">
            <div>
              <span>Privacy Shield</span>
              <p>Mask metadata across the ledger network</p>
            </div>
            <button type="button" className={privacyShield ? "toggle on" : "toggle"} onClick={onTogglePrivacy}><i /></button>
          </div>
        </div>
      </div>
    </section>
  );
}

function MobileSettings({
  securityAlerts,
  biometricUnlock,
  sessionTimeout,
  walletAddress,
  walletError,
  onToggleSecurityAlerts,
  onToggleBiometricUnlock,
  onToggleSessionTimeout,
  onConnectWallet,
  onChangeWallet,
  onDisconnectWallet,
  onDeleteAccount,
  onLogout,
}: SettingsProps) {
  return (
    <section className="dv-mobile-stack">
      <h1 className="dv-hero-title">SETTINGS</h1>
      <p className="dv-subcopy">Configure account protections, alerts, and app behavior for safer daily use.</p>

      <div className="dv-profile-card">
        <span>ACCOUNT</span>
        <div className="dv-profile-row"><strong>{walletAddress ? shortAddress(walletAddress) : "No Coinbase wallet"}</strong>{walletAddress ? <button type="button" onClick={onChangeWallet}>Change</button> : <button type="button" onClick={onConnectWallet}>Connect</button>}</div>
        {walletAddress ? <button type="button" className="dv-wallet-disconnect" onClick={onDisconnectWallet}>Disconnect</button> : null}
        {walletError ? <p className="dv-inline-error">{walletError}</p> : null}
      </div>

      <div className="dv-profile-card">
        <span>SECURITY</span>
        <div className="dv-toggle-row">
          <div>
            <span>Security Alerts</span>
            <p>Send push alerts for sign-in and transfer events</p>
          </div>
          <button type="button" className={securityAlerts ? "toggle on" : "toggle"} onClick={onToggleSecurityAlerts}><i /></button>
        </div>
        <div className="dv-toggle-row">
          <div>
            <span>Biometric Unlock</span>
            <p>Require Face ID or fingerprint for app access</p>
          </div>
          <button type="button" className={biometricUnlock ? "toggle on" : "toggle"} onClick={onToggleBiometricUnlock}><i /></button>
        </div>
      </div>

      <div className="dv-profile-card">
        <span>PREFERENCES</span>
        <div className="dv-toggle-row">
          <div>
            <span>Session Timeout</span>
            <p>Auto-lock after 5 minutes of inactivity</p>
          </div>
          <button type="button" className={sessionTimeout ? "toggle on" : "toggle"} onClick={onToggleSessionTimeout}><i /></button>
        </div>
        <button type="button" className="dv-wallet-disconnect" onClick={onLogout}>Log Out</button>
        <button
          type="button"
          className="dv-wallet-disconnect"
          onClick={() => {
            if (window.confirm("Delete account permanently from this device?")) {
              onDeleteAccount();
            }
          }}
        >
          Delete Account
        </button>
      </div>
    </section>
  );
}

function DesktopSettings({
  securityAlerts,
  biometricUnlock,
  sessionTimeout,
  walletAddress,
  walletError,
  onToggleSecurityAlerts,
  onToggleBiometricUnlock,
  onToggleSessionTimeout,
  onConnectWallet,
  onChangeWallet,
  onDisconnectWallet,
  onDeleteAccount,
  onLogout,
}: SettingsProps) {
  return (
    <section className="dv-desktop-grid">
      <div className="dv-col-left">
        <h1 className="dv-hero-title dv-desktop-hero">SETTINGS</h1>
        <p className="dv-subcopy">Manage security defaults and user preferences across all devices.</p>
      </div>
      <div className="dv-col-right dv-desktop-stack">
        <div className="dv-profile-card">
          <span>ACCOUNT</span>
          <div className="dv-profile-row"><strong>{walletAddress ? shortAddress(walletAddress) : "No Coinbase wallet"}</strong>{walletAddress ? <button type="button" onClick={onChangeWallet}>Change</button> : <button type="button" onClick={onConnectWallet}>Connect</button>}</div>
          {walletAddress ? <button type="button" className="dv-wallet-disconnect" onClick={onDisconnectWallet}>Disconnect</button> : null}
          {walletError ? <p className="dv-inline-error">{walletError}</p> : null}
        </div>
        <div className="dv-profile-card">
          <span>SECURITY CONTROLS</span>
          <div className="dv-toggle-row">
            <div>
              <span>Security Alerts</span>
              <p>Receive notifications on new sessions and asset movement</p>
            </div>
            <button type="button" className={securityAlerts ? "toggle on" : "toggle"} onClick={onToggleSecurityAlerts}><i /></button>
          </div>
          <div className="dv-toggle-row">
            <div>
              <span>Biometric Unlock</span>
              <p>Require biometric authentication before sensitive actions</p>
            </div>
            <button type="button" className={biometricUnlock ? "toggle on" : "toggle"} onClick={onToggleBiometricUnlock}><i /></button>
          </div>
          <div className="dv-toggle-row">
            <div>
              <span>Session Timeout</span>
              <p>Automatically lock app after inactivity period</p>
            </div>
            <button type="button" className={sessionTimeout ? "toggle on" : "toggle"} onClick={onToggleSessionTimeout}><i /></button>
          </div>
          <button type="button" className="dv-wallet-disconnect" onClick={onLogout}>Log Out</button>
          <button
            type="button"
            className="dv-wallet-disconnect"
            onClick={() => {
              if (window.confirm("Delete account permanently from this device?")) {
                onDeleteAccount();
              }
            }}
          >
            Delete Account
          </button>
        </div>
      </div>
    </section>
  );
}
