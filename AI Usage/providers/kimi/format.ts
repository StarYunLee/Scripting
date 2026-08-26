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
    .replace(/^LEVEL[_-]?/i, "")
    .replace(/^MEMBERSHIP[_-]?/i, "")
    .replace(/^PLAN[_-]?/i, "")
    .replace(/[\s_]+/g, "-")
    .toLowerCase();
}

function titleCaseWords(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * 对齐官方会员档位（Adagio / Andante / Moderato / Allegretto / Allegro / Vivace）。
 * LEVEL_* 枚举映射依据 API 实测（user.membership.level）：
 * LEVEL_FREE→Free、LEVEL_BASIC→Adagio、LEVEL_STANDARD→Moderato、
 * LEVEL_INTERMEDIATE→Allegretto、LEVEL_ADVANCED→Allegro、LEVEL_PREMIUM→Vivace。
 */
export function formatPlanLabel(value: string | null | undefined): string | null {
  if (!value || !value.trim()) return null;
  const normalized = normalizePlanKey(value);
  const labels: Record<string, string> = {
    // 官方档位名（API 直接返回营销名时原样对齐）
    adagio: "Adagio",
    andante: "Andante",
    moderato: "Moderato",
    allegretto: "Allegretto",
    allegro: "Allegro",
    vivace: "Vivace",
    // LEVEL_* 枚举（实测映射）
    free: "Free",
    basic: "Adagio",
    standard: "Moderato",
    intermediate: "Allegretto",
    advanced: "Allegro",
    premium: "Vivace",
    enterprise: "Enterprise",
  };
  if (labels[normalized]) return labels[normalized];
  return titleCaseWords(value.trim().replace(/^LEVEL[_-]?/i, ""));
}
