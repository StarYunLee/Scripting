import type { UsageCard, UsageWindowView } from "../models";
import type {
  LimitWindow as CodexLimitWindow,
  LimitWindowName as CodexLimitWindowName,
  UsageResult as CodexUsageResult,
} from "../providers/codex/types";
import type {
  LimitWindow as GrokLimitWindow,
  LimitWindowName as GrokLimitWindowName,
  UsageResult as GrokUsageResult,
} from "../providers/grok/types";
import type {
  LimitWindow as ClaudeLimitWindow,
  LimitWindowName as ClaudeLimitWindowName,
  UsageResult as ClaudeUsageResult,
} from "../providers/claude/types";

import type {
  LimitWindow as AntigravityLimitWindow,
  UsageResult as AntigravityUsageResult,
} from "../providers/antigravity/types";
import type {
  LimitWindow as CursorLimitWindow,
  UsageResult as CursorUsageResult,
} from "../providers/cursor/types";
import type {
  LimitWindow as KimiLimitWindow,
  LimitWindowName as KimiLimitWindowName,
  UsageResult as KimiUsageResult,
} from "../providers/kimi/types";

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
  resetCredits: { available: number; nearestOffsetMs: number } | null;
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
    resetCredits: { available: 1, nearestOffsetMs: 6 * 86_400_000 },
  },
  {
    id: "demo_codex_pro",
    provider: "codex",
    title: "pro@codex.demo",
    planLabel: "Pro",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 74,
        resetOffsetMs: 2 * 3_600_000 + 5 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 86,
        resetOffsetMs: 2 * 86_400_000 + 11 * 3_600_000,
      },
    ],
    resetCredits: { available: 2, nearestOffsetMs: 7 * 86_400_000 },
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
    resetCredits: { available: 2, nearestOffsetMs: 6 * 86_400_000 },
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
    resetCredits: { available: 3, nearestOffsetMs: 5 * 86_400_000 },
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
      {
        id: "monthly",
        name: "monthly",
        label: "每月",
        usedPercent: 47,
        resetOffsetMs: 18 * 86_400_000,
      },
    ],
    resetCredits: { available: 2, nearestOffsetMs: 9 * 86_400_000 },
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
    resetCredits: { available: 1, nearestOffsetMs: 11 * 86_400_000 },
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
    resetCredits: { available: 4, nearestOffsetMs: 8 * 86_400_000 },
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
        label: "Gemini Model 5 小时",
        usedPercent: 32,
        resetOffsetMs: 3 * 3_600_000 + 15 * 60_000,
      },
      {
        id: "gemini_weekly",
        name: "weekly",
        label: "Gemini Model 每周",
        usedPercent: 55,
        resetOffsetMs: 4 * 86_400_000 + 3 * 3_600_000,
      },
      {
        id: "3p_5h",
        name: "five_hour",
        label: "Claude and GPT 5 小时",
        usedPercent: 78,
        resetOffsetMs: 2 * 3_600_000 + 20 * 60_000,
      },
      {
        id: "3p_weekly",
        name: "weekly",
        label: "Claude and GPT 每周",
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
        label: "Gemini Model 5 小时",
        usedPercent: 18,
        resetOffsetMs: 4 * 3_600_000 + 8 * 60_000,
      },
      {
        id: "gemini_weekly",
        name: "weekly",
        label: "Gemini Model 每周",
        usedPercent: 72,
        resetOffsetMs: 5 * 86_400_000 + 4 * 3_600_000,
      },
      {
        id: "3p_5h",
        name: "five_hour",
        label: "Claude and GPT 5 小时",
        usedPercent: 44,
        resetOffsetMs: 3 * 3_600_000 + 35 * 60_000,
      },
      {
        id: "3p_weekly",
        name: "weekly",
        label: "Claude and GPT 每周",
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
        label: "Gemini Model 5 小时",
        usedPercent: 8,
        resetOffsetMs: 4 * 3_600_000 + 44 * 60_000,
      },
      {
        id: "gemini_weekly",
        name: "weekly",
        label: "Gemini Model 每周",
        usedPercent: 26,
        resetOffsetMs: 6 * 86_400_000 + 2 * 3_600_000,
      },
      {
        id: "3p_5h",
        name: "five_hour",
        label: "Claude and GPT 5 小时",
        usedPercent: 64,
        resetOffsetMs: 1 * 3_600_000 + 52 * 60_000,
      },
      {
        id: "3p_weekly",
        name: "weekly",
        label: "Claude and GPT 每周",
        usedPercent: 39,
        resetOffsetMs: 5 * 86_400_000 + 7 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_cursor_pro",
    provider: "cursor",
    title: "pro@cursor.demo",
    planLabel: "Pro",
    windows: [
      {
        id: "auto",
        name: "auto",
        label: "Auto",
        usedPercent: 28,
        resetOffsetMs: 12 * 86_400_000 + 4 * 3_600_000,
      },
      {
        id: "total",
        name: "total",
        label: "总计",
        usedPercent: 42,
        resetOffsetMs: 12 * 86_400_000 + 4 * 3_600_000,
      },
      {
        id: "api",
        name: "api",
        label: "第三方 API",
        usedPercent: 61,
        resetOffsetMs: 12 * 86_400_000 + 4 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_cursor_ultra",
    provider: "cursor",
    title: "ultra@cursor.demo",
    planLabel: "Ultra",
    windows: [
      {
        id: "auto",
        name: "auto",
        label: "Auto",
        usedPercent: 12,
        resetOffsetMs: 18 * 86_400_000 + 2 * 3_600_000,
      },
      {
        id: "total",
        name: "total",
        label: "总计",
        usedPercent: 18,
        resetOffsetMs: 18 * 86_400_000 + 2 * 3_600_000,
      },
      {
        id: "api",
        name: "api",
        label: "第三方 API",
        usedPercent: 33,
        resetOffsetMs: 18 * 86_400_000 + 2 * 3_600_000,
      },
      {
        id: "grok_bot",
        name: "grok_bot",
        label: "Grok Bot",
        usedPercent: 27,
        resetOffsetMs: 4 * 86_400_000 + 8 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_kimi_moderato",
    provider: "kimi",
    title: "moderato@kimi.demo",
    planLabel: "Moderato",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 41,
        resetOffsetMs: 2 * 3_600_000 + 18 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 55,
        resetOffsetMs: 4 * 86_400_000 + 9 * 3_600_000,
      },
    ],
    resetCredits: null,
  },
  {
    id: "demo_kimi_allegro",
    provider: "kimi",
    title: "allegro@kimi.demo",
    planLabel: "Allegro",
    windows: [
      {
        id: "five_hour",
        name: "five_hour",
        label: "5 小时",
        usedPercent: 22,
        resetOffsetMs: 3 * 3_600_000 + 40 * 60_000,
      },
      {
        id: "weekly",
        name: "weekly",
        label: "每周",
        usedPercent: 31,
        resetOffsetMs: 5 * 86_400_000 + 11 * 3_600_000,
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
  }));
}

export function getDemoWidgetResult(
  provider: "codex",
  accountId: string,
): CodexUsageResult | null;
export function getDemoWidgetResult(
  provider: "grok",
  accountId: string,
): GrokUsageResult | null;
export function getDemoWidgetResult(
  provider: "claude",
  accountId: string,
): ClaudeUsageResult | null;
export function getDemoWidgetResult(
  provider: "antigravity",
  accountId: string,
): AntigravityUsageResult | null;
export function getDemoWidgetResult(
  provider: "cursor",
  accountId: string,
): CursorUsageResult | null;
export function getDemoWidgetResult(
  provider: "kimi",
  accountId: string,
): KimiUsageResult | null;
export function getDemoWidgetResult(
  provider: UsageCard["provider"],
  accountId: string,
):
  | CodexUsageResult
  | GrokUsageResult
  | ClaudeUsageResult
  | AntigravityUsageResult
  | CursorUsageResult
  | KimiUsageResult
  | null {
  const account = DEMO_ACCOUNTS.find(
    (item) => item.provider === provider && item.id === accountId,
  );
  if (!account) return null;
  const fetchedAt = new Date().toISOString();
  const windowBase = (window: DemoAccount["windows"][number]) => {
    const usedPercent = window.usedPercent;
    const resetAt = futureIso(window.resetOffsetMs);
    return {
      id: `${account.id}:${window.id}`,
      label: window.label,
      usedPercent,
      remainingPercent: usedPercent == null ? null : 100 - usedPercent,
      resetAt,
      resetAtMs: new Date(resetAt).getTime(),
      windowSeconds: null,
    };
  };

  if (provider === "codex") {
    const windows: CodexLimitWindow[] = account.windows.map((window) => ({
      ...windowBase(window),
      name: window.name as CodexLimitWindowName,
    }));
    const byName = (name: CodexLimitWindowName) =>
      windows.find((window) => window.name === name) || null;
    return {
      ok: true,
      snapshot: {
        windows,
        fiveHour: byName("five_hour"),
        weekly: byName("weekly"),
        monthly: byName("monthly"),
        planType: account.planLabel,
        planLabel: account.planLabel,
        resetCreditsAvailable: account.resetCredits?.available ?? null,
        resetCreditExpirations: account.resetCredits
          ? [futureIso(account.resetCredits.nearestOffsetMs)]
          : [],
        fetchedAt,
        source: "live",
      },
    };
  }

  if (provider === "grok") {
    const windows: GrokLimitWindow[] = account.windows.map((window) => ({
      ...windowBase(window),
      name: window.name as GrokLimitWindowName,
    }));
    const byName = (name: GrokLimitWindowName) =>
      windows.find((window) => window.name === name) || null;
    return {
      ok: true,
      snapshot: {
        windows,
        fiveHour: byName("five_hour"),
        weekly: byName("weekly"),
        monthly: byName("monthly"),
        planType: account.planLabel,
        planLabel: account.planLabel,
        resetCreditsAvailable: account.resetCredits?.available ?? null,
        resetCreditExpirations: account.resetCredits
          ? [futureIso(account.resetCredits.nearestOffsetMs)]
          : [],
        fetchedAt,
        source: "live",
      },
    };
  }

  if (provider === "antigravity") {
    const windows: AntigravityLimitWindow[] = account.windows.map((window) => ({
      ...windowBase(window),
      name:
        window.name === "five_hour"
          ? "five_hour"
          : window.name === "weekly"
            ? "weekly"
            : "unknown",
      source: "quota_summary",
    }));
    return {
      ok: true,
      snapshot: {
        windows,
        planType: account.planLabel,
        planLabel: account.planLabel,
        projectId: "demo-antigravity-project",
        fetchedAt,
        source: "live",
      },
    };
  }

  if (provider === "cursor") {
    const windows: CursorLimitWindow[] = account.windows.map((window) => ({
      ...windowBase(window),
      name:
        window.name === "auto" ||
        window.name === "total" ||
        window.name === "api" ||
        window.name === "grok_bot" ||
        window.name === "plan" ||
        window.name === "weekly"
          ? window.name
          : "unknown",
    }));
    const byName = (name: CursorLimitWindow["name"]) =>
      windows.find((window) => window.name === name) || null;
    return {
      ok: true,
      snapshot: {
        windows,
        auto: byName("auto"),
        total: byName("total"),
        api: byName("api"),
        grokBot: byName("grok_bot"),
        plan: byName("plan"),
        weekly: byName("weekly"),
        planType: account.planLabel,
        planLabel: account.planLabel,
        fetchedAt,
        source: "live",
      },
    };
  }

  if (provider === "kimi") {
    const windows: KimiLimitWindow[] = account.windows.map((window) => ({
      ...windowBase(window),
      name: window.name as KimiLimitWindowName,
    }));
    const byName = (name: KimiLimitWindowName) =>
      windows.find((window) => window.name === name) || null;
    return {
      ok: true,
      snapshot: {
        windows,
        fiveHour: byName("five_hour"),
        weekly: byName("weekly"),
        planType: account.planLabel,
        planLabel: account.planLabel,
        fetchedAt,
        source: "live",
      },
    };
  }

  const windows: ClaudeLimitWindow[] = account.windows.map((window) => ({
    ...windowBase(window),
    name: window.name as ClaudeLimitWindowName,
  }));
  const byName = (name: ClaudeLimitWindowName) =>
    windows.find((window) => window.name === name) || null;
  return {
    ok: true,
    snapshot: {
      windows,
      fiveHour: byName("five_hour"),
      weekly: byName("weekly"),
      weeklyFable: byName("weekly_fable"),
      planType: account.planLabel,
      planLabel: account.planLabel,
      fetchedAt,
      source: "live",
    },
  };
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
    Storage.set(DEMO_KEY, enabled);
  } catch {
    /* ignore */
  }
  return enabled;
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
          nearestExpiration: futureIso(account.resetCredits.nearestOffsetMs),
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
