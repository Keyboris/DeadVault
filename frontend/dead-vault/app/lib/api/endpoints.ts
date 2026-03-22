import { apiFetch } from "./client";
import type {
  CheckInResponse,
  CheckInStatusResponse,
  ContractSummaryResponse,
  NonceResponse,
  SmartContractRequest,
  SmartContractResponse,
  TokenResponse,
  WillNotificationRequest,
  WillNotificationResponse,
  UpdateWillResponse,
  VerifyRequest,
  VaultBalanceResponse,
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

export function getVaultBalance(tokens: string[] = []): Promise<VaultBalanceResponse> {
  const query = new URLSearchParams();
  for (const token of tokens) {
    query.append("tokens", token);
  }
  const suffix = query.toString();
  return apiFetch<VaultBalanceResponse>(`/api/vault/balance${suffix ? `?${suffix}` : ""}`);
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

export function sendWillNotification(payload: WillNotificationRequest): Promise<WillNotificationResponse> {
  return fetch("/api/notifications/will", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  }).then(async (response) => {
    const body = (await response.json()) as Partial<WillNotificationResponse> & { message?: string };
    if (!response.ok) {
      return {
        status: "failed",
        message: body.message || "Will was saved, but email notification failed.",
        recipientEmail: body.recipientEmail ?? null,
      };
    }
    return {
      status: body.status === "sent" || body.status === "skipped" || body.status === "failed" ? body.status : "failed",
      message: body.message || "Notification request processed.",
      recipientEmail: body.recipientEmail ?? null,
    };
  });
}
