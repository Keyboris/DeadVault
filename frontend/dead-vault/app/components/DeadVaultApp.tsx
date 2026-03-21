"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { IconType } from "react-icons";
import type { VaultContract } from "./authStorage";
import { checkIn, getCheckInStatus, submitWill as submitWillRequest } from "@/app/lib/api/endpoints";
import { DMS_TOKEN_STORAGE_KEY } from "@/app/lib/api/config";
import {
  FaArrowUpRightFromSquare,
  FaAt,
  FaBuildingColumns,
  FaChevronRight,
  FaCircleInfo,
  FaClock,
  FaGear,
  FaEnvelope,
  FaFileContract,
  FaFingerprint,
  FaHeartPulse,
  FaKey,
  FaLock,
  FaMicrophone,
  FaPlus,
  FaShieldHalved,
  FaTableCellsLarge,
  FaWallet,
} from "react-icons/fa6";

type ScreenName = "home" | "payment" | "address" | "settings";

function formatCountdown(isoTime: string | null, currentMs: number): string {
  if (!isoTime) {
    return "--:--:--";
  }

  const target = new Date(isoTime).getTime();
  if (Number.isNaN(target)) {
    return "--:--:--";
  }

  const diffMs = Math.max(0, target - currentMs);
  const totalSeconds = Math.floor(diffMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
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
  contracts,
  onWalletAddressChange,
  onCreateContract,
  onDeleteContract,
  onDeleteAccount,
  onLogout,
}: {
  initialWalletAddress?: string | null;
  contracts: VaultContract[];
  onWalletAddressChange?: (walletAddress: string | null) => void;
  onCreateContract: (title: string, content: string) => void;
  onDeleteContract: (id: string) => void;
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
  const [willTitle, setWillTitle] = useState("");
  const [willContent, setWillContent] = useState("");
  const [editingContractId, setEditingContractId] = useState<string | null>(null);
  const [willError, setWillError] = useState("");
  const [isSubmittingWill, setIsSubmittingWill] = useState(false);
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusText, setStatusText] = useState("UNKNOWN");
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [clockTick, setClockTick] = useState(Date.now());
  const pathname = usePathname();
  const router = useRouter();
  const countdownText = formatCountdown(nextDueAt, clockTick);

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
      setDaysRemaining(status.daysRemaining);
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

  const resetWillForm = () => {
    setEditingContractId(null);
    setWillTitle("");
    setWillContent("");
    setWillError("");
  };

  const submitWill = async () => {
    const trimmedTitle = willTitle.trim();
    const trimmedContent = willContent.trim();

    if (!trimmedTitle || !trimmedContent) {
      setWillError("Will title and content are required.");
      return;
    }

    if (editingContractId) {
      setWillError("Will update endpoint is not available yet. Create a new will instead.");
      return;
    }

    const token = localStorage.getItem(DMS_TOKEN_STORAGE_KEY);
    if (!token) {
      setWillError("Please sign in before creating a will.");
      return;
    }

    setIsSubmittingWill(true);
    try {
      const response = await submitWillRequest({ willText: trimmedContent });
      const details = `${trimmedContent}\n\nContract: ${response.contractAddress}\nTemplate: ${response.templateType}\nTx: ${response.deploymentTxHash}`;
      onCreateContract(trimmedTitle, details);
      resetWillForm();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Will submission failed. Please try again.";
      setWillError(message);
    } finally {
      setIsSubmittingWill(false);
    }
  };

  const editContract = (contract: VaultContract) => {
    setEditingContractId(contract.id);
    setWillTitle(contract.title);
    setWillContent(contract.content);
    setWillError("");
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
              contracts={contracts}
              countdownText={countdownText}
              checkInStatus={statusText}
              daysRemaining={daysRemaining}
              willTitle={willTitle}
              willContent={willContent}
              willError={willError}
              isSubmittingWill={isSubmittingWill}
              editingContractId={editingContractId}
              onSelectChain={setChain}
              onOpenAction={openActionPage}
              onWillTitleChange={setWillTitle}
              onWillContentChange={setWillContent}
              onSubmitWill={submitWill}
              onEditContract={editContract}
              onDeleteContract={onDeleteContract}
              onCancelEdit={resetWillForm}
            />
          ) : (
            <MobileDashboard
              chain={chain}
              contracts={contracts}
              countdownText={countdownText}
              checkInStatus={statusText}
              daysRemaining={daysRemaining}
              willTitle={willTitle}
              willContent={willContent}
              willError={willError}
              isSubmittingWill={isSubmittingWill}
              editingContractId={editingContractId}
              onSelectChain={setChain}
              onOpenAction={openActionPage}
              onWillTitleChange={setWillTitle}
              onWillContentChange={setWillContent}
              onSubmitWill={submitWill}
              onEditContract={editContract}
              onDeleteContract={onDeleteContract}
              onCancelEdit={resetWillForm}
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
              onToggleAuto={() => setAutoTrigger((v) => !v)}
              onTogglePrivacy={() => setPrivacyShield((v) => !v)}
              onOpenAction={openActionPage}
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
              onToggleAuto={() => setAutoTrigger((v) => !v)}
              onTogglePrivacy={() => setPrivacyShield((v) => !v)}
              onOpenAction={openActionPage}
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
  contracts: VaultContract[];
  countdownText: string;
  checkInStatus: string;
  daysRemaining: number | null;
  willTitle: string;
  willContent: string;
  willError: string;
  isSubmittingWill: boolean;
  editingContractId: string | null;
  onSelectChain: (chain: ChainName) => void;
  onOpenAction: (slug: string) => void;
  onWillTitleChange: (value: string) => void;
  onWillContentChange: (value: string) => void;
  onSubmitWill: () => void;
  onEditContract: (contract: VaultContract) => void;
  onDeleteContract: (id: string) => void;
  onCancelEdit: () => void;
};

function MobileDashboard({
  chain,
  contracts,
  countdownText,
  checkInStatus,
  daysRemaining,
  willTitle,
  willContent,
  willError,
  isSubmittingWill,
  editingContractId,
  onSelectChain,
  onOpenAction,
  onWillTitleChange,
  onWillContentChange,
  onSubmitWill,
  onEditContract,
  onDeleteContract,
  onCancelEdit,
}: DashboardProps) {
  return (
    <section className="dv-mobile-stack dv-dashboard-screen">
      <div className="dv-countdown-wrap">
        <h2 className="dv-countdown">{countdownText}</h2>
        <p className="dv-label">COUNT DOWN TILL NEXT AUTH</p>
        <p className="dv-subcopy">Status: {checkInStatus}{daysRemaining !== null ? ` (${daysRemaining}d)` : ""}</p>
      </div>

      <h1 className="dv-hero-title">MONEY HAS NO VALUE IN DEATH</h1>

      <div className="dv-contract-card">
        <div className="dv-card-head">
          <span>CONTRACT</span>
          <FaCircleInfo className="dv-icon-inline" aria-hidden="true" />
        </div>
        <div className="dv-input-wrap">
          <textarea placeholder="This is user prompt to make a smart contract..." />
          <button type="button" className="dv-fab" onClick={() => onOpenAction("voice-contract-input")}>
            <FaMicrophone aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="dv-vault-card">
        <div className="dv-chain-row">
          <button type="button" className={chain === "Ethereum" ? "is-selected" : ""} onClick={() => onSelectChain("Ethereum")}>Ethereum</button>
          <button type="button" className={chain === "Polygon" ? "is-selected" : ""} onClick={() => onSelectChain("Polygon")}>Polygon</button>
        </div>

        <div className="dv-action-row">
          <div>
            <span>Wallet Balance</span>
            <strong>Unavailable</strong>
          </div>
          <FaChevronRight className="dv-icon-inline" aria-hidden="true" />
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

      <WillSection
        contracts={contracts}
        willTitle={willTitle}
        willContent={willContent}
        willError={willError}
        isSubmittingWill={isSubmittingWill}
        editingContractId={editingContractId}
        onWillTitleChange={onWillTitleChange}
        onWillContentChange={onWillContentChange}
        onSubmitWill={onSubmitWill}
        onEditContract={onEditContract}
        onDeleteContract={onDeleteContract}
        onCancelEdit={onCancelEdit}
      />
    </section>
  );
}

function DesktopDashboard({
  chain,
  contracts,
  countdownText,
  checkInStatus,
  daysRemaining,
  willTitle,
  willContent,
  willError,
  isSubmittingWill,
  editingContractId,
  onSelectChain,
  onOpenAction,
  onWillTitleChange,
  onWillContentChange,
  onSubmitWill,
  onEditContract,
  onDeleteContract,
  onCancelEdit,
}: DashboardProps) {
  return (
    <section className="dv-desktop-grid dv-dashboard-screen">
      <div className="dv-col-left">
        <div>
          <p className="dv-label">COUNT DOWN TILL NEXT AUTH</p>
          <h2 className="dv-countdown dv-desktop-count">{countdownText}</h2>
          <p className="dv-subcopy">Status: {checkInStatus}{daysRemaining !== null ? ` (${daysRemaining}d)` : ""}</p>
        </div>
        <h1 className="dv-hero-title dv-desktop-hero">MONEY HAS NO VALUE IN DEATH</h1>

        <div className="dv-vault-card">
          <div className="dv-balance-head">
            <div>
              <span>VAULT BALANCE</span>
              <h3>Pending backend endpoint</h3>
            </div>
            <div className="dv-chain-row">
              <button type="button" className={chain === "Ethereum" ? "is-selected" : ""} onClick={() => onSelectChain("Ethereum")}>Ethereum</button>
              <button type="button" className={chain === "Polygon" ? "is-selected" : ""} onClick={() => onSelectChain("Polygon")}>Polygon</button>
            </div>
          </div>
          <div className="dv-balance-actions">
            <button type="button" className="dv-btn-light" onClick={() => onOpenAction("withdraw-assets")}>Withdraw Assets</button>
            <button type="button" className="dv-fab" onClick={() => onOpenAction("create-vault-item")}>
              <FaPlus aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>

      <div className="dv-col-right">
        <div className="dv-exec-card">
          <div className="dv-card-head">
            <span>NEW SMART CONTRACT</span>
            <span className="dv-live-dot" />
          </div>
          <label>RECIPIENT ADDRESS</label>
          <input type="text" placeholder="0x0000...dead" />
          <label>INSTRUCTIONAL LEGACY</label>
          <div className="dv-input-wrap">
            <textarea rows={6} placeholder="Define the final distribution of digital consciousness..." />
            <button type="button" className="dv-fab" onClick={() => onOpenAction("voice-legacy-input")}><FaMicrophone aria-hidden="true" /></button>
          </div>
          <button type="button" className="dv-btn-primary dv-btn-strong" onClick={() => onOpenAction("execute-permanence")}>EXECUTE PERMANENCE</button>
          <p className="dv-danger-note">THIS ACTION CANNOT BE REVERSED ONCE THE HEARTBEAT SENSOR REACHES TERMINAL STATE.</p>
        </div>
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
        <WillSection
          contracts={contracts}
          willTitle={willTitle}
          willContent={willContent}
          willError={willError}
          isSubmittingWill={isSubmittingWill}
          editingContractId={editingContractId}
          onWillTitleChange={onWillTitleChange}
          onWillContentChange={onWillContentChange}
          onSubmitWill={onSubmitWill}
          onEditContract={onEditContract}
          onDeleteContract={onDeleteContract}
          onCancelEdit={onCancelEdit}
        />
      </div>
    </section>
  );
}

type WillSectionProps = {
  contracts: VaultContract[];
  willTitle: string;
  willContent: string;
  willError: string;
  isSubmittingWill: boolean;
  editingContractId: string | null;
  onWillTitleChange: (value: string) => void;
  onWillContentChange: (value: string) => void;
  onSubmitWill: () => void;
  onEditContract: (contract: VaultContract) => void;
  onDeleteContract: (id: string) => void;
  onCancelEdit: () => void;
};

function WillSection({
  contracts,
  willTitle,
  willContent,
  willError,
  isSubmittingWill,
  editingContractId,
  onWillTitleChange,
  onWillContentChange,
  onSubmitWill,
  onEditContract,
  onDeleteContract,
  onCancelEdit,
}: WillSectionProps) {
  return (
    <section className="dv-profile-card">
      <span>CREATE OR EDIT WILL</span>
      <label className="dv-contract-label">
        Will Title
        <input
          className="dv-auth-input"
          type="text"
          value={willTitle}
          onChange={(event) => onWillTitleChange(event.target.value)}
          placeholder="Family legacy plan"
        />
      </label>
      <label className="dv-contract-label">
        Will Content
        <textarea
          className="dv-contract-editor"
          value={willContent}
          onChange={(event) => onWillContentChange(event.target.value)}
          placeholder="Define asset distribution, beneficiaries, and conditions..."
        />
      </label>
      {willError ? <p className="dv-inline-error">{willError}</p> : null}
      <div className="dv-contract-actions">
        <button type="button" className="dv-btn-primary" onClick={onSubmitWill} disabled={isSubmittingWill}>
          {editingContractId ? "Update Will" : "Create Will"}
        </button>
        {isSubmittingWill ? <p className="dv-subcopy">Submitting...</p> : null}
        {editingContractId ? (
          <button type="button" className="dv-btn-light" onClick={onCancelEdit}>
            Cancel
          </button>
        ) : null}
      </div>

      <h3 className="dv-created-contracts-title">CREATED CONTRACTS</h3>
      <div className="dv-contract-list">
        {contracts.length === 0 ? (
          <p className="dv-subcopy">No contracts yet. Create your first will above.</p>
        ) : (
          contracts.map((contract) => (
            <article key={contract.id} className="dv-contract-item">
              <div>
                <h4>{contract.title}</h4>
                <p>{contract.content}</p>
                <span>Updated {new Date(contract.updatedAt).toLocaleString()}</span>
              </div>
              <div className="dv-contract-item-actions">
                <button type="button" onClick={() => onEditContract(contract)}>Edit</button>
                <button type="button" className="is-danger" onClick={() => onDeleteContract(contract.id)}>Delete</button>
              </div>
            </article>
          ))
        )}
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
        <button type="button" className="dv-btn-primary" onClick={onCheckIn} disabled={isCheckingIn}>
          {isCheckingIn ? "Checking In..." : "I'm Alive"}
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
        <button type="button" className="dv-btn-primary" onClick={onCheckIn} disabled={isCheckingIn}>
          {isCheckingIn ? "Checking In..." : "I'm Alive"}
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
  onToggleAuto: () => void;
  onTogglePrivacy: () => void;
  onOpenAction: (slug: string) => void;
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

function MobileProfile({ autoTrigger, privacyShield, walletAddress, walletError, onToggleAuto, onTogglePrivacy, onOpenAction, onConnectWallet, onChangeWallet, onDisconnectWallet }: ProfileProps) {
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
        <h3>ACTIVE</h3>
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
      <h2 className="dv-section-title">VERIFICATION</h2>
      <div className="dv-mobile-verification">
        <article>
          <div className="dv-event-main">
            <span className="dv-event-icon-wrap"><FaFingerprint className="dv-event-icon" aria-hidden="true" /></span>
            <div>
              <h3>Biometric Auth</h3>
              <p>Linked to hardware enclave</p>
            </div>
          </div>
          <strong>✓</strong>
        </article>
        <article>
          <div className="dv-event-main">
            <span className="dv-event-icon-wrap"><FaEnvelope className="dv-event-icon" aria-hidden="true" /></span>
            <div>
              <h3>Backup Email</h3>
              <p>Not configured</p>
            </div>
          </div>
          <button type="button" className="dv-mini-action" onClick={() => onOpenAction("add-backup-email")}>ADD</button>
        </article>
      </div>
    </section>
  );
}

function DesktopProfile({ autoTrigger, privacyShield, walletAddress, walletError, onToggleAuto, onTogglePrivacy, onConnectWallet, onChangeWallet, onDisconnectWallet }: ProfileProps) {
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
          <h3>ACTIVE</h3>
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
        <div className="dv-profile-card">
          <span>IDENTITY VERIFICATION</span>
          <div className="dv-verify-grid">
            <article>
              <span><FaFingerprint aria-hidden="true" /></span>
              <div>
                <h4>Biometric Auth</h4>
                <p>SECURED</p>
              </div>
            </article>
            <article>
              <span><FaAt aria-hidden="true" /></span>
              <div>
                <h4>Backup Email</h4>
                <p>VERIFIED</p>
              </div>
            </article>
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
