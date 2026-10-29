import { PROVIDER_IDS, type ProviderId } from "../models";
import { CURRENT_VERSION } from "../changelog";
import { getAppDisplaySettings } from "./settings";
import type { BackupAccountItem, BackupPayload } from "./backup-crypto";
import { retireAccountWork } from "./account-work-guard";
import { invalidateUsageRuntime } from "./runtime-consistency";
import { clearWidgetRefreshMetadata } from "./widget-refresh-metadata";
import { invalidateDashboardWidgetPreferences } from "./dashboard-widget-prefs";
import { clearSnapshotCache } from "../providers/snapshot-registry";
import { normalizeRegion } from "../providers/workbuddy/regions";

// 各平台 secret 字段映射，与各 provider accounts.ts 中的定义严格对齐
const PROVIDER_SECRET_FIELDS: Record<ProviderId, string[]> = {
  codex: [
    "access_token",
    "refresh_token",
    "id_token",
    "expires_at",
    "account_id",
  ],
  claude: [
    "access_token",
    "refresh_token",
    "id_token",
    "expires_at",
    "account_id",
  ],
  grok: [
    "access_token",
    "refresh_token",
    "id_token",
    "expires_at",
    "account_id",
  ],
  antigravity: ["access_token", "refresh_token", "id_token", "expires_at"],
  cursor: [
    "access_token",
    "refresh_token",
    "id_token",
    "expires_at",
    "account_id",
  ],
  kimi: ["access_token", "refresh_token", "expires_at", "account_id"],
  copilot: ["access_token", "account_id"],
  zai: ["access_token", "region", "account_id"],
  minimax: ["access_token", "region", "account_id"],
  workbuddy: [
    "access_token",
    "refresh_token",
    "expires_at",
    "refresh_expires_at",
    "domain",
    "token_type",
    "uid",
    "enterprise_id",
    "region",
    "account_id",
  ],
};

const PROVIDER_SECRET_PREFIXES: Record<ProviderId, string> = {
  codex: "ai_usage_codex_profile",
  claude: "ai_usage_claude_profile",
  grok: "ai_usage_grok_profile",
  antigravity: "ai_usage_antigravity_profile",
  cursor: "ai_usage_cursor_profile",
  kimi: "ai_usage_kimi_profile",
  copilot: "ai_usage_copilot_profile",
  zai: "ai_usage_zai_profile",
  minimax: "ai_usage_minimax_profile",
  workbuddy: "ai_usage_workbuddy_profile",
};

const PROVIDER_REGISTRY_KEYS: Record<ProviderId, string> = {
  codex: "ai_usage_codex_account_registry_v1",
  claude: "ai_usage_claude_account_registry_v1",
  grok: "ai_usage_grok_account_registry_v1",
  antigravity: "ai_usage_antigravity_account_registry_v1",
  cursor: "ai_usage_cursor_account_registry_v1",
  kimi: "ai_usage_kimi_account_registry_v1",
  copilot: "ai_usage_copilot_account_registry_v1",
  zai: "ai_usage_zai_account_registry_v1",
  minimax: "ai_usage_minimax_account_registry_v1",
  workbuddy: "ai_usage_workbuddy_account_registry_v1",
};

type StoredRegistry = {
  version: number;
  defaultAccountId: string | null;
  accounts: Array<{
    id: string;
    name: string;
    email: string | null;
    accountId?: string | null;
    createdAt?: string;
    updatedAt?: string;
    [key: string]: unknown;
  }>;
};

/**
 * 读取当前设备上的所有真实数据并构建明文 BackupPayload
 */
export function buildBackupPayload(): BackupPayload {
  const accounts: BackupAccountItem[] = [];
  const defaultAccountIds: Partial<Record<ProviderId, string | null>> = {};

  for (const provider of PROVIDER_IDS) {
    const registryKey = PROVIDER_REGISTRY_KEYS[provider];
    const prefix = PROVIDER_SECRET_PREFIXES[provider];
    const fields = PROVIDER_SECRET_FIELDS[provider];

    let registry: StoredRegistry | null = null;
    try {
      registry = Storage.get<StoredRegistry>(registryKey);
    } catch {
      registry = null;
    }

    if (registry && Array.isArray(registry.accounts)) {
      defaultAccountIds[provider] = registry.defaultAccountId;

      for (const account of registry.accounts) {
        if (!account || !account.id || account.id.startsWith("demo_")) continue;

        const secrets: Record<string, string> = {};
        for (const field of fields) {
          const secretKey = `${prefix}_${account.id}_${field}`;
          try {
            const val = Keychain.get(secretKey);
            if (typeof val === "string" && val.trim().length > 0) {
              secrets[field] = val.trim();
            }
          } catch {
            /* ignore keychain read error */
          }
        }

        // 仅当账号持有至少一个密钥凭证时才计入备份
        if (Object.keys(secrets).length > 0) {
          accounts.push({
            provider,
            id: account.id,
            name: account.name || "",
            email: account.email || null,
            accountId: account.accountId || null,
            createdAt: account.createdAt,
            updatedAt: account.updatedAt,
            secrets,
          });
        }
      }
    }
  }

  // 读取偏好设置
  const displaySettings = getAppDisplaySettings();

  let appOverview: Record<string, unknown> | undefined;
  try {
    const raw = Storage.get<Record<string, unknown>>(
      "ai_usage_app_overview_preferences_v1",
    );
    if (raw && typeof raw === "object") appOverview = raw;
  } catch {
    /* ignore */
  }

  let widgetWindows: Record<string, unknown> | undefined;
  try {
    const raw = Storage.get<Record<string, unknown>>(
      "ai_usage_widget_window_preferences_v1",
    );
    if (raw && typeof raw === "object") widgetWindows = raw;
  } catch {
    /* ignore */
  }

  let dashboardWidget: Record<string, unknown> | undefined;
  try {
    const raw = Storage.get<Record<string, unknown>>(
      "ai_usage_dashboard_widget_preferences_v1",
    );
    if (raw && typeof raw === "object") dashboardWidget = raw;
  } catch {
    /* ignore */
  }

  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    appVersion: CURRENT_VERSION,
    data: {
      accounts,
      defaultAccountIds,
      preferences: {
        displaySettings: {
          reloadMinutes: displaySettings.reloadMinutes,
          backgroundTheme: displaySettings.backgroundTheme,
          maskUsageCardEmail: displaySettings.maskUsageCardEmail,
          widgetChromeStyle: displaySettings.widgetChromeStyle,
        },
        appOverview:
          appOverview as BackupPayload["data"]["preferences"]["appOverview"],
        widgetWindows:
          widgetWindows as BackupPayload["data"]["preferences"]["widgetWindows"],
        dashboardWidget:
          dashboardWidget as BackupPayload["data"]["preferences"]["dashboardWidget"],
      },
    },
  };
}

export type RestoreSummary = {
  totalAccounts: number;
  addedAccounts: number;
  updatedAccounts: number;
};

function secretText(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0
    ? value.trim()
    : null;
}

/** Keychain 读取一律吞掉宿主错误，且绝不上抛或打印凭据内容。 */
function readSecretField(
  prefix: string,
  profileId: string,
  field: string,
): string | null {
  try {
    return secretText(Keychain.get(`${prefix}_${profileId}_${field}`));
  } catch {
    return null;
  }
}

type WorkbuddyIdentity = {
  region: "cn" | "intl";
  uid: string;
  enterpriseId: string | null;
};

/**
 * WorkBuddy 跨设备备份没有邮箱，稳定身份是 region + uid（回退 accountId）+ enterprise_id。
 * 任一维度缺失都不构成可合并身份，避免把国内版/国际版或不同企业租户合并成同一账号。
 */
function workbuddyIdentity(input: {
  region?: unknown;
  uid?: unknown;
  enterpriseId?: unknown;
  accountId?: unknown;
}): WorkbuddyIdentity | null {
  const region = normalizeRegion(secretText(input.region));
  const uid = secretText(input.uid) ?? secretText(input.accountId);
  if (!region || !uid) return null;
  return { region, uid, enterpriseId: secretText(input.enterpriseId) };
}

function sameWorkbuddyIdentity(
  a: WorkbuddyIdentity,
  b: WorkbuddyIdentity,
): boolean {
  return (
    a.region === b.region &&
    a.uid === b.uid &&
    a.enterpriseId === b.enterpriseId
  );
}

function localWorkbuddyIdentity(
  prefix: string,
  account: StoredRegistry["accounts"][number],
): WorkbuddyIdentity | null {
  return workbuddyIdentity({
    region: readSecretField(prefix, account.id, "region"),
    uid: readSecretField(prefix, account.id, "uid"),
    enterpriseId: readSecretField(prefix, account.id, "enterprise_id"),
    accountId:
      secretText(account.accountId) ??
      readSecretField(prefix, account.id, "account_id"),
  });
}

function incomingWorkbuddyIdentity(
  incoming: BackupAccountItem,
): WorkbuddyIdentity | null {
  const secrets = incoming.secrets || {};
  return workbuddyIdentity({
    region: secrets.region,
    uid: secrets.uid,
    enterpriseId: secrets.enterprise_id,
    accountId: secretText(incoming.accountId) ?? secrets.account_id,
  });
}

/**
 * 定位备份账号对应的本地账号：
 * 1. 同 id 一律原地恢复（保留本地 profile id 及引用）；
 * 2. WorkBuddy 只按 region + uid + enterprise 合并，不使用邮箱；
 * 3. 其他平台保持原有 id / email 合并语义。
 */
function findExistingAccountIndex(options: {
  provider: ProviderId;
  prefix: string;
  accounts: StoredRegistry["accounts"];
  incoming: BackupAccountItem;
}): number {
  const { provider, prefix, accounts, incoming } = options;
  const sameId = accounts.findIndex((account) => account.id === incoming.id);
  if (sameId >= 0) return sameId;

  if (provider === "workbuddy") {
    const incomingIdentity = incomingWorkbuddyIdentity(incoming);
    if (!incomingIdentity) return -1;
    return accounts.findIndex((account) => {
      const local = localWorkbuddyIdentity(prefix, account);
      return local ? sameWorkbuddyIdentity(local, incomingIdentity) : false;
    });
  }

  const email = secretText(incoming.email)?.toLowerCase();
  if (!email) return -1;
  return accounts.findIndex(
    (account) => secretText(account.email)?.toLowerCase() === email,
  );
}

function remapPreferenceAccounts<T extends object>(
  preferences: T,
  accountKeys: Map<string, string>,
): T {
  const next = { ...preferences } as Record<string, unknown>;
  for (const field of ["hiddenAccountKeys", "accountOrder"]) {
    const values = next[field];
    if (Array.isArray(values)) {
      next[field] = [...new Set(values.map((key) =>
        typeof key === "string" ? accountKeys.get(key) ?? key : key,
      ))];
    }
  }
  for (const field of ["selectedWindows", "windowIdsByAccount"]) {
    const values = next[field];
    if (values && typeof values === "object" && !Array.isArray(values)) {
      next[field] = Object.fromEntries(Object.entries(values).map(([key, value]) =>
        [accountKeys.get(key) ?? key, value],
      ));
    }
  }
  return next as T;
}

/**
 * 增量合并还原备份 Payload
 */
export function restoreBackupPayload(payload: BackupPayload): RestoreSummary {
  let added = 0;
  let updated = 0;
  const restoredWorkbuddyKeys = new Map<string, string>();

  const accountsByProvider = new Map<ProviderId, BackupAccountItem[]>();
  for (const item of payload.data.accounts || []) {
    if (!PROVIDER_IDS.includes(item.provider as ProviderId)) continue;
    const list = accountsByProvider.get(item.provider as ProviderId) || [];
    list.push(item);
    accountsByProvider.set(item.provider as ProviderId, list);
  }

  for (const provider of PROVIDER_IDS) {
    const incomingList = accountsByProvider.get(provider);
    if (!incomingList || incomingList.length === 0) continue;

    const registryKey = PROVIDER_REGISTRY_KEYS[provider];
    const prefix = PROVIDER_SECRET_PREFIXES[provider];

    let registry: StoredRegistry = {
      version: 1,
      defaultAccountId: null,
      accounts: [],
    };
    try {
      const raw = Storage.get<StoredRegistry>(registryKey);
      if (raw && Array.isArray(raw.accounts)) {
        registry = raw;
      }
    } catch {
      /* ignore */
    }

    const currentAccounts = [...registry.accounts];
    const fields = PROVIDER_SECRET_FIELDS[provider];
    /** 备份账号 id → 实际落库 id（身份合并后两者可能不同），供默认账号映射使用。 */
    const restoredIds = new Map<string, string>();

    for (const incoming of incomingList) {
      const existingIndex = findExistingAccountIndex({
        provider,
        prefix,
        accounts: currentAccounts,
        incoming,
      });

      const now = new Date().toISOString();
      const targetId =
        existingIndex >= 0 ? currentAccounts[existingIndex].id : incoming.id;
      restoredIds.set(incoming.id, targetId);
      if (provider === "workbuddy" && incoming.id !== targetId) {
        restoredWorkbuddyKeys.set(`workbuddy:${incoming.id}`, `workbuddy:${targetId}`);
      }

      if (existingIndex >= 0) {
        // 更新现有账号
        const existing = currentAccounts[existingIndex];
        currentAccounts[existingIndex] = {
          ...existing,
          name: incoming.name || existing.name,
          email: incoming.email || existing.email,
          accountId: incoming.accountId || existing.accountId,
          updatedAt: now,
        };
        updated++;
      } else {
        // 新增账号
        const newAccount = {
          id: incoming.id,
          name: incoming.name,
          email: incoming.email,
          accountId: incoming.accountId || null,
          createdAt: incoming.createdAt || now,
          updatedAt: now,
        };
        currentAccounts.push(newAccount);
        added++;
      }

      // 写入并覆盖 Keychain Secrets（全字段受控覆盖，避免历史废弃凭据残留）
      for (const field of fields) {
        const secretKey = `${prefix}_${targetId}_${field}`;
        const secretVal = incoming.secrets?.[field];
        try {
          if (secretVal && secretVal.trim().length > 0) {
            Keychain.set(secretKey, secretVal.trim());
          } else {
            Keychain.remove(secretKey);
          }
        } catch {
          /* ignore */
        }
      }

      // 清理旧缓存与调度元数据，并注销正在执行的后台任务
      retireAccountWork(provider, targetId);
      clearWidgetRefreshMetadata(provider, targetId);
      // 缓存键版本由 snapshot-registry 的 definition 统一提供，避免恢复路径再次漏清
      clearSnapshotCache(provider, targetId);
    }

    registry.accounts = currentAccounts;
    // 默认账号恢复策略：若本地已有有效默认账号则保留；否则使用备份中记录的默认账号；最后回退至首个账号
    const localDefaultValid = currentAccounts.some(
      (a) => a.id === registry.defaultAccountId,
    );
    if (!localDefaultValid) {
      const backedDefault = payload.data.defaultAccountIds?.[provider];
      // 备份里的默认账号可能已被身份合并到本地 id，需先映射再校验
      const mappedDefault = backedDefault
        ? restoredIds.get(backedDefault) ?? backedDefault
        : null;
      if (
        mappedDefault &&
        currentAccounts.some((a) => a.id === mappedDefault)
      ) {
        registry.defaultAccountId = mappedDefault;
      } else {
        registry.defaultAccountId = currentAccounts[0]?.id || null;
      }
    }

    try {
      Storage.set(registryKey, registry);
    } catch {
      /* ignore */
    }
  }

  // 恢复偏好设置（若有）
  const prefs = payload.data.preferences;
  if (prefs) {
    if (prefs.displaySettings) {
      try {
        const currentDisplay =
          Storage.get<Record<string, unknown>>(
            "ai_usage_display_settings_v1",
          ) || {};
        Storage.set("ai_usage_display_settings_v1", {
          ...currentDisplay,
          ...prefs.displaySettings,
        });
      } catch {
        /* ignore */
      }
    }

    if (prefs.appOverview) {
      try {
        Storage.set("ai_usage_app_overview_preferences_v1",
          remapPreferenceAccounts(prefs.appOverview, restoredWorkbuddyKeys));
      } catch {
        /* ignore */
      }
    }

    if (prefs.widgetWindows) {
      try {
        Storage.set(
          "ai_usage_widget_window_preferences_v1",
          remapPreferenceAccounts(prefs.widgetWindows, restoredWorkbuddyKeys),
        );
      } catch {
        /* ignore */
      }
    }

    if (prefs.dashboardWidget) {
      try {
        Storage.set(
          "ai_usage_dashboard_widget_preferences_v1",
          remapPreferenceAccounts(prefs.dashboardWidget, restoredWorkbuddyKeys),
        );
      } catch {
        /* ignore */
      }
    }
  }

  // 恢复完成后强制失效内存偏好与运行时
  invalidateDashboardWidgetPreferences();
  invalidateUsageRuntime();

  return {
    totalAccounts: payload.data.accounts?.length || 0,
    addedAccounts: added,
    updatedAccounts: updated,
  };
}
