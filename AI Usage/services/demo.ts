import type { UsageBalanceView, UsageCard, UsageWindowView } from "../models";

const DEMO_KEY = "ai_usage_demo_mode_v1";

type DemoAccount = {
  id: string;
  provider: UsageCard["provider"];
  title: string;
  planLabel: string;
  windows: Array<{
    id: string;
    name: string;
    label: string;
    usedPercent: number | null;
    resetOffsetMs: number | null;
    kind?: UsageWindowView["kind"];
    detail?: string | null;
    balance?: UsageBalanceView;
  }>;
  resetCredits: {
    available: number;
    expirationOffsetsMs: number[];
  } | null;
};

const DEMO_ACCOUNTS: DemoAccount[] = [
  {
    id: "demo_codex_plus",
    provider: "codex",
    title: "plus@codex.demo",
    planLabel: "Plus",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 36,
        resetOffsetMs: 3 * 3_600_000 + 12 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 58,
        resetOffsetMs: 3 * 86_400_000 + 6 * 3_600_000,
      },
    ],
    resetCredits: { available: 1, expirationOffsetsMs: [6 * 86_400_000] },
  },
  {
    id: "demo_codex_pro20x",
    provider: "codex",
    title: "pro20x@codex.demo",
    planLabel: "Pro 20x",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 68,
        resetOffsetMs: 2 * 3_600_000 + 26 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 43,
        resetOffsetMs: 4 * 86_400_000 + 9 * 3_600_000,
      },
    ],
    resetCredits: {
      available: 3,
      expirationOffsetsMs: [
        5 * 86_400_000,
        5 * 86_400_000 + 1 * 86_400_000,
        5 * 86_400_000 + 2 * 86_400_000,
      ],
    },
  },
  {
    id: "demo_grok_supergrok",
    provider: "grok",
    title: "supergrok@xai.demo",
    planLabel: "SuperGrok",
    windows: [
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 60,
        resetOffsetMs: 2 * 86_400_000 + 4 * 3_600_000,
      },
    ],
    resetCredits: { available: 1, expirationOffsetsMs: [11 * 86_400_000] },
  },
  {
    id: "demo_grok_heavy",
    provider: "grok",
    title: "supergrokheavy@xai.demo",
    planLabel: "SuperGrok Heavy",
    windows: [
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 28,
        resetOffsetMs: 5 * 86_400_000 + 10 * 3_600_000,
      },
    ],
    resetCredits: {
      available: 4,
      expirationOffsetsMs: [
        8 * 86_400_000,
        8 * 86_400_000 + 1 * 86_400_000,
        8 * 86_400_000 + 2 * 86_400_000,
        8 * 86_400_000 + 3 * 86_400_000,
      ],
    },
  },
  {
    id: "demo_claude_pro",
    provider: "claude",
    title: "pro@claude.demo",
    planLabel: "Claude Pro",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 52,
        resetOffsetMs: 1 * 3_600_000 + 40 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 41,
        resetOffsetMs: 4 * 86_400_000 + 7 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_claude_max20x",
    provider: "claude",
    title: "max20x@claude.demo",
    planLabel: "Claude Max 20×",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 19,
        resetOffsetMs: 3 * 3_600_000 + 5 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 27,
        resetOffsetMs: 6 * 86_400_000 + 3 * 3_600_000,
      },
      {
        id: "weekly_fable",
        name: "weekly_fable",
        label: "Fable 每周",
        usedPercent: 12,
        resetOffsetMs: 6 * 86_400_000 + 3 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_antigravity_pro",
    provider: "antigravity",
    title: "pro@antigravity.demo",
    planLabel: "Google AI Pro",
    windows: [
      {
        id: "gemini_5h",
        name: "five_hour",
        label: "Gemini 5 小时",
        usedPercent: 18,
        resetOffsetMs: 4 * 3_600_000 + 8 * 60_000,
      },
      {
        id: "gemini_weekly",
        name: "weekly",
        label: "Gemini 每周",
        usedPercent: 72,
        resetOffsetMs: 5 * 86_400_000 + 4 * 3_600_000,
      },
      {
        id: "3p_5h",
        name: "five_hour",
        label: "Claude/GPT 5 小时",
        usedPercent: 44,
        resetOffsetMs: 3 * 3_600_000 + 35 * 60_000,
      },
      {
        id: "3p_weekly",
        name: "weekly",
        label: "Claude/GPT 每周",
        usedPercent: 83,
        resetOffsetMs: 3 * 86_400_000 + 9 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_antigravity_ultra",
    provider: "antigravity",
    title: "ultra20x@antigravity.demo",
    planLabel: "Google AI Ultra 20x",
    windows: [
      {
        id: "gemini_5h",
        name: "five_hour",
        label: "Gemini 5 小时",
        usedPercent: 8,
        resetOffsetMs: 4 * 3_600_000 + 44 * 60_000,
      },
      {
        id: "gemini_weekly",
        name: "weekly",
        label: "Gemini 每周",
        usedPercent: 26,
        resetOffsetMs: 6 * 86_400_000 + 2 * 3_600_000,
      },
      {
        id: "3p_5h",
        name: "five_hour",
        label: "Claude/GPT 5 小时",
        usedPercent: 64,
        resetOffsetMs: 1 * 3_600_000 + 52 * 60_000,
      },
      {
        id: "3p_weekly",
        name: "weekly",
        label: "Claude/GPT 每周",
        usedPercent: 39,
        resetOffsetMs: 5 * 86_400_000 + 7 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_antigravity_ultra5x",
    provider: "antigravity",
    title: "ultra5x@antigravity.demo",
    planLabel: "Google AI Ultra 5x",
    windows: [
      {
        id: "gemini_5h",
        name: "five_hour",
        label: "Gemini 5 小时",
        usedPercent: 13,
        resetOffsetMs: 3 * 3_600_000 + 26 * 60_000,
      },
      {
        id: "gemini_weekly",
        name: "weekly",
        label: "Gemini 每周",
        usedPercent: 34,
        resetOffsetMs: 5 * 86_400_000 + 12 * 3_600_000,
      },
      {
        id: "3p_5h",
        name: "five_hour",
        label: "Claude/GPT 5 小时",
        usedPercent: 57,
        resetOffsetMs: 2 * 3_600_000 + 14 * 60_000,
      },
      {
        id: "3p_weekly",
        name: "weekly",
        label: "Claude/GPT 每周",
        usedPercent: 48,
        resetOffsetMs: 4 * 86_400_000 + 16 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_antigravity_free",
    provider: "antigravity",
    title: "free@antigravity.demo",
    planLabel: "Free",
    windows: [
      {
        id: "gemini_weekly",
        name: "weekly",
        label: "Gemini 每周",
        usedPercent: 91,
        resetOffsetMs: 2 * 86_400_000 + 5 * 3_600_000,
      },
      {
        id: "3p_weekly",
        name: "weekly",
        label: "Claude/GPT 每周",
        usedPercent: 76,
        resetOffsetMs: 1 * 86_400_000 + 19 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_antigravity_plus",
    provider: "antigravity",
    title: "plus@antigravity.demo",
    planLabel: "Google AI Plus",
    windows: [
      {
        id: "gemini_weekly",
        name: "weekly",
        label: "Gemini 每周",
        usedPercent: 63,
        resetOffsetMs: 3 * 86_400_000 + 2 * 3_600_000,
      },
      {
        id: "3p_weekly",
        name: "weekly",
        label: "Claude/GPT 每周",
        usedPercent: 88,
        resetOffsetMs: 5 * 86_400_000 + 21 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_cursor_layout",
    provider: "cursor",
    title: "pro@cursor.demo",
    planLabel: "Pro",
    windows: [
      {
        id: "auto",
        name: "auto",
        label: "Auto",
        usedPercent: 41,
        resetOffsetMs: 1 * 3_600_000 + 26 * 60_000,
      },
      {
        id: "total",
        name: "total",
        label: "Total",
        usedPercent: 57,
        resetOffsetMs: 4 * 86_400_000 + 2 * 3_600_000,
      },
      {
        id: "api",
        name: "api",
        label: "API",
        usedPercent: 73,
        resetOffsetMs: 4 * 86_400_000 + 2 * 3_600_000,
      },
      {
        id: "requests",
        name: "weekly",
        label: "每周",
        usedPercent: 24,
        resetOffsetMs: 5 * 86_400_000 + 6 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_kimi_layout",
    provider: "kimi",
    title: "allegro@kimi.demo",
    planLabel: "Allegro",
    windows: [
      {
        id: "rolling_18000",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 48,
        resetOffsetMs: 2 * 3_600_000 + 9 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 66,
        resetOffsetMs: 3 * 86_400_000 + 11 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_copilot_layout",
    provider: "copilot",
    title: "pro-plus@copilot.demo",
    planLabel: "Pro+",
    windows: [
      {
        id: "credits",
        name: "credits",
        label: "高级请求",
        usedPercent: 35,
        resetOffsetMs: 12 * 86_400_000,
      },
      {
        id: "chat",
        name: "chat",
        label: "聊天消息",
        usedPercent: 51,
        resetOffsetMs: 25 * 3_600_000,
      },
      {
        id: "completions",
        name: "completions",
        label: "代码补全",
        usedPercent: 69,
        resetOffsetMs: 25 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_zai_pro_plus",
    provider: "zai",
    title: "pro-plus@z.ai.demo",
    planLabel: "Pro+",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 28,
        resetOffsetMs: 2 * 3_600_000 + 40 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 46,
        resetOffsetMs: 3 * 86_400_000 + 8 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_minimax_pro",
    provider: "minimax",
    title: "pro@minimax.demo",
    planLabel: "Pro · 国际站",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 37,
        resetOffsetMs: 2 * 3_600_000 + 18 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 62,
        resetOffsetMs: 4 * 86_400_000 + 7 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_workbuddy_pro",
    provider: "workbuddy",
    title: "demo@workbuddy.demo",
    planLabel: "国内版",
    windows: [
      {
        id: "workbuddy:credits",
        name: "credits",
        label: "套餐积分",
        usedPercent: 25,
        resetOffsetMs: 8 * 86_400_000 + 12 * 3_600_000,
        kind: "quota",
        detail: "2500 / 10000 积分",
      },
      {
        id: "workbuddy:checkin",
        name: "checkin",
        label: "今日签到",
        usedPercent: null,
        resetOffsetMs: 12 * 3_600_000,
        kind: "status",
        detail: "已签 +100 积分 · 连续 4 天",
      },
      {
        id: "workbuddy:prepaid",
        name: "prepaid",
        label: "预付费积分",
        usedPercent: null,
        resetOffsetMs: 20 * 86_400_000,
        kind: "balance",
        detail: "余额 750 积分",
      },
      {
        id: "workbuddy:expiring",
        name: "expiring",
        label: "即将到期",
        usedPercent: null,
        resetOffsetMs: 5 * 86_400_000,
        kind: "notice",
        detail: "232.4 积分 · 10-13 到期",
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_deepseek_balance",
    provider: "deepseek",
    title: "api@deepseek.demo",
    planLabel: "API",
    windows: [
      {
        // 余额窗口：无百分比、无重置时间，金额由 balance 结构化承载。
        id: "deepseek:balance:CNY",
        name: "balance",
        label: "账户余额",
        usedPercent: null,
        resetOffsetMs: null,
        kind: "balance",
        balance: {
          currency: "CNY",
          total: "128.50",
          paid: "100.00",
          granted: "28.50",
          isAvailable: true,
        },
      },
      {
        id: "deepseek:balance:USD",
        name: "balance",
        label: "账户余额",
        usedPercent: null,
        resetOffsetMs: null,
        kind: "balance",
        balance: {
          currency: "USD",
          total: "16.80",
          paid: "12.00",
          granted: "4.80",
          isAvailable: true,
        },
      },
    ],
    resetCredits: null,
  },
];

function futureIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function toWindows(account: DemoAccount): UsageWindowView[] {
  return account.windows.map((window) => ({
    id: window.id.includes(":") ? window.id : `${account.id}:${window.id}`,
    label: window.label,
    usedPercent: window.usedPercent,
    remainingPercent:
      window.usedPercent == null ? null : 100 - window.usedPercent,
    resetAt:
      window.resetOffsetMs == null ? null : futureIso(window.resetOffsetMs),
    ...(window.kind ? { kind: window.kind } : {}),
    ...(window.detail ? { detail: window.detail } : {}),
    ...(window.balance ? { balance: window.balance } : {}),
  }));
}

export type DemoAccountView = {
  id: string;
  provider: UsageCard["provider"];
  name: string;
  email: string;
  planLabel: string;
};

export function listDemoAccounts(
  provider?: UsageCard["provider"],
): DemoAccountView[] {
  return DEMO_ACCOUNTS.filter(
    (account) => !provider || account.provider === provider,
  ).map((account) => ({
    id: account.id,
    provider: account.provider,
    name: account.planLabel,
    email: account.title,
    planLabel: account.planLabel,
  }));
}

export function demoAccountCount(): number {
  return DEMO_ACCOUNTS.length;
}

export function isDemoMode(): boolean {
  try {
    const value = Storage.get<boolean>(DEMO_KEY);
    return value == null ? true : value === true;
  } catch {
    return true;
  }
}

export function setDemoMode(enabled: boolean): boolean {
  try {
    return Storage.set(DEMO_KEY, enabled);
  } catch {
    return false;
  }
}

export function isDemoAccountId(accountId?: string | null): boolean {
  return Boolean(accountId && accountId.startsWith("demo_"));
}

export function listDemoCards(): UsageCard[] {
  return DEMO_ACCOUNTS.map((account) => ({
    key: `${account.provider}:${account.id}`,
    provider: account.provider,
    accountId: account.id,
    title: account.title,
    planLabel: account.planLabel,
    authorized: true,
    windows: toWindows(account),
    resetCredits: account.resetCredits
      ? {
          available: account.resetCredits.available,
          nearestExpiration: futureIso(
            account.resetCredits.expirationOffsetsMs[0],
          ),
          expirations: account.resetCredits.expirationOffsetsMs.map(futureIso),
        }
      : null,
    fetchedAt: new Date().toISOString(),
    source: "live",
    refreshing: false,
  }));
}

export function refreshDemoCard(accountId: string): UsageCard {
  const card = listDemoCards().find((item) => item.accountId === accountId);
  if (!card) throw new Error("演示账号不存在");
  return card;
}
