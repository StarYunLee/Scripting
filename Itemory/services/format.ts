export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function todayYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function addYearsYmd(ymd: string, years: number): string {
  if (!isValidYmd(ymd) || !Number.isInteger(years)) throw new Error("日期格式无效");
  const [year, month, day] = ymd.split("-").map(Number);
  const targetYear = year + years;
  const leap = targetYear % 4 === 0 && (targetYear % 100 !== 0 || targetYear % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return `${targetYear}-${pad2(month)}-${pad2(Math.min(day, days[month - 1]))}`;
}

export function tsToYmd(ts: number): string {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function ymdToTs(ymd: string): number {
  if (!isValidYmd(ymd)) throw new Error("日期格式无效");
  const [year, month, day] = ymd.split("-").map(Number);
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

/**
 * 校验是否为合法的日历日期 YYYY-MM-DD
 */
export function isValidYmd(ymd: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return false;
  const [y, m, d] = ymd.split("-").map(Number);
  if (y < 1 || m < 1 || m > 12 || d < 1 || d > 31) return false;
  const leap = y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0);
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return d <= days[m - 1];
}

/**
 * 计算两个日历日之间的天数（严格日历差，首日即算 1 天）
 */
export function calendarHoldingDays(startOn: string, endOn?: string | null): number {
  const end = endOn ?? todayYmd();
  const ordinal = (value: string) => {
    if (!isValidYmd(value)) throw new Error("日期格式无效");
    const [year, month, day] = value.split("-").map(Number);
    const date = new Date(0);
    date.setUTCFullYear(year, month - 1, day);
    date.setUTCHours(0, 0, 0, 0);
    return date.getTime() / 86400000;
  };
  const delta = ordinal(end) - ordinal(startOn);
  if (delta < 0) throw new Error("结束日期不得早于购入日期");
  return delta + 1;
}

/**
 * 解析用户输入的人民币文本，返回整数分 (1 元 = 100 分)
 * 若为空或空白，返回 null (代表未填写/未知)
 * 若为非法字符串或负数，抛出校验异常
 */
export function parseYuanToMinor(text: string | null | undefined): number | null {
  if (text === null || text === undefined) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const value = trimmed.replace(/^[¥￥]\s*/, "");
  // Accept plain decimals or correctly grouped thousands; never round excess precision.
  if (!/^(?:\d+|[1-9]\d{0,2}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(value)) {
    throw new Error("请输入非负金额，最多两位小数；千分位格式须正确");
  }
  const [whole, fraction = ""] = value.replace(/,/g, "").split(".");
  const digits = (whole + fraction.padEnd(2, "0")).replace(/^0+(?=\d)/, "");
  const limit = String(Number.MAX_SAFE_INTEGER);
  if (digits.length > limit.length || (digits.length === limit.length && digits > limit)) {
    throw new Error("金额超出安全范围");
  }
  const minor = Number(digits);
  if (!Number.isSafeInteger(minor)) throw new Error("金额超出安全范围");
  return minor;
}

export function minorToDecimalText(minor: number): string {
  if (!Number.isSafeInteger(minor)) throw new Error("金额必须为安全整数分");
  const sign = minor < 0 ? "-" : "";
  const digits = String(Math.abs(minor)).padStart(3, "0");
  return `${sign}${digits.slice(0, -2)}.${digits.slice(-2)}`;
}

/**
 * 将整数分格式化为带人民币符号的完整金额字符串
 * @param minor 整数分
 * @param compact 是否紧凑（整数不带 .00；仍保留完整数字）
 */
export function formatMinorMoney(minor: number | null | undefined, compact = false): string {
  if (minor === null || minor === undefined) return "金额未知";
  if (!Number.isSafeInteger(minor)) throw new Error("金额必须为安全整数分");

  const decimal = minorToDecimalText(minor);
  if (!compact) return `¥${decimal}`;
  const compactDecimal = decimal.endsWith(".00") ? decimal.slice(0, -3) : decimal.replace(/0$/, "");
  return `¥${compactDecimal}`;
}

export function formatYmdZh(ymd: string): string {
  if (!isValidYmd(ymd)) return ymd;
  const parts = ymd.split("-").map(Number);
  return `${parts[0]}年${parts[1]}月${parts[2]}日`;
}

export function formatHoldingDuration(days: number): string {
  if (days < 365) {
    return `${days} 天`;
  }
  const years = (days / 365).toFixed(1);
  return `${days} 天 (${years} 年)`;
}
