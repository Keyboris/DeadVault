export type NonceResponse = {
  walletAddress: string;
  nonce: string;
};

export type VerifyRequest = {
  walletAddress: string;
  nonce: string;
  signature: string;
};

export type TokenResponse = {
  token: string;
};

export type ResolvedBeneficiary = {
  name: string;
  walletAddress: string;
  basisPoints: number;
  condition: string;
  timeLockDays: number;
};

export type WillRequest = {
  willText: string;
};

export type WillResponse = {
  configId: string;
  templateType: string;
  beneficiaries: ResolvedBeneficiary[];
  contractAddress: string;
  deploymentTxHash: string;
};

export type UpdateWillResponse = {
  newConfigId: string;
  templateType: string;
  beneficiaries: ResolvedBeneficiary[];
  oldContractAddress: string;
  revokeTxHash: string;
  newContractAddress: string;
  deploymentTxHash: string;
};

export type BeneficiarySummary = {
  label: string;
  walletAddress: string;
  basisPoints: number;
  condition: string;
};

export type ContractSummaryResponse = {
  id: string;
  contractAddress: string;
  deploymentTxHash: string;
  vaultType: string;
  status: string;
  deployedAt: string;
  beneficiaries: BeneficiarySummary[];
  ethBalanceWei: string;
  ethBalanceEther: string;
  owners?: string[];
  threshold?: number;
  inactivitySeconds?: number;
  graceSeconds?: number;
};


export type TokenBalance = {
  tokenAddress: string;
  symbol: string;
  balanceRaw: string;
  balanceFormatted: string;
  decimals: number;
};

export type VaultBalanceResponse = {
  contractAddress: string;
  ethBalanceWei: string;
  ethBalanceEther: string;
  tokens: TokenBalance[];
};

export type CheckInResponse = {
  nextDueAt: string;
  intervalDays: number;
};

export type CheckInStatusResponse = {
  lastCheckInAt: string;
  nextDueAt: string;
  secondsRemaining: number;
  intervalDays: number;
  gracePeriodDays: number;
  status: "ACTIVE" | "GRACE" | "TRIGGERED" | "REVOKED" | string;
};

export type SmartContractRequest = {
  prompt: string;
};

export type SmartContractResponse = {
  model: string;
  contract: string;
};

export type WillNotificationRequest = {
  walletAddress: string | null;
  fallbackEmail?: string | null;
  action: "created" | "updated";
  templateType: string;
  contractAddress: string;
  deploymentTxHash: string;
  beneficiariesCount: number;
};

export type WillNotificationResponse = {
  status: "sent" | "skipped" | "failed";
  message: string;
  recipientEmail: string | null;
};

export type ApiErrorPayload = {
  error?: string;
};
