export const DMS_TOKEN_STORAGE_KEY = "dms_token";

const DEFAULT_API_BASE_URL = "http://localhost:8080";
const DEFAULT_BASE_CHAIN_HEX = "0x2105";

const LOCAL_HOSTS = new Set(["localhost", "127.0.0.1"]);

function ensureNoTrailingSlash(value: string): string {
  return value.endsWith("/") ? value.slice(0, -1) : value;
}

export function getApiBaseUrl(): string {
  const raw = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();
  const configured = ensureNoTrailingSlash(raw && raw.length > 0 ? raw : DEFAULT_API_BASE_URL);

  if (typeof window === "undefined") {
    return configured;
  }

  try {
    const parsed = new URL(configured);
    const runtimeHost = window.location.hostname;
    if (LOCAL_HOSTS.has(parsed.hostname) && runtimeHost && !LOCAL_HOSTS.has(runtimeHost)) {
      parsed.hostname = runtimeHost;
      return ensureNoTrailingSlash(parsed.toString());
    }
    return ensureNoTrailingSlash(parsed.toString());
  } catch {
    return configured;
  }
}

export function getExpectedBaseChainHex(): string {
  const chain = process.env.NEXT_PUBLIC_BASE_CHAIN_ID_HEX?.trim();
  return (chain && chain.length > 0 ? chain : DEFAULT_BASE_CHAIN_HEX).toLowerCase();
}
