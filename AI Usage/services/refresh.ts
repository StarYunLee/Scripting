import { getUsageProvider } from "../providers/usage-registry";
import { PROVIDER_IDS, type ProviderId } from "../models";
import { writeLog } from "./logger";

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
  /** 总预算的绝对截止时间；仅用于在发起下一次小组件请求前停止。 */
  deadlineMs?: number;
  /** 批量刷新时可关闭逐账号成功/缓存日志，改由调用方写汇总。 */
  logSuccess?: boolean;
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

  if (options.deadlineMs != null && Date.now() >= options.deadlineMs) {
    return {
      ...target,
      ok: false,
      error: { message: "小组件刷新预算已用尽", code: "deadline_exceeded" },
    };
  }

  try {
    const result = await provider.fetch({
      force: options.force,
      profileId: target.profileId,
    });
    if (result.ok) {
      if (options.logSuccess !== false) {
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
      }
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

/** 有界并发：每批 size 个并行，批间串行。fn 内部自行捕获异常时结果逐个返回。 */
export async function inBatches<T, R>(
  items: T[],
  size: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    out.push(...(await Promise.all(batch.map(fn))));
  }
  return out;
}

/** 应用侧刷新并发上限；小组件（30MB 内存上限）用更小的批。 */
const REFRESH_BATCH_SIZE = 3;

export async function refreshAccounts(
  targets: RefreshTarget[],
  options: RefreshOptions,
  callbacks: RefreshBatchCallbacks = {},
): Promise<RefreshSummary> {
  // refreshAccount 内部已捕获所有异常并返回 outcome，不会 reject；
  // 这里再兜一层回调异常，保证一个账号失败不影响整批。
  const outcomes = await inBatches(targets, REFRESH_BATCH_SIZE, async (target) => {
    try {
      await callbacks.onStart?.(target);
      const outcome = await refreshAccount(target, options);
      await callbacks.onResult?.(outcome);
      return outcome;
    } catch {
      return {
        ...target,
        ok: false,
        error: { message: "刷新发生异常", code: "callback_exception" },
      } as RefreshOutcome;
    }
  });
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
