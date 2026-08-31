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

const REGION_SUFFIX_RE = /\s*[·•]\s*(国内站|国际站)/gi;

/** 清除所有「· 国内站/国际站」后缀（含重复叠加）。 */
export function stripRegionSuffixes(value: string): string {
  return value.replace(REGION_SUFFIX_RE, "").trim();
}

function normalizePlanKey(value: string): string {
  return stripRegionSuffixes(value)
    .replace(/coding\s*plan\s*/i, "")
    .replace(/token\s*plan\s*/i, "")
    .replace(/code\s*plan\s*/i, "")
    .replace(/minimax\s*/i, "")
    .replace(/high\s*speed/i, "")
    .replace(/[\s_]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase();
}

function titleCaseWords(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * 将缓存中可能已污染的展示标签还原为原始档位。
 * 只返回适合再次喂入 formatPlanLabel 的 raw 值。
 */
export function sanitizeCachedPlanType(
  value: string | null | undefined,
): string | null {
  if (!value || !value.trim()) return null;
  const stripped = stripRegionSuffixes(value);
  if (!stripped) return null;
  // 已是纯区域名，不是档位
  if (/^(国内站|国际站)$/i.test(stripped)) return null;
  return formatPlanLabel(stripped) || stripped;
}

/** MiniMax Coding / Token Plan 套餐档位 */
export function formatPlanLabel(
  value: string | null | undefined,
): string | null {
  if (!value || !value.trim()) return null;
  const cleaned = stripRegionSuffixes(value);
  if (!cleaned || /^(国内站|国际站)$/i.test(cleaned)) return null;
  const normalized = normalizePlanKey(cleaned);
  const labels: { [key: string]: string } = {
    free: "Free",
    starter: "Starter",
    plus: "Plus",
    pro: "Pro",
    max: "Max",
    ultra: "Ultra",
    trial: "Trial",
    "new-ultra": "Ultra",
    "token-plan-credit": "Credit",
    "token-plan-credit-team": "Credit Team",
  };
  if (labels[normalized]) return labels[normalized];
  const match = cleaned.match(/\b(Free|Starter|Plus|Pro|Max|Ultra|Trial)\b/i);
  if (match)
    return match[1].charAt(0).toUpperCase() + match[1].slice(1).toLowerCase();
  return titleCaseWords(cleaned);
}

/** 控制台 combo / package 枚举 → 展示档位 */
export function planTypeFromComboId(
  value: number | string | null | undefined,
): string | null {
  if (value == null || value === "") return null;
  const id = typeof value === "number" ? value : Number(String(value).trim());
  if (!Number.isFinite(id)) return null;
  const map: { [key: number]: string } = {
    0: "Free",
    2: "Starter",
    3: "Standard",
    24: "Starter",
    25: "Plus",
    26: "Max",
    28: "Trial",
    101001: "Starter",
    101002: "Plus",
    101003: "Max",
    101004: "Ultra",
    101005: "Ultra",
  };
  return map[id] || null;
}

export function regionDisplayName(
  region: "intl" | "cn" | null | undefined,
): string {
  return region === "cn" ? "国内站" : "国际站";
}

/** 由 raw planType 生成一次性展示标签，绝不再吃回已带后缀的标签。 */
export function buildPlanDisplayLabel(
  planType: string | null | undefined,
  region: "intl" | "cn",
): string {
  const formatted = formatPlanLabel(planType);
  const regionLabel = regionDisplayName(region);
  return formatted ? `${formatted} · ${regionLabel}` : regionLabel;
}

/**
 * 根据 5h 窗口总额度推断档位。
 * 注意：usage_count 的含义由 usage-parser 按区域解释；本函数只读取总额度。
 */
export function inferPlanFromLimit(
  total: number | null,
  region: "intl" | "cn",
): string | null {
  if (total == null || total <= 0) return null;
  if (region === "cn") {
    if (total >= 4500) return "Max";
    if (total >= 1500) return "Pro";
    if (total >= 600) return "Plus";
    return null;
  }
  if (total >= 2000) return "Ultra";
  if (total >= 1000) return "Max";
  if (total >= 300) return "Pro";
  if (total >= 100) return "Plus";
  return null;
}
