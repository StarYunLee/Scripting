import type { ProviderId } from "../models";
import type { NormalizedUsageSnapshot } from "../services/usage-model";

export type ProviderAccount = {
  id: string;
  name: string;
  email: string | null;
  createdAt: string;
};

export type ProviderUsageResult =
  | { ok: true; snapshot: { source: "live" | "cache" } }
  | {
      ok: false;
      error: {
        code: string;
        message: string;
        status?: number;
        detail?: string;
      };
    };

export type AccountLookupProvider = {
  id: ProviderId;
  list(): ProviderAccount[];
  token(profileId: string): string | null;
};

export type UsageProvider = AccountLookupProvider & {
  fetch(options: {
    force?: boolean;
    profileId?: string | null;
  }): Promise<ProviderUsageResult>;
};

export type ProviderCore = AccountLookupProvider & {
  ensure(): unknown;
  create(): ProviderAccount;
  remove(profileId: string): void;
  auth: {
    start(profileId: string): Promise<string>;
    complete(input: string): Promise<void>;
    clearPending(): void;
    pendingId(): string | null;
    hasPending(): boolean;
  };
  usage: {
    fetch(options: {
      force?: boolean;
      profileId?: string | null;
    }): Promise<ProviderUsageResult>;
    cache(profileId: string): NormalizedUsageSnapshot | null;
    clearCache(profileId: string): void;
  };
  clearSettings(profileId: string): unknown;
};
