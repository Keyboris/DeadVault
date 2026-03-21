export type Recipient = {
  name: string;
  wallet: string;
  note: string;
};

export type VaultContract = {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
};

export type StoredProfile = {
  authWalletAddress: string;
  walletAddress: string | null;
  recipients: Recipient[];
  contracts: VaultContract[];
  skipped: {
    wallet: boolean;
    recipients: boolean;
  };
  onboardingCompleted: boolean;
  createdAt: string;
  email?: string;
  password?: string;
  passwordSet?: boolean;
};

export const AUTH_PROFILE_STORAGE_KEY = "deadvault.auth.profile";
export const AUTH_SESSION_STORAGE_KEY = "deadvault.auth.session";
