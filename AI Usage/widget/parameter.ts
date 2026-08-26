import { getAccountProvider } from "../providers/account-registry";
import { isDemoAccountId, listDemoAccounts } from "../services/demo";
import { PROVIDER_IDS, providerMeta, type ProviderId } from "../models";

export const WIDGET_DASHBOARD_PARAMETER = "dashboard";

export type WidgetAccount = {
  provider: ProviderId;
  profileId: string;
  title: string;
};

export function widgetParameter(
  provider: ProviderId,
  profileId: string,
): string {
  return `${provider}:${profileId}`;
}

export function isDashboardWidgetParameter(rawValue: unknown): boolean {
  const raw = normalizeWidgetParameter(rawValue);
  return raw.toLowerCase() === WIDGET_DASHBOARD_PARAMETER;
}

export function resolveWidgetParameter(rawValue: unknown): {
  mode: "dashboard" | "account";
  account: WidgetAccount | null;
  error: string | null;
} {
  if (isDashboardWidgetParameter(rawValue)) {
    return { mode: "dashboard", account: null, error: null };
  }
  const resolved = resolveWidgetAccount(rawValue);
  if (!resolved.account) {
    return { mode: "account", account: null, error: resolved.error };
  }
  return { mode: "account", account: resolved.account, error: null };
}

function normalizeWidgetParameter(rawValue: unknown): string {
  const raw = String(rawValue || "").trim();
  if (!raw || !raw.startsWith('"')) return raw;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return typeof parsed === "string" ? parsed.trim() : raw;
  } catch {
    return raw;
  }
}

export function resolveWidgetAccount(rawValue: unknown): {
  account: WidgetAccount | null;
  error: string | null;
} {
  const raw = normalizeWidgetParameter(rawValue);
  if (!raw) {
    const all: WidgetAccount[] = [];
    for (const provider of PROVIDER_IDS) {
      if (!providerMeta(provider).capabilities.widget) continue;
      const api = getAccountProvider(provider);
      for (const account of api.list()) {
        if (!api.token(account.id)) continue;
        all.push({
          provider,
          profileId: account.id,
          title: account.email || account.name,
        });
      }
    }
    if (all.length === 1) return { account: all[0], error: null };
    return {
      account: null,
      error:
        all.length === 0
          ? "请先在 AI Usage 中连接账号"
          : "请编辑小组件并粘贴账号参数",
    };
  }

  const separator = raw.indexOf(":");
  if (separator <= 0 || separator === raw.length - 1) {
    return { account: null, error: "组件参数格式无效" };
  }
  const provider = raw.slice(0, separator).toLowerCase() as ProviderId;
  const profileId = raw.slice(separator + 1).trim();
  if (!PROVIDER_IDS.includes(provider)) {
    return { account: null, error: "组件参数中的平台无效" };
  }
  if (!providerMeta(provider).capabilities.widget) {
    return {
      account: null,
      error: `${providerMeta(provider).title} 小组件暂未支持`,
    };
  }

  const api = getAccountProvider(provider);
  if (isDemoAccountId(profileId)) {
    const account = listDemoAccounts(provider).find(
      (item) => item.id === profileId,
    );
    return account
      ? {
          account: {
            provider,
            profileId,
            title: account.email || account.name,
          },
          error: null,
        }
      : { account: null, error: "演示账号不存在，请重新复制组件参数" };
  }
  const account = api.list().find((item) => item.id === profileId);
  if (!account)
    return { account: null, error: "该账号已删除，请重新复制组件参数" };
  if (!api.token(profileId)) {
    return { account: null, error: "该账号授权已失效，请重新授权" };
  }
  return {
    account: { provider, profileId, title: account.email || account.name },
    error: null,
  };
}
