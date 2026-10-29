const BEIJING_OFFSET_MS = 8 * 3600_000;

export function parseBeijingTime(value: unknown): number {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value > 0 ? (value < 1e12 ? value * 1000 : value) : 0;
  }
  if (typeof value !== "string" || !value.trim()) return 0;
  const text = value.trim();
  if (/^\d{10,13}$/.test(text)) {
    const numeric = Number(text);
    return numeric < 1e12 ? numeric * 1000 : numeric;
  }
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2}):(\d{2})$/.exec(text);
  if (match) {
    return Date.parse(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6]}+08:00`);
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function formatCredits(value: number | null | undefined): string {
  if (value == null || !Number.isFinite(value)) return "—";
  const rounded = Math.round(value * 100) / 100;
  const [whole, fraction] = String(rounded).split(".");
  if (!fraction) return whole;
  const trimmed = fraction.replace(/0+$/, "");
  return trimmed ? `${whole}.${trimmed}` : whole;
}

export function creditDetail(
  used: number | null | undefined,
  total: number | null | undefined,
): string | null {
  if (total == null || !Number.isFinite(total) || total <= 0) return null;
  return `${formatCredits(used ?? 0)} / ${formatCredits(total)} 积分`;
}

export function balanceDetail(value: number | null | undefined): string | null {
  if (value == null || !Number.isFinite(value)) return null;
  return `余额 ${formatCredits(value)} 积分`;
}

export function beijingDay(now = Date.now()): string {
  return new Date(now + BEIJING_OFFSET_MS).toISOString().slice(0, 10);
}

export function todayEndIso(now = Date.now()): string {
  const shifted = new Date(now + BEIJING_OFFSET_MS);
  const startOfNextDay =
    Date.UTC(
      shifted.getUTCFullYear(),
      shifted.getUTCMonth(),
      shifted.getUTCDate() + 1,
    ) - BEIJING_OFFSET_MS;
  return new Date(startOfNextDay - 1).toISOString();
}

export function formatShortDate(
  iso: string | null | undefined,
  timeZone?: string,
): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  // 默认跟随设备本地时区，与其他 provider 的日期显示保持一致。
  if (!timeZone) {
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${month}-${day}`;
  }
  // 显式时区只用于验证“同一时刻在不同设备时区显示不同”，
  // 不改变默认的设备本地行为。
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "2-digit",
    day: "2-digit",
    timeZone,
  }).formatToParts(date);
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;
  if (!month || !day) return "—";
  return `${month}-${day}`;
}
