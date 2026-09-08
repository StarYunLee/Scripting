import { captureAccountWork } from "./account-work-guard";
import { invalidateUsageRuntime } from "./runtime-consistency";
import { createRefreshSingleFlight } from "./refresh-single-flight";
import { credentialPersistenceFailure } from "./credential-errors";
import { recordWidgetRefreshFailure } from "./widget-refresh-state";
import { recordWidgetRefreshSuccess } from "./widget-refresh-metadata";
import {
  getUsageProvider,
  getWidgetRefreshProvider,
} from "../providers/usage-registry";
import { getSnapshotProvider } from "../providers/snapshot-registry";
import { getWidgetRefreshMetadata } from "./widget-refresh-metadata";
import { getAppDisplaySettings } from "./settings";
import { planUsageRefresh } from "./refresh-policy";
import type { NormalizedUsageSnapshot } from "./usage-model";
import { PROVIDER_IDS, type ProviderId } from "../models";
import { writeLog, flushRunRecordBatch, type RunRecord } from "./logger";
import { runWithConcurrency } from "./refresh-batches";

export type RefreshTarget = {
  provider: ProviderId;
  profileId: string;
};

export type RefreshOutcome = RefreshTarget & {
  ok: boolean;
  source?: "live" | "cache";
  snapshot?: NormalizedUsageSnapshot;
  storageAccepted?: boolean;
  warning?: string;
  error?: {
    message: string;
    code?: string;
    status?: number;
  };
};

export type RefreshOptions = {
  logBatch?: RunRecord[];
  force: boolean;
  source: "app" | "intent";
};

export type RefreshSummary = {
  total: number;
  succeeded: number;
  failed: number;
  outcomes: RefreshOutcome[];
};

const refreshSingleFlight = createRefreshSingleFlight();

export async function refreshAccount(
  target: RefreshTarget,
  options: RefreshOptions,
): Promise<RefreshOutcome> {
  const execute = () =>
    refreshSingleFlight.run(target, () =>
      performRefreshAccount(target, options),
    );
  const result = await execute();
  return options.force && result.ok && result.source === "cache"
    ? execute()
    : result;
}

async function performRefreshAccount(
  target: RefreshTarget,
  options: RefreshOptions,
): Promise<RefreshOutcome> {
  const currentWork = captureAccountWork(target.provider, target.profileId);
  invalidateUsageRuntime();
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
    const cached = getSnapshotProvider(target.provider).cache(target.profileId);
    const plan = planUsageRefresh({
      fetchedAt: cached?.fetchedAt || null,
      reloadMinutes: getAppDisplaySettings().reloadMinutes,
      metadata: getWidgetRefreshMetadata(target.provider, target.profileId),
      force: options.force,
    });
    if (plan.action === "use_cache") {
      if (plan.reason === "fresh" || plan.reason === "manual") {
        return {
          ...target,
          ok: true,
          source: "cache",
          snapshot: cached || undefined,
        };
      }
      return {
        ...target,
        ok: false,
        error: {
          code: plan.reason,
          message:
            plan.reason === "authorization_required"
              ? "授权已失效，请重新授权"
              : "自动刷新退避中，请稍后重试",
        },
      };
    }
    const result = await getWidgetRefreshProvider(
      target.provider,
    ).fetchSnapshot({
      force: options.force,
      profileId: target.profileId,
    });
    if (!currentWork())
      return {
        ...target,
        ok: false,
        error: { code: "superseded", message: "账号已变化，已忽略旧结果" },
      };
    if (result.ok) {
      if (
        result.snapshot.source === "live" &&
        result.storageAccepted !== false
      ) {
        const refreshedAt = new Date().toISOString();
        recordWidgetRefreshSuccess(
          target.provider,
          target.profileId,
          refreshedAt,
        );
      }
      writeLog(
        {
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
        },
        options.logBatch,
      );
      const warning =
        result.storageAccepted === false
          ? "本轮用量已更新，但缓存保存失败，小组件可能仍显示旧数据"
          : undefined;
      if (warning)
        writeLog({
          level: "warning",
          source: options.source,
          category: "cache",
          event: "refresh.cache_rejected",
          message: warning,
        });
      return {
        ...target,
        ok: true,
        source: result.snapshot.source,
        snapshot: result.snapshot,
        storageAccepted: result.storageAccepted,
        warning,
      };
    }

    recordWidgetRefreshFailure(target.provider, target.profileId, result.error);
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
    if (!currentWork())
      return {
        ...target,
        ok: false,
        error: { code: "superseded", message: "账号已变化，已忽略旧结果" },
      };
    const credentialFailure = credentialPersistenceFailure(error);
    const detail = credentialFailure
      ? credentialFailure.code
      : error instanceof Error
        ? error.name
        : "unknown";
    const message = credentialFailure
      ? credentialFailure.message
      : "刷新发生异常";
    const refreshError = {
      code: detail,
      message,
    };
    recordWidgetRefreshFailure(target.provider, target.profileId, refreshError);
    writeLog({
      level: "error",
      source: options.source,
      category: "refresh",
      event: credentialFailure
        ? "refresh.credential_persist_failed"
        : "refresh.exception",
      provider: target.provider,
      accountId: target.profileId,
      message,
      code: detail,
    });
    return {
      ...target,
      ok: false,
      error: { message, code: detail },
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
  const logBatch: RunRecord[] = [];
  const settled = await runWithConcurrency(
    targets,
    REFRESH_BATCH_SIZE,
    async (target): Promise<RefreshOutcome> => {
      try {
        await callbacks.onStart?.(target);
      } catch {
        /* UI callback failures must not skip the provider refresh. */
      }
      const outcome = await refreshAccount(target, { ...options, logBatch });
      try {
        await callbacks.onResult?.(outcome);
      } catch {
        /* Preserve the provider outcome when a UI callback fails. */
      }
      return outcome;
    },
  );
  flushRunRecordBatch(logBatch);
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
