import { PROVIDER_IDS, type ProviderId } from "../models";
import { CURRENT_VERSION } from "../changelog";
import { getAppDisplaySettings } from "./settings";
import type { BackupAccountItem, BackupPayload } from "./backup-crypto";
import { retireAccountWork } from "./account-work-guard";
import { invalidateUsageRuntime } from "./runtime-consistency";
import { clearWidgetRefreshMetadata } from "./widget-refresh-metadata";
import { invalidateDashboardWidgetPreferences } from "./dashboard-widget-prefs";

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

/**
 * 增量合并还原备份 Payload
 */
export function restoreBackupPayload(payload: BackupPayload): RestoreSummary {
  let added = 0;
  let updated = 0;

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

    for (const incoming of incomingList) {
      const existingIndex = currentAccounts.findIndex(
        (a) =>
          a.id === incoming.id ||
          (incoming.email &&
            a.email &&
            a.email.toLowerCase() === incoming.email.toLowerCase()),
      );

      const now = new Date().toISOString();
      const targetId =
        existingIndex >= 0 ? currentAccounts[existingIndex].id : incoming.id;

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
      Storage.remove(
        `ai_usage_${provider}_cache_${provider === "cursor" ? "v3" : "v1"}_${targetId}`,
      );
    }

    registry.accounts = currentAccounts;
    // 默认账号恢复策略：若本地已有有效默认账号则保留；否则使用备份中记录的默认账号；最后回退至首个账号
    const localDefaultValid = currentAccounts.some(
      (a) => a.id === registry.defaultAccountId,
    );
    if (!localDefaultValid) {
      const backedDefault = payload.data.defaultAccountIds?.[provider];
      if (
        backedDefault &&
        currentAccounts.some((a) => a.id === backedDefault)
      ) {
        registry.defaultAccountId = backedDefault;
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
        Storage.set("ai_usage_app_overview_preferences_v1", prefs.appOverview);
      } catch {
        /* ignore */
      }
    }

    if (prefs.widgetWindows) {
      try {
        Storage.set(
          "ai_usage_widget_window_preferences_v1",
          prefs.widgetWindows,
        );
      } catch {
        /* ignore */
      }
    }

    if (prefs.dashboardWidget) {
      try {
        Storage.set(
          "ai_usage_dashboard_widget_preferences_v1",
          prefs.dashboardWidget,
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
