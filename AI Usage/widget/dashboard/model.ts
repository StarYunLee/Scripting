import { Widget } from "scripting";
import { formatPercent } from "../../providers/codex/format";
import { providerMeta, type ProviderId, type UsageCard } from "../../models";
import type { WidgetPrivacyPrefs } from "../../services/dashboard-prefs";

export type WidgetLayoutSize = "small" | "medium" | "large" | "exlarge";

export type DashboardRow = {
  key: string;
  accountKey: string;
  accountId: string;
  provider: ProviderId;
  accountTitle: string;
  planLabel: string | null;
  windowLabel: string;
  usedPercent: number | null;
  remainingPercent: number | null;
};

export type AccountGroup = {
  accountKey: string;
  accountId: string;
  provider: ProviderId;
  accountTitle: string;
  planLabel: string | null;
  rows: DashboardRow[];
};

export function widgetLayoutSize(family: string): WidgetLayoutSize {
  const value = family.toLowerCase();
  if (
    value.includes("extra") ||
    value.includes("exlarge") ||
    value.includes("xlarge")
  ) {
    return "exlarge";
  }
  if (value.includes("large")) return "large";
  if (value.includes("medium")) return "medium";
  return "small";
}

export function widgetDisplaySize(family: string): { width: number; height: number } {
  try {
    const widget = Widget as {
      displaySize?: { width?: number; height?: number };
    };
    const width = widget.displaySize?.width;
    const height = widget.displaySize?.height;
    if (width && width > 40 && height && height > 40) {
      return { width, height };
    }
  } catch {
    /* ignore */
  }
  const size = widgetLayoutSize(family);
  if (size === "exlarge") return { width: 510, height: 510 };
  if (size === "large") return { width: 364, height: 382 };
  if (size === "medium") return { width: 338, height: 158 };
  return { width: 158, height: 158 };
}

export function flattenCards(cards: UsageCard[]): DashboardRow[] {
  const rows: DashboardRow[] = [];
  for (const card of cards) {
    for (const window of card.windows) {
      rows.push({
        key: `${card.key}:${window.id}`,
        accountKey: card.key,
        accountId: card.accountId,
        provider: card.provider,
        accountTitle: card.title,
        planLabel: card.planLabel,
        windowLabel: window.label,
        usedPercent: window.usedPercent,
        remainingPercent: window.remainingPercent,
      });
    }
  }
  return rows;
}

export function groupRowsByAccount(rows: DashboardRow[]): AccountGroup[] {
  const groups: AccountGroup[] = [];
  const index = new Map<string, AccountGroup>();
  for (const row of rows) {
    let group = index.get(row.accountKey);
    if (!group) {
      group = {
        accountKey: row.accountKey,
        accountId: row.accountId,
        provider: row.provider,
        accountTitle: row.accountTitle,
        planLabel: row.planLabel,
        rows: [],
      };
      index.set(row.accountKey, group);
      groups.push(group);
    }
    group.rows.push(row);
  }
  return groups;
}

export function providerShortName(provider: ProviderId): string {
  if (provider === "codex") return "ChatGPT";
  if (provider === "antigravity") return "Agy";
  return providerMeta(provider).title;
}

export function shortWindowLabel(label: string): string {
  const value = label.trim().toLowerCase();
  if (value.includes("周") || value.includes("week")) return "Weekly";
  if (value.includes("5") && (value.includes("时") || value.includes("hour")))
    return "Session";
  if (value.includes("session")) return "Session";
  if (value.includes("auto")) return "Auto";
  if (value.includes("月") || value.includes("month")) return "Monthly";
  if (value.includes("api")) return "API";
  if (value.includes("grok") && value.includes("bot")) return "Grok Bot";
  if (value.includes("total") || value.includes("总计")) return "Total";
  if (label.length <= 10) return label;
  return `${label.slice(0, 9)}…`;
}

export function shortAccountTitle(title: string): string {
  const trimmed = title.trim();
  if (trimmed.length <= 14) return trimmed;
  const at = trimmed.indexOf("@");
  if (at > 0 && at < trimmed.length - 1) {
    const local = trimmed.slice(0, at);
    const domain = trimmed.slice(at + 1);
    if (local.length > 8) return `${local.slice(0, 6)}…@${domain}`;
  }
  return `${trimmed.slice(0, 12)}…`;
}

export function ringValue(remainingPercent: number | null): number {
  if (remainingPercent == null || Number.isNaN(remainingPercent)) return 0;
  return Math.max(0, Math.min(100, remainingPercent));
}

export function ringCenterText(remainingPercent: number | null): string {
  if (remainingPercent == null || Number.isNaN(remainingPercent)) return "—";
  return String(Math.round(remainingPercent));
}

export function remainingLabel(remainingPercent: number | null): string {
  return formatPercent(remainingPercent);
}

export function privacySubtitle(
  row: Pick<DashboardRow, "accountTitle" | "accountId">,
  privacy: WidgetPrivacyPrefs,
): string | null {
  const parts: string[] = [];
  if (privacy.showAccountEmail && row.accountTitle.trim()) {
    parts.push(shortAccountTitle(row.accountTitle));
  }
  if (privacy.showAccountId && row.accountId.trim()) {
    const id = row.accountId.trim();
    parts.push(id.length > 14 ? `${id.slice(0, 10)}…` : id);
  }
  return parts.length ? parts.join(" · ") : null;
}

export function multipleAccounts(rows: DashboardRow[]): boolean {
  return new Set(rows.map((row) => row.accountKey)).size > 1;
}
