import type { UsageWindowView } from "../../models";

/**
 * 金额一律以非负十进制字符串处理：不转 float、不做已用/合计推算、
 * 不加千分位；格式化只补零与保留精度，绝不四舍五入。
 */
const DECIMAL = /^\d+(?:\.\d+)?$/;
const CURRENCY_CODE = /^[A-Z]{3}$/;
const MISSING = "—";

const CURRENCY_SYMBOLS: Record<string, string> = {
  CNY: "¥",
  USD: "$",
};

/** 合法三字母币种返回大写 code，其余返回 null；币种不代表地区。 */
export function normalizeCurrencyCode(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const code = value.trim().toUpperCase();
  return CURRENCY_CODE.test(code) ? code : null;
}

/** 官方金额是字符串；只接受纯十进制，拒绝负号、指数、逗号与数字类型。 */
export function normalizeAmount(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return DECIMAL.test(text) ? text : null;
}

export function currencySymbol(currency: string): string {
  const code = normalizeCurrencyCode(currency);
  return code ? CURRENCY_SYMBOLS[code] || "" : "";
}

/** 去掉整数前导零、小数尾部零，最少两位小数；极小正数不显示成 0。 */
function formatDecimal(value: string | null | undefined): string {
  if (typeof value !== "string") return MISSING;
  const amount = normalizeAmount(value);
  if (!amount) return MISSING;
  const [integerRaw, fractionRaw = ""] = amount.split(".");
  const integer = integerRaw.replace(/^0+(?=\d)/, "") || "0";
  const fraction = fractionRaw.replace(/0+$/, "");
  if (integer === "0" && !fraction) return "0.00";
  if (integer === "0") {
    // 四舍五入到 2 位会变成 0.00 的正数：保留更多位；低于 0.0001 显式标注。
    if (fractionRaw.search(/[1-9]/) >= 4) return "<0.0001";
    return `0.${fraction.padEnd(2, "0")}`;
  }
  return `${integer}.${fraction.padEnd(2, "0")}`;
}

/**
 * @param value 非负十进制字符串；null/非法显示“—”
 * @param includeSymbol false 时只输出数字（供布局拆符号用）
 */
export function formatBalanceAmount(
  value: string | null,
  currency: string,
  includeSymbol = true,
): string {
  const amount = formatDecimal(value);
  if (amount === MISSING || !includeSymbol) return amount;
  const code = normalizeCurrencyCode(currency);
  const symbol = code ? currencySymbol(code) : "";
  if (symbol) return `${symbol}${amount}`;
  return code ? `${code} ${amount}` : amount;
}

/**
 * 选择要展示的余额窗口：自动优先 CNY，其次 USD，最后响应里的首个币种。
 * 不读取用户偏好；不同币种不换算、不相加。
 */
export function selectBalanceWindow(
  windows: UsageWindowView[],
): UsageWindowView | null {
  const candidates = (Array.isArray(windows) ? windows : []).filter(
    (window): window is UsageWindowView =>
      Boolean(window?.balance) &&
      (window.kind == null || window.kind === "balance"),
  );
  if (!candidates.length) return null;
  for (const currency of ["CNY", "USD"]) {
    const match = candidates.find(
      (window) => normalizeCurrencyCode(window.balance?.currency) === currency,
    );
    if (match) return match;
  }
  return candidates[0];
}
