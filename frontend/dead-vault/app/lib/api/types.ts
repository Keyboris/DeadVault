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
};

export type CheckInResponse = {
  nextDueAt: string;
  intervalDays: number;
};

export type CheckInStatusResponse = {
  nextDueAt: string;
  daysRemaining: number;
  status: "ACTIVE" | "GRACE" | "TRIGGERED" | "REVOKED" | string;
};

export type SmartContractRequest = {
  prompt: string;
};

export type SmartContractResponse = {
  model: string;
  contract: string;
};

export type ApiErrorPayload = {
  error?: string;
};
