import { PERIOD, widgetWindowLabel } from "../../copy/labels";
import { resetCreditsSummary as codexResetCreditsSummary } from "../../providers/codex/format";
import { resetCreditsSummary as grokResetCreditsSummary } from "../../providers/grok/format";
import type { WidgetWindow } from "./window-model";

/** 规范化单账号小组件窗口输入：9 家 snapshot.windows 的公共形状。 */
export type ProviderWindowInput = {
  id: string;
  name?: string;
  label: string;
  usedPercent: number | null;
  remainingPercent: number | null;
  resetAt: string | null;
};

export type ProviderSnapshotInput = {
  windows: ProviderWindowInput[];
  planLabel: string | null;
  planType: string | null;
  fetchedAt: string;
  resetCreditsAvailable?: number | null;
  resetCreditExpirations?: string[];
};

export type ProviderResetLine = {
  available: number | null;
  nearestExpiration: string | null;
};

const MONTHLY = PERIOD.MONTHLY.widget;

function trimmed(label: string | undefined | null): string {
  return (label || "").trim();
}

function windowTitle(
  provider: ProviderIdLike,
  input: ProviderWindowInput,
  rawId: string,
): string {
  // 缺 name 的历史缓存用去前缀后的 rawId 归一化，保证比较不因 id 形态漂移失效。
  const name = input.name || rawId;
  const label = trimmed(input.label);

  // Antigravity 的双组靠窗口 id 区分；只缩周期，产品组名必须保真。
  if (provider === "antigravity") {
    const id = rawId.toLowerCase();
    if (id.includes("gemini_5h")) return `Gemini ${PERIOD.FIVE_HOUR.widget}`;
    if (id.includes("gemini_weekly")) return `Gemini ${PERIOD.WEEKLY.widget}`;
    if (id.includes("3p_5h")) return `Claude/GPT ${PERIOD.FIVE_HOUR.widget}`;
    if (id.includes("3p_weekly")) return `Claude/GPT ${PERIOD.WEEKLY.widget}`;
  }

  // ChatGPT 的附加额度（例如 Spark）可与通用 weekly 同周期；限定词不可丢。
  if (provider === "codex" && /spark/i.test(`${rawId} ${label}`)) {
    const lower = label.toLowerCase();
    if (name === "weekly" || /周|week|7\s*d/.test(lower)) {
      return `Spark ${PERIOD.WEEKLY.widget}`;
    }
    if (
      name === "five_hour" ||
      (lower.includes("5") && /时|hour|5\s*h/.test(lower))
    ) {
      return `Spark ${PERIOD.FIVE_HOUR.widget}`;
    }
    return label;
  }

  if (name === "five_hour") return PERIOD.FIVE_HOUR.widget;
  if (name === "weekly") return PERIOD.WEEKLY.widget;
  if (name === "monthly") return MONTHLY;

  if (provider === "cursor") {
    if (name === "auto") return PERIOD.AUTO.widget;
    if (name === "total") return PERIOD.TOTAL.widget;
    if (name === "api") return PERIOD.API.widget;
    if (name === "grok_bot") return PERIOD.GROK_BOT.widget;
    // 解析器给周窗口的 id 是 requests，name 缺失时靠 rawId 命中。
    if (name === "weekly" || name === "requests") {
      return PERIOD.WEEKLY.widget;
    }
    return label;
  }

  if (provider === "claude" && name === "weekly_fable") {
    return `Fable ${PERIOD.WEEKLY.widget}`;
  }

  if (provider === "copilot" && name === "credits") {
    return PERIOD.QUOTA.widget;
  }

  // 无 name 的历史缓存：退回标签规范化，保持 5H/7D 单行标题。
  return widgetWindowLabel(label) || label;
}

type ProviderIdLike =
  | "codex"
  | "grok"
  | "claude"
  | "antigravity"
  | "cursor"
  | "kimi"
  | "copilot"
  | "zai"
  | "minimax";

/**
 * 把任一 provider 的 snapshot.windows 规范为通用小组件行：
 * id 加 provider 前缀避免跨账号/跨平台冲突，标题压成单行 5H/7D 等短标签。
 */
export function providerWidgetWindowRows(
  provider: ProviderIdLike,
  snapshot: ProviderSnapshotInput | null,
): WidgetWindow[] {
  if (!snapshot) return [];
  return snapshot.windows.map((input) => {
    // Cursor 解析器自带 `cursor:` 前缀，避免生成 cursor:cursor:auto 这类重复 id。
    const rawId = input.id.startsWith(`${provider}:`)
      ? input.id.slice(provider.length + 1)
      : input.id;
    return {
      id: `${provider}:${rawId}`,
      label: windowTitle(provider, input, rawId),
      usedPercent: input.usedPercent,
      remainingPercent: input.remainingPercent,
      resetAt: input.resetAt,
    };
  });
}

/** Codex / Grok 的重置权益行；其余 provider 没有 resetCredits 概念。 */
export function providerResetLine(
  provider: ProviderIdLike,
  snapshot: ProviderSnapshotInput | null,
): ProviderResetLine | null {
  if (!snapshot) return null;
  if (provider !== "codex" && provider !== "grok") return null;
  const summary =
    provider === "codex"
      ? codexResetCreditsSummary(
          snapshot.resetCreditsAvailable,
          snapshot.resetCreditExpirations,
        )
      : grokResetCreditsSummary(
          snapshot.resetCreditsAvailable,
          snapshot.resetCreditExpirations,
        );
  if (summary.available == null) return null;
  return summary;
}

/** 账号设置页候选：直接来自最新缓存 snapshot，无缓存时诚实返回空。 */
export function widgetWindowCandidates(
  provider: ProviderIdLike,
  snapshot: ProviderSnapshotInput | null,
): WidgetWindow[] {
  return providerWidgetWindowRows(provider, snapshot);
}
