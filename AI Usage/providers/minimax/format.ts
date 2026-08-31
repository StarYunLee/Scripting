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
export function formatPlanLabel(
  value: string | null | undefined,
): string | null {
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
