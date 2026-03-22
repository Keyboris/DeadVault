"use client";

import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { IconType } from "react-icons";
import { readStoredProfile, type VaultContract } from "./authStorage";
import {
  checkIn,
  getCheckInStatus,
  getContracts as getContractsRequest,
  sendWillNotification,
  submitWill as submitWillRequest,
  updateWill as updateWillRequest,
} from "@/app/lib/api/endpoints";
import { ApiClientError } from "@/app/lib/api/client";
import { DMS_TOKEN_STORAGE_KEY } from "@/app/lib/api/config";
import type { ContractSummaryResponse } from "@/app/lib/api/types";
import {
  FaArrowUpRightFromSquare,
  FaAt,
  FaBuildingColumns,
  FaChevronRight,
  FaCircleCheck,
  FaCircleInfo,
  FaClock,
  FaGear,
  FaFileContract,
  FaHeartPulse,
  FaKey,
  FaLock,
  FaMicrophone,
  FaPlus,
  FaShieldHalved,
  FaTableCellsLarge,
  FaTriangleExclamation,
  FaWallet,
} from "react-icons/fa6";

type ScreenName = "home" | "payment" | "address" | "settings";

const MULTISIG_ABI = [
  "function owners() view returns (address[])",
  "function threshold() view returns (uint256)",
  "function getModules() view returns (address[])",
  "function isModuleEnabled(address) view returns (bool)"
];

const DEADMAN_ABI = [
  "function checkIn() external",
  "function startGracePeriod() external",
  "function trigger() external",
  "function nominee() view returns (address)",
  "function inactivityPeriod() view returns (uint256)",
  "function gracePeriod() view returns (uint256)",
  "function lastCheckIn() view returns (uint256)",
  "function gracePeriodStart() view returns (uint256)",
  "function isTriggered() view returns (bool)"
];

const HOME_HERO_TEXT = "MONEY HAS NO VALUE IN DEATH";


function TypingHeroTitle({
  text,
  className,
}: {
  text: string;
  className: string;
}) {
  return (
    <h1 className={className} aria-label={text}>
      {text}
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
  const [isMounted, setIsMounted] = useState(false);
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
  const [contracts, setContracts] = useState<VaultContract[]>([]);
  const [isLoadingContracts, setIsLoadingContracts] = useState(false);
  const [contractsError, setContractsError] = useState("");
  const [isCheckingIn, setIsCheckingIn] = useState(false);
  const [statusError, setStatusError] = useState("");
  const [statusSuccess, setStatusSuccess] = useState("");
  const [toasts, setToasts] = useState<{ id: string; type: 'success' | 'error'; title: string; message: string }[]>([]);

  const addToast = (type: 'success' | 'error', title: string, message: string) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, type, title, message }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 8000);
  };

  const [statusText, setStatusText] = useState("UNKNOWN");
  const [contractStatus, setContractStatus] = useState("UNKNOWN");
  const [vaultValueEth, setVaultValueEth] = useState("0");
  const [vaultValueError, setVaultValueError] = useState("");
  const [nextDueAt, setNextDueAt] = useState<string | null>(null);
  const [daysRemaining, setDaysRemaining] = useState<number | null>(null);
  const [clockTick, setClockTick] = useState(0);
  const pathname = usePathname();
  const router = useRouter();
  const countdownText = formatCountdown(nextDueAt, clockTick);

  const mapContractSummaryToVaultContract = (contract: ContractSummaryResponse): VaultContract => {
    const primaryLabel = contract.beneficiaries[0]?.label ?? "No beneficiary labels";
    const basisSummary = contract.beneficiaries.length
      ? contract.beneficiaries
          .map((b) => `${b.label || shortAddress(b.walletAddress)} ${(b.basisPoints / 100).toFixed(2)}%`)
          .join(" | ")
      : "No beneficiary basis configured";
    const title = `${contract.vaultType} • ${shortAddress(contract.contractAddress)}`;
    
    let content = `Status: ${contract.status}\nBalance: ${contract.ethBalanceEther} ETH\nPrimary beneficiary: ${primaryLabel}\nBasis: ${basisSummary}\nContract: ${contract.contractAddress}\nTx: ${contract.deploymentTxHash}`;
    
    if (contract.vaultType === "MULTISIG_DEADMAN") {
      const ownersList = contract.owners?.map(shortAddress).join(", ") ?? "Unknown";
      content += `\nOwners: ${ownersList}\nThreshold: ${contract.threshold}-of-${contract.owners?.length ?? "?"}`;
    }

    return {
      id: contract.id,
      title,
      content,
      createdAt: contract.deployedAt,
      updatedAt: contract.deployedAt,
      vaultType: contract.vaultType,
      contractAddress: contract.contractAddress,
      owners: contract.owners,
      threshold: contract.threshold,
      inactivitySeconds: contract.inactivitySeconds,
      graceSeconds: contract.graceSeconds,
      ethBalanceEther: contract.ethBalanceEther,
    };
  };


  const [activeVaultType, setActiveVaultType] = useState<string>("STANDARD");

  const refreshContracts = useCallback(async () => {
    const token = localStorage.getItem(DMS_TOKEN_STORAGE_KEY);
    if (!token) {
      setContracts([]);
      setContractsError("Please sign in to load contracts.");
      setIsLoadingContracts(false);
      return;
    }

    setIsLoadingContracts(true);
    try {
      const response = await getContractsRequest();
      const mapped = response.map(mapContractSummaryToVaultContract);
      setContracts(mapped);
      setContractsError("");
      const activeContract = response.find((c) => c.status === "ACTIVE") ?? response[0];
      setContractStatus(activeContract?.status ?? "NO_VAULT");
      setActiveVaultType(activeContract?.vaultType ?? "STANDARD");
      setVaultValueEth(activeContract?.ethBalanceEther ?? "0");
      setVaultValueError("");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Contract list is temporarily unavailable.";
      setContractsError(message);
      setContracts([]);
      setContractStatus("UNAVAILABLE");
      setVaultValueEth("0");
      setVaultValueError(message);
    } finally {
      setIsLoadingContracts(false);
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
      if (activeVaultType === "MULTISIG_DEADMAN") {
        // Direct on-chain check-in for multisig
        const provider = getEthereumProvider();
        if (!provider) throw new Error("No wallet provider found");
        
        const { BrowserProvider, Contract } = await import("ethers");
        const ethersProvider = new BrowserProvider(provider as any);
        const signer = await ethersProvider.getSigner();
        
        // Find the active contract
        const apiContracts = await getContractsRequest();
        const active = apiContracts.find(c => c.status === "ACTIVE" && c.vaultType === "MULTISIG_DEADMAN");
        if (!active) throw new Error("No active multisig vault found");

        const multisigAddress = active.contractAddress;
        const multisig = new Contract(multisigAddress, MULTISIG_ABI, signer);
        const modules = await multisig.getModules();
        if (!modules || modules.length === 0) throw new Error("No modules found on multisig");
        
        // For simplicity, assume the first module is DeadmanModule
        const deadmanAddress = modules[0];
        const deadman = new Contract(deadmanAddress, DEADMAN_ABI, signer);
        
        const tx = await deadman.checkIn();
        await tx.wait();
      }

      // Also notify backend to update its cached status
      const response = await checkIn();
      setNextDueAt(response.nextDueAt);
      setStatusText("ACTIVE");
      setStatusError("");
      await refreshCheckInStatus();
      await refreshContracts();
      addToast('success', 'Check-in Recorded', 'Your vault timer has been reset successfully.');
    } catch (error) {
      const message = error instanceof Error ? error.message : "Check-in failed. Please try again.";
      addToast('error', 'Check-in Failed', message);
    } finally {
    setIsCheckingIn(false);
    }
  };

  const handleStartGracePeriod = async () => {
    setIsCheckingIn(true);
    try {
      const provider = getEthereumProvider();
      if (!provider) throw new Error("No wallet provider found");
      const { BrowserProvider, Contract } = await import("ethers");
      const ethersProvider = new BrowserProvider(provider as any);
      const signer = await ethersProvider.getSigner();
      
      const apiContracts = await getContractsRequest();
      const active = apiContracts.find(c => c.status === "ACTIVE" && c.vaultType === "MULTISIG_DEADMAN");
      if (!active) throw new Error("No active multisig vault found");

      const multisig = new Contract(active.contractAddress, MULTISIG_ABI, signer);
      const modules = await multisig.getModules();
      const deadman = new Contract(modules[0], DEADMAN_ABI, signer);
      
      const tx = await deadman.startGracePeriod();
      await tx.wait();
      await refreshCheckInStatus();
      addToast('success', 'Grace Period Started', 'The grace period has been initiated on-chain.');
    } catch (error) {
      const message = error instanceof Error ? error.message : "Start grace period failed";
      addToast('error', 'Action Failed', message);
    } finally {
      setIsCheckingIn(false);
    }
  };

  const handleTrigger = async () => {
    setIsCheckingIn(true);
    try {
      const provider = getEthereumProvider();
      if (!provider) throw new Error("No wallet provider found");
      const { BrowserProvider, Contract } = await import("ethers");
      const ethersProvider = new BrowserProvider(provider as any);
      const signer = await ethersProvider.getSigner();
      
      const apiContracts = await getContractsRequest();
      const active = apiContracts.find(c => c.status === "ACTIVE" && c.vaultType === "MULTISIG_DEADMAN");
      if (!active) throw new Error("No active multisig vault found");

      const multisig = new Contract(active.contractAddress, MULTISIG_ABI, signer);
      const modules = await multisig.getModules();
      const deadman = new Contract(modules[0], DEADMAN_ABI, signer);
      
      const tx = await deadman.trigger();
      await tx.wait();
      await refreshCheckInStatus();
      await refreshContracts();
      addToast('success', 'Vault Triggered', 'The redistribution process has been triggered on-chain.');
    } catch (error) {
      addToast('error', 'Trigger Failed', error instanceof Error ? error.message : "Trigger failed");
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

    const token = localStorage.getItem(DMS_TOKEN_STORAGE_KEY);
    if (!token) {
      setWillError("Please sign in before creating a will.");
      return;
    }

    setIsSubmittingWill(true);
    try {
      let notificationPayload:
        | {
            action: "created" | "updated";
            templateType: string;
            contractAddress: string;
            deploymentTxHash: string;
            beneficiariesCount: number;
          }
        | null = null;

      if (editingContractId) {
        const response = await updateWillRequest({ willText: trimmedContent });
        notificationPayload = {
          action: "updated",
          templateType: response.templateType,
          contractAddress: response.newContractAddress,
          deploymentTxHash: response.deploymentTxHash,
          beneficiariesCount: response.beneficiaries.length,
        };
      } else {
        const response = await submitWillRequest({ willText: trimmedContent });
        notificationPayload = {
          action: "created",
          templateType: response.templateType,
          contractAddress: response.contractAddress,
          deploymentTxHash: response.deploymentTxHash,
          beneficiariesCount: response.beneficiaries.length,
        };
      }

      let notificationMessage = "";
      if (notificationPayload) {
        const storedProfile = readStoredProfile();
        try {
          const notificationResult = await sendWillNotification({
            ...notificationPayload,
            walletAddress,
            fallbackEmail: storedProfile?.email ?? null,
          });
          if (notificationResult.status === "failed" || notificationResult.status === "skipped") {
            notificationMessage = notificationResult.message;
          }
        } catch {
          notificationMessage = "Will was saved, but notification service could not be reached.";
        }
      }

      await refreshContracts();
      resetWillForm();
      if (notificationMessage && !notificationMessage.includes("No email found")) {
        addToast('success', 'Will Updated', notificationMessage);
      } else {
        addToast('success', 'Success', 'Your will has been saved successfully.');
      }
    } catch (error) {
      if (editingContractId && error instanceof ApiClientError && (error.status === 404 || error.status === 405)) {
        addToast('error', 'Update Not Supported', "Will update is not enabled on this backend yet. Create a new will or enable PUT /api/will.");
        return;
      }
      const message = error instanceof Error ? error.message : "Will submission failed. Please try again.";
      addToast('error', 'Submission Failed', message);
    } finally {
      setIsSubmittingWill(false);
    }
  };

  const editContract = (contract: VaultContract) => {
    setEditingContractId(contract.id);
    setWillTitle(contract.title);
    setWillContent("");
    setWillError("");
  };

  const handleDeleteContract = () => {
    addToast('error', 'Feature Unavailable', "Contract deletion is not available in the current API.");
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
    setIsMounted(true);
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
    setClockTick(Date.now());
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

  if (!isMounted) {
    return <div className="dv-root" style={{ minHeight: '100vh', background: '#000' }} />;
  }

  return (
    <div className="dv-root" style={{ position: 'relative', minHeight: '100vh' }}>
      {/* Toast Overlay - Premium Glassmorphism */}
      <div 
        className="dv-toast-container" 
        style={{ 
          position: 'fixed', 
          top: '24px', 
          right: '24px', 
          zIndex: 999999, 
          display: 'flex', 
          flexDirection: 'column', 
          gap: '12px', 
          pointerEvents: 'none',
          maxWidth: 'calc(100vw - 48px)'
        }}
      >
        {toasts.map((toast) => (
          <div 
            key={toast.id} 
            className={`dv-toast is-${toast.type}`}
            style={{
              pointerEvents: 'auto',
              minWidth: desktop ? '360px' : 'auto',
              width: desktop ? 'auto' : '100%',
              background: 'rgba(255, 255, 255, 0.9)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: '1px solid rgba(255, 255, 255, 0.3)',
              borderLeft: `5px solid ${toast.type === 'success' ? '#10b981' : '#ef4444'}`,
              borderRadius: '14px',
              padding: '14px 18px',
              boxShadow: '0 10px 30px -5px rgba(0, 0, 0, 0.15)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: '14px',
              animation: 'dv-toast-in 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards',
              color: '#111'
            }}
          >
            <div style={{ 
              fontSize: '22px', 
              marginTop: '2px',
              color: toast.type === 'success' ? '#10b981' : '#ef4444' 
            }}>
              {toast.type === 'success' ? '✓' : '⚠'}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ 
                fontWeight: '700', 
                fontSize: '14px', 
                color: '#000',
                letterSpacing: '0.02em',
                marginBottom: '2px'
              }}>
                {toast.title.toUpperCase()}
              </div>
              <div style={{ fontSize: '13px', color: '#555', lineHeight: '1.4' }}>
                {toast.message}
              </div>
            </div>
          </div>
        ))}
      </div>

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
              contractStatus={contractStatus}
              vaultValueEth={vaultValueEth}
              vaultValueError={vaultValueError}
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
              onDeleteContract={handleDeleteContract}
              onCancelEdit={resetWillForm}
              contractsError={contractsError}
              isLoadingContracts={isLoadingContracts}
            />
          ) : (
            <MobileDashboard
              chain={chain}
              contracts={contracts}
              countdownText={countdownText}
              checkInStatus={statusText}
              contractStatus={contractStatus}
              vaultValueEth={vaultValueEth}
              vaultValueError={vaultValueError}
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
              onDeleteContract={handleDeleteContract}
              onCancelEdit={resetWillForm}
              contractsError={contractsError}
              isLoadingContracts={isLoadingContracts}
            />
          )
        ) : null}

        {screen === "payment" ? (
          desktop ? (
            <DesktopNotifications
              statusText={statusText}
              statusError={statusError}
              statusSuccess={statusSuccess}
              isCheckingIn={isCheckingIn}
              onCheckIn={handleCheckIn}
              vaultType={activeVaultType}
              onStartGrace={handleStartGracePeriod}
              onTrigger={handleTrigger}
            />
          ) : (
            <MobileNotifications
              statusText={statusText}
              statusError={statusError}
              statusSuccess={statusSuccess}
              isCheckingIn={isCheckingIn}
              onCheckIn={handleCheckIn}
              vaultType={activeVaultType}
              onStartGrace={handleStartGracePeriod}
              onTrigger={handleTrigger}
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
  contracts: VaultContract[];
  countdownText: string;
  checkInStatus: string;
  contractStatus: string;
  vaultValueEth: string;
  vaultValueError: string;
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
  onDeleteContract: () => void;
  onCancelEdit: () => void;
  contractsError: string;
  isLoadingContracts: boolean;
};

function MobileDashboard({
  chain,
  contracts,
  countdownText,
  checkInStatus,
  contractStatus,
  vaultValueEth,
  vaultValueError,
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
  contractsError,
  isLoadingContracts,
}: DashboardProps) {
  return (
    <section className="dv-mobile-stack dv-dashboard-screen">
      <div className="dv-countdown-wrap">
        <h2 className="dv-countdown">{countdownText}</h2>
        <p className="dv-label">COUNT DOWN TILL NEXT AUTH</p>
        <p className="dv-subcopy">Status: {checkInStatus}{daysRemaining !== null ? ` (${daysRemaining}d)` : ""}</p>
      </div>

      <TypingHeroTitle className="dv-hero-title" text={HOME_HERO_TEXT} />

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
        contractsError={contractsError}
        isLoadingContracts={isLoadingContracts}
      />
    </section>
  );
}

function DesktopDashboard({
  chain,
  contracts,
  countdownText,
  checkInStatus,
  contractStatus,
  vaultValueEth,
  vaultValueError,
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
  contractsError,
  isLoadingContracts,
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
          contractsError={contractsError}
          isLoadingContracts={isLoadingContracts}
        />
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
  onDeleteContract: () => void;
  onCancelEdit: () => void;
  contractsError: string;
  isLoadingContracts: boolean;
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
  contractsError,
  isLoadingContracts,
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
        {isLoadingContracts ? (
          <p className="dv-subcopy">Loading contracts...</p>
        ) : contractsError ? (
          <p className="dv-inline-error">{contractsError}</p>
        ) : contracts.length === 0 ? (
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
                <button type="button" className="is-danger" onClick={onDeleteContract}>Unavailable</button>
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
  statusSuccess,
  isCheckingIn,
  onCheckIn,
  vaultType,
  onStartGrace,
  onTrigger,
}: {
  statusText: string;
  statusError: string;
  statusSuccess: string;
  isCheckingIn: boolean;
  onCheckIn: () => void;
  vaultType: string;
  onStartGrace: () => void;
  onTrigger: () => void;
}) {

  return (
    <section className="dv-mobile-stack">
      <h1 className="dv-hero-title">PAYMENT ACTIVITY</h1>
      <p className="dv-subcopy">Track every transfer and payment event tied to your legacy vault.</p>
      <div className="dv-profile-card">
        <span>CHECK-IN</span>
        <p className="dv-subcopy">Current status: {statusText}</p>
        {statusError ? <p className="dv-inline-error">{statusError}</p> : null}
        {statusSuccess ? <p className="dv-inline-success" style={{ color: '#00ff00', fontSize: '0.85rem', marginTop: '0.25rem' }}>{statusSuccess}</p> : null}
        <button type="button" className="dv-btn-primary dv-checkin-btn" onClick={onCheckIn} disabled={isCheckingIn}>
          {isCheckingIn ? "Processing..." : "I Am Alive"}
        </button>
        {vaultType === "MULTISIG_DEADMAN" && (
          <div className="dv-multisig-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="dv-btn-light" style={{ flex: 1 }} onClick={onStartGrace} disabled={isCheckingIn}>
              Start Grace
            </button>
            <button type="button" className="dv-btn-light is-danger" style={{ flex: 1 }} onClick={onTrigger} disabled={isCheckingIn}>
              Trigger
            </button>
          </div>
        )}

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
  statusSuccess,
  isCheckingIn,
  onCheckIn,
  vaultType,
  onStartGrace,
  onTrigger,
}: {
  statusText: string;
  statusError: string;
  statusSuccess: string;
  isCheckingIn: boolean;
  onCheckIn: () => void;
  vaultType: string;
  onStartGrace: () => void;
  onTrigger: () => void;
}) {

  return (
    <section className="dv-desktop-stack">
      <h1 className="dv-hero-title dv-desktop-hero">PAYMENT ACTIVITY</h1>
      <p className="dv-subcopy dv-notification-callout">Track all outgoing and incoming payment events. Every entry is <span>immutable</span>.</p>
      <div className="dv-profile-card">
        <span>CHECK-IN</span>
        <p className="dv-subcopy">Current status: {statusText}</p>
        {statusError ? <p className="dv-inline-error">{statusError}</p> : null}
        {statusSuccess ? <p className="dv-inline-success" style={{ color: '#00ff00', fontSize: '0.85rem', marginTop: '0.25rem' }}>{statusSuccess}</p> : null}
        <button type="button" className="dv-btn-primary dv-checkin-btn" onClick={onCheckIn} disabled={isCheckingIn}>
          {isCheckingIn ? "Processing..." : "I Am Alive"}
        </button>
        {vaultType === "MULTISIG_DEADMAN" && (
          <div className="dv-multisig-actions" style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button type="button" className="dv-btn-light" style={{ flex: 1 }} onClick={onStartGrace} disabled={isCheckingIn}>
              Start Grace Period
            </button>
            <button type="button" className="dv-btn-light is-danger" style={{ flex: 1 }} onClick={onTrigger} disabled={isCheckingIn}>
              Trigger Redistribution
            </button>
          </div>
        )}

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
