import type { UsageCard, UsageWindowView } from "../models";

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
    resetOffsetMs: number;
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
    id: "demo_codex_pro5x",
    provider: "codex",
    title: "pro5x@codex.demo",
    planLabel: "Pro 5X",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 92,
        resetOffsetMs: 48 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 67,
        resetOffsetMs: 3 * 86_400_000 + 5 * 3_600_000,
      },
    ],
    resetCredits: {
      available: 2,
      expirationOffsetsMs: [6 * 86_400_000, 6 * 86_400_000 + 1 * 86_400_000],
    },
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
    id: "demo_codex_team",
    provider: "codex",
    title: "team@codex.demo",
    planLabel: "Team",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 21,
        resetOffsetMs: 4 * 3_600_000 + 8 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 34,
        resetOffsetMs: 5 * 86_400_000 + 2 * 3_600_000,
      },
    ],
    resetCredits: {
      available: 2,
      expirationOffsetsMs: [9 * 86_400_000, 9 * 86_400_000 + 1 * 86_400_000],
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
    title: "heavy@xai.demo",
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
    id: "demo_claude_max5x",
    provider: "claude",
    title: "max5x@claude.demo",
    planLabel: "Claude Max 5×",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 71,
        resetOffsetMs: 2 * 3_600_000 + 18 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 88,
        resetOffsetMs: 2 * 86_400_000 + 8 * 3_600_000,
      },
      {
        id: "weekly_fable",
        name: "weekly_fable",
        label: "Fable 每周",
        usedPercent: 63,
        resetOffsetMs: 5 * 86_400_000 + 2 * 3_600_000,
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
    id: "demo_claude_team",
    provider: "claude",
    title: "team@claude.demo",
    planLabel: "Claude Team",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 33,
        resetOffsetMs: 4 * 3_600_000 + 22 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 48,
        resetOffsetMs: 5 * 86_400_000 + 12 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_antigravity_individual",
    provider: "antigravity",
    title: "individual@antigravity.demo",
    planLabel: "Individual",
    windows: [
      {
        id: "gemini_5h",
        name: "five_hour",
        label: "Gemini 5 小时",
        usedPercent: 32,
        resetOffsetMs: 3 * 3_600_000 + 15 * 60_000,
      },
      {
        id: "gemini_weekly",
        name: "weekly",
        label: "Gemini 每周",
        usedPercent: 55,
        resetOffsetMs: 4 * 86_400_000 + 3 * 3_600_000,
      },
      {
        id: "3p_5h",
        name: "five_hour",
        label: "Claude/GPT 5 小时",
        usedPercent: 78,
        resetOffsetMs: 2 * 3_600_000 + 20 * 60_000,
      },
      {
        id: "3p_weekly",
        name: "weekly",
        label: "Claude/GPT 每周",
        usedPercent: 91,
        resetOffsetMs: 2 * 86_400_000 + 6 * 3_600_000,
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
    title: "ultra@antigravity.demo",
    planLabel: "Google AI Ultra",
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
];

function futureIso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString();
}

function toWindows(account: DemoAccount): UsageWindowView[] {
  return account.windows.map((window) => ({
    id: `${account.id}:${window.id}`,
    label: window.label,
    usedPercent: window.usedPercent,
    remainingPercent:
      window.usedPercent == null ? null : 100 - window.usedPercent,
    resetAt: futureIso(window.resetOffsetMs),
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
