import type { ProviderId } from "../models";

type Input = {
  level: "info" | "warning" | "error";
  source: "app" | "widget" | "intent";
  category: "auth" | "refresh" | "cache" | "widget" | "settings" | "system";
  event: string;
  provider?: ProviderId;
  accountId?: string | null;
  message: string;
  code?: string;
  status?: number;
};
export type RunRecord = {
  id: string;
  at: string;
  kind: "refresh" | "auth" | "refresh_all" | "widget";
  provider?: ProviderId;
  accountLabel?: string;
  status: "success" | "cache" | "warning" | "error";
  summary: string;
  detail?: string;
};
const KEY = "ai_usage_run_records_v1";
const MAX = 100;
const AGE = 7 * 24 * 60 * 60 * 1000;
let recordsCache: RunRecord[] | null = null;

function clean(v: unknown, max = 120): string {
  const s = String(v ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\bBearer\s+\S+/gi, "Bearer [redacted]")
    .replace(
      /([A-Za-z0-9._%+-]{1,2})[A-Za-z0-9._%+-]*@([A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
      "$1***@$2",
    )
    .trim();
  return s.length > max ? `${s.slice(0, max)}…` : s;
}
function account(value?: string | null): string | undefined {
  if (!value) return undefined;
  const s = clean(value, 80);
  return s.length <= 8 ? s : `…${s.slice(-6)}`;
}
function records(): RunRecord[] {
  if (recordsCache) return recordsCache;
  try {
    const value = Storage.get<RunRecord[]>(KEY, { shared: true });
    recordsCache = Array.isArray(value)
      ? value
          .filter(
            (item) =>
              item?.id &&
              item?.at &&
              new Date(item.at).getTime() >= Date.now() - AGE,
          )
          .slice(-MAX)
      : [];
  } catch {
    recordsCache = [];
  }
  return recordsCache;
}
function kind(input: Input): RunRecord["kind"] {
  if (input.event.includes("refresh_all") || input.source === "intent")
    return "refresh_all";
  if (input.category === "auth") return "auth";
  if (input.source === "widget" || input.category === "widget") return "widget";
  return "refresh";
}
function status(input: Input): RunRecord["status"] {
  if (input.level === "error") return "error";
  if (input.category === "cache" || input.event.includes("cache"))
    return "cache";
  if (input.level === "warning") return "warning";
  return "success";
}
export function writeLog(input: Input): void {
  const item: RunRecord = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    at: new Date().toISOString(),
    kind: kind(input),
    provider: input.provider,
    accountLabel: account(input.accountId),
    status: status(input),
    summary: clean(input.message),
    detail:
      [
        input.status != null ? `HTTP ${input.status}` : null,
        input.code ? `代码 ${clean(input.code, 60)}` : null,
      ]
        .filter(Boolean)
        .join(" · ") || undefined,
  };
  try {
    const next = [...records(), item].slice(-MAX);
    if (Storage.set(KEY, next, { shared: true })) recordsCache = next;
  } catch {
    /* logging must never break app */
  }
  try {
    const method =
      input.level === "error"
        ? "error"
        : input.level === "warning"
          ? "warn"
          : "log";
    console[method](`[AI Usage] ${item.summary}`);
  } catch {
    /* ignore */
  }
}
export function readRunRecords(): RunRecord[] {
  return records().reverse();
}
export function clearRunRecords(): void {
  try {
    Storage.remove(KEY, { shared: true });
    recordsCache = [];
  } catch {
    /* ignore */
  }
}
