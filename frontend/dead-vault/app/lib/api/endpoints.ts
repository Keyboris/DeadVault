import { apiFetch } from "./client";
import type {
  CheckInResponse,
  CheckInStatusResponse,
  ContractSummaryResponse,
  NonceResponse,
  SmartContractRequest,
  SmartContractResponse,
  TokenResponse,
  UpdateWillResponse,
  VerifyRequest,
  WillRequest,
  WillResponse,
} from "./types";

export function getNonce(walletAddress: string): Promise<NonceResponse> {
  const query = new URLSearchParams({ walletAddress });
  return apiFetch<NonceResponse>(`/api/auth/nonce?${query.toString()}`);
}

export function verifySignature(payload: VerifyRequest): Promise<TokenResponse> {
  return apiFetch<TokenResponse>("/api/auth/verify", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function submitWill(payload: WillRequest): Promise<WillResponse> {
  return apiFetch<WillResponse>("/api/will", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export function updateWill(payload: WillRequest): Promise<UpdateWillResponse> {
  return apiFetch<UpdateWillResponse>("/api/will", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

export function getContracts(): Promise<ContractSummaryResponse[]> {
  return apiFetch<ContractSummaryResponse[]>("/api/contracts");
}

export function checkIn(): Promise<CheckInResponse> {
  return apiFetch<CheckInResponse>("/api/check-in", {
    method: "POST",
  });
}

export function getCheckInStatus(): Promise<CheckInStatusResponse> {
  return apiFetch<CheckInStatusResponse>("/api/check-in/status");
}

export function generateContract(payload: SmartContractRequest): Promise<SmartContractResponse> {
  return apiFetch<SmartContractResponse>("/api/contracts/generate", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
