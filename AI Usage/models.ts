import type { Color } from "scripting";

export const PROVIDER_IDS = [
  "codex",
  "grok",
  "claude",
  "antigravity",
  "cursor",
] as const;

export type ProviderId = (typeof PROVIDER_IDS)[number];

export type DisplayMode = "used" | "remaining";

export type AuthSheet = {
  provider: ProviderId;
  profileId: string;
  authorizationInput: string;
  status: string;
};

export type UsageWindowView = {
  id: string;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
};

export type UsageCard = {
  key: string;
  provider: ProviderId;
  accountId: string;
  title: string;
  planLabel: string | null;
  authorized: boolean;
  windows: UsageWindowView[];
  resetCredits: { available: number; nearestExpiration: string | null } | null;
  fetchedAt: string | null;
  source: "live" | "cache" | "error" | "empty";
  errorMessage?: string;
  refreshing: boolean;
  refreshStatus?: "success" | "failure";
};

export const PROVIDERS: Array<{
  id: ProviderId;
  title: string;
  connectTitle: string;
  subtitle: string;
  accent: Color;
  pasteHint: string;
  pastePlaceholder: string;
  capabilities: {
    widget: boolean;
  };
}> = [
  {
    id: "codex",
    title: "Codex",
    connectTitle: "连接 ChatGPT 账户",
    subtitle: "连接 ChatGPT 账户，查看用量与重置时间。",
    accent: "#10A37F",
    pasteHint:
      "授权完成后，复制地址栏中的 localhost:1455/auth/callback?... 完整地址。",
    pastePlaceholder: "localhost:1455/auth/callback?code=…&state=…",
    capabilities: { widget: true },
  },
  {
    id: "grok",
    title: "Grok",
    connectTitle: "连接 xAI 账户",
    subtitle: "连接 xAI 账户，查看每周用量与重置次数。",
    accent: "#111111",
    pasteHint:
      "授权后复制 127.0.0.1 回调地址；如果页面直接显示一次性代码，也可以只复制代码。",
    pastePlaceholder: "127.0.0.1:56122/callback?code=… 或一次性代码",
    capabilities: { widget: true },
  },
  {
    id: "claude",
    title: "Claude",
    connectTitle: "连接 Anthropic 账户",
    subtitle: "连接 Anthropic 账户，查看 5 小时与周限用量。",
    accent: "#D97757",
    pasteHint: "Anthropic 授权完成后会显示一次性授权码，通常形如 code#state。",
    pastePlaceholder: "粘贴 code#state",
    capabilities: { widget: true },
  },
  {
    id: "antigravity",
    title: "Antigravity",
    connectTitle: "连接 Google Antigravity 账户",
    subtitle: "连接 Google 账户，查看 Antigravity 的模型配额与重置时间。",
    accent: "#3B82F6",
    pasteHint:
      "完成 Google 授权后，复制 localhost:51121/oauth-callback?... 完整回调地址。",
    pastePlaceholder: "localhost:51121/oauth-callback?code=…&state=…",
    capabilities: { widget: true },
  },
  {
    id: "cursor",
    title: "Cursor",
    connectTitle: "连接 Cursor 账户",
    subtitle: "连接 Cursor 账户，查看计费周期额度与重置时间。",
    accent: "#111827",
    pasteHint:
      "在浏览器完成 Cursor 登录后返回应用，无需粘贴内容，直接点击“提交并完成授权”。",
    pastePlaceholder: "无需填写，完成浏览器登录后提交",
    capabilities: { widget: true },
  },
];

export function providerMeta(id: ProviderId) {
  return PROVIDERS.find((item) => item.id === id)!;
}
