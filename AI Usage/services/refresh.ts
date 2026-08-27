import { getUsageProvider } from "../providers/usage-registry";
import { PROVIDER_IDS, type ProviderId } from "../models";
import { writeLog } from "./logger";
import { runWithConcurrency } from "./refresh-batches";

export type RefreshTarget = {
  provider: ProviderId;
  profileId: string;
};

export type RefreshOutcome = RefreshTarget & {
  ok: boolean;
  source?: "live" | "cache";
  error?: {
    message: string;
    code?: string;
    status?: number;
  };
};

export type RefreshOptions = {
  force: boolean;
  source: "app" | "widget" | "intent";
};

export type RefreshSummary = {
  total: number;
  succeeded: number;
  failed: number;
  outcomes: RefreshOutcome[];
};

export async function refreshAccount(
  target: RefreshTarget,
  options: RefreshOptions,
): Promise<RefreshOutcome> {
  const provider = getUsageProvider(target.provider);
  const account = provider.list().find((item) => item.id === target.profileId);
  if (!account) {
    const error = {
      message: "账号不存在",
      code: "account_not_found",
    };
    writeLog({
      level: "error",
      source: options.source,
      category: "refresh",
      event: "refresh.failed",
      provider: target.provider,
      accountId: target.profileId,
      message: error.message,
      code: error.code,
    });
    return { ...target, ok: false, error };
  }

  try {
    const result = await provider.fetch({
      force: options.force,
      profileId: target.profileId,
    });
    if (result.ok) {
      writeLog({
        level: "info",
        source: options.source,
        category: result.snapshot.source === "cache" ? "cache" : "refresh",
        event:
          result.snapshot.source === "cache"
            ? "refresh.cache"
            : "refresh.succeeded",
        provider: target.provider,
        accountId: target.profileId,
        message:
          result.snapshot.source === "cache" ? "使用最近缓存" : "刷新成功",
      });
      return { ...target, ok: true, source: result.snapshot.source };
    }

    writeLog({
      level: "error",
      source: options.source,
      category: "refresh",
      event: "refresh.failed",
      provider: target.provider,
      accountId: target.profileId,
      message: result.error.message,
      code: result.error.code,
      status: result.error.status,
    });
    return {
      ...target,
      ok: false,
      error: {
        message: result.error.message,
        code: result.error.code,
        status: result.error.status,
      },
    };
  } catch (error) {
    const detail = error instanceof Error ? error.name : "unknown";
    writeLog({
      level: "error",
      source: options.source,
      category: "refresh",
      event: "refresh.exception",
      provider: target.provider,
      accountId: target.profileId,
      message: "刷新发生异常",
      code: detail,
    });
    return {
      ...target,
      ok: false,
      error: { message: "刷新发生异常", code: detail },
    };
  }
}

export type RefreshBatchCallbacks = {
  onStart?: (target: RefreshTarget) => void | Promise<void>;
  onResult?: (outcome: RefreshOutcome) => void | Promise<void>;
};

const REFRESH_BATCH_SIZE = 3;

export async function refreshAccounts(
  targets: RefreshTarget[],
  options: RefreshOptions,
  callbacks: RefreshBatchCallbacks = {},
): Promise<RefreshSummary> {
  const settled = await runWithConcurrency(
    targets,
    REFRESH_BATCH_SIZE,
    async (target): Promise<RefreshOutcome> => {
      try {
        await callbacks.onStart?.(target);
      } catch {
        /* UI callback failures must not skip the provider refresh. */
      }
      const outcome = await refreshAccount(target, options);
      try {
        await callbacks.onResult?.(outcome);
      } catch {
        /* Preserve the provider outcome when a UI callback fails. */
      }
      return outcome;
    },
  );
  const outcomes = settled.map((item, index): RefreshOutcome =>
    item.ok
      ? item.value
      : {
          ...targets[index],
          ok: false,
          error: { message: "刷新发生异常", code: "batch_exception" },
        },
  );
  return {
    total: outcomes.length,
    succeeded: outcomes.filter((item) => item.ok).length,
    failed: outcomes.filter((item) => !item.ok).length,
    outcomes,
  };
}

export async function refreshProviderAccounts(
  provider: ProviderId,
  options: RefreshOptions,
  callbacks: RefreshBatchCallbacks = {},
): Promise<RefreshSummary> {
  const usageProvider = getUsageProvider(provider);
  const accounts = usageProvider
    .list()
    .filter((account) => Boolean(usageProvider.token(account.id)));
  return refreshAccounts(
    accounts.map((account) => ({ provider, profileId: account.id })),
    options,
    callbacks,
  );
}

export async function refreshAllAuthorizedAccounts(
  options: RefreshOptions,
  callbacks: RefreshBatchCallbacks = {},
): Promise<RefreshSummary> {
  const targets: RefreshTarget[] = [];
  for (const provider of PROVIDER_IDS) {
    const usageProvider = getUsageProvider(provider);
    for (const account of usageProvider.list()) {
      if (usageProvider.token(account.id)) {
        targets.push({ provider, profileId: account.id });
      }
    }
  }
  return refreshAccounts(targets, options, callbacks);
}
