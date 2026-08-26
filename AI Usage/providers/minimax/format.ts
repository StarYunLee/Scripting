export function formatPercent(value: number | null | undefined): string {
  if (value == null || Number.isNaN(value)) return "—";
  return `${Math.round(value)}%`;
}

export function formatFetchedAt(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  const diffMs = Date.now() - date.getTime();
  if (diffMs < 60_000) return "刚刚";
  if (diffMs < 3_600_000) return `${Math.floor(diffMs / 60_000)} 分钟前`;
  if (diffMs < 86_400_000) return `${Math.floor(diffMs / 3_600_000)} 小时前`;
  return date.toLocaleString(undefined, {
    month: "numeric",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatSmallDate(resetAtIso: string | null | undefined): string {
  if (!resetAtIso) return "—";
  const date = new Date(resetAtIso);
  if (Number.isNaN(date.getTime())) return "—";
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

export function formatResetDate(resetAtIso: string | null | undefined): string {
  if (!resetAtIso) return "—";
  const date = new Date(resetAtIso);
  if (Number.isNaN(date.getTime())) return "—";
  const month = date.getMonth() + 1;
  const day = date.getDate();
  const hour = String(date.getHours()).padStart(2, "0");
  const minute = String(date.getMinutes()).padStart(2, "0");
  return `${month}月${day}日 ${hour}:${minute}`;
}

function normalizePlanKey(value: string): string {
  return value
    .trim()
    .replace(/coding\s*plan\s*/i, "")
    .replace(/token\s*plan\s*/i, "")
    .replace(/minimax\s*/i, "")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function titleCaseWords(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/** MiniMax Coding / Token Plan 套餐档位 */
export function formatPlanLabel(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const normalized = normalizePlanKey(value);
  const labels: { [key: string]: string } = {
    free: "Free",
    starter: "Starter",
    plus: "Plus",
    pro: "Pro",
    max: "Max",
    ultra: "Ultra",
  };
  if (labels[normalized]) return labels[normalized];
  const match = value.match(/\b(Free|Starter|Plus|Pro|Max|Ultra)\b/i);
  if (match)
    return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  return titleCaseWords(value.trim());
}

/**
 * 根据 5h 窗口总额度推断档位（国际站常见值）。
 * usage_count 字段实际表示剩余量。
 */
export function inferPlanFromLimit(total: number | null, region: "intl" | "cn"): string | null {
  if (total == null || total <= 0) return null;
  if (region === "cn") {
    if (total >= 4500) return "Max";
    if (total >= 1500) return "Pro";
    if (total >= 600) return "Plus";
    return null;
  }
  if (total >= 2000 || total >= 29000) return "Ultra";
  if (total >= 1000 || total >= 15000) return "Max";
  if (total >= 300 || total >= 4500) return "Pro";
  if (total >= 100 || total >= 1500) return "Plus";
  return null;
}
