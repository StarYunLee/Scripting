import { parseJwtPayload } from "../../services/jwt-payload";
import type { LimitWindow, LimitWindowName } from "./types";
import { codexWindowTitle } from "./window-titles";

function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (
    typeof value === "string" &&
    value.trim() &&
    Number.isFinite(Number(value))
  ) {
    return Number(value);
  }
  return null;
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}

function epoch(value: unknown): { iso: string | null; ms: number | null } {
  if (typeof value === "string" && !/^\d+(\.\d+)?$/.test(value)) {
    const ms = new Date(value).getTime();
    return Number.isFinite(ms)
      ? { iso: new Date(ms).toISOString(), ms }
      : { iso: null, ms: null };
  }
  const numeric = toNumber(value);
  if (numeric == null) return { iso: null, ms: null };
  const ms = numeric > 1e11 ? numeric : numeric * 1000;
  return Number.isFinite(ms)
    ? { iso: new Date(ms).toISOString(), ms }
    : { iso: null, ms: null };
}

function usedPercent(value: Record<string, unknown>): number | null {
  const used = toNumber(value.used_percent ?? value.usedPercent);
  if (used != null) return clamp(used);
  const remaining = toNumber(
    value.percent_left ?? value.remaining_percent ?? value.remainingPercent,
  );
  return remaining == null ? null : clamp(100 - remaining);
}

function inferWindowName(seconds: number | null, hint = ""): LimitWindowName {
  const normalized = hint.toLowerCase();
  if (/5\s*h|five|session/.test(normalized)) return "five_hour";
  if (/30\s*d|month/.test(normalized)) return "monthly";
  if (/7\s*d|week/.test(normalized)) return "weekly";
  if (seconds == null) return "unknown";
  if (seconds <= 6 * 3600) return "five_hour";
  if (seconds >= 25 * 86400) return "monthly";
  if (seconds >= 6 * 86400) return "weekly";
  return "unknown";
}

function windowLabel(name: LimitWindowName, seconds: number | null): string {
  if (name !== "unknown") return codexWindowTitle(name);
  if (seconds && seconds >= 86400) return `${Math.round(seconds / 86400)} 天`;
  return codexWindowTitle("unknown");
}

function parseWindow(
  value: unknown,
  id: string,
  hint = "",
): LimitWindow | null {
  let object = asObject(value);
  if (!object) return null;
  if (
    !object.reset_at &&
    !object.used_percent &&
    asObject(object.primary_window)
  ) {
    object = asObject(object.primary_window)!;
  }
  const seconds = toNumber(
    object.limit_window_seconds ?? object.window_seconds ?? object.limit_window,
  );
  const name = inferWindowName(seconds, `${id} ${hint}`);
  const reset = epoch(
    object.reset_at ??
      object.reset_time_ms ??
      object.resetAt ??
      object.reset_time,
  );
  const used = usedPercent(object);
  if (used == null && !reset.iso) return null;
  return {
    id,
    name,
    label: windowLabel(name, seconds),
    usedPercent: used,
    remainingPercent: used == null ? null : clamp(100 - used),
    resetAt: reset.iso,
    resetAtMs: reset.ms,
    windowSeconds: seconds,
  };
}

function sameWindow(left: LimitWindow, right: LimitWindow): boolean {
  return (
    left.name === right.name &&
    left.resetAtMs === right.resetAtMs &&
    left.usedPercent === right.usedPercent
  );
}

function collectFromRateLimit(
  rateLimit: Record<string, unknown>,
  prefix: string,
  hint = "",
  labelPrefix = "",
): LimitWindow[] {
  const windows: LimitWindow[] = [];
  const keys = [
    "primary_window",
    "primaryWindow",
    "secondary_window",
    "secondaryWindow",
    "five_hour",
    "weekly",
    "monthly",
  ];
  const seen = new Set<unknown>();
  for (const key of keys) {
    const value = rateLimit[key];
    if (!value || seen.has(value)) continue;
    seen.add(value);
    const parsed = parseWindow(value, `${prefix}:${key}`, `${hint} ${key}`);
    if (!parsed) continue;
    if (labelPrefix) parsed.label = `${labelPrefix} ${parsed.label}`;
    if (!windows.some((window) => sameWindow(window, parsed))) {
      windows.push(parsed);
    }
  }
  return windows;
}

function slug(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function isOrdinaryCodexWindow(window: { id: string }): boolean {
  return window.id.startsWith("codex:") || window.id.startsWith("direct:");
}

export function extractCodexWindows(
  payload: Record<string, unknown>,
): LimitWindow[] {
  const windows: LimitWindow[] = [];
  const root =
    asObject(payload.rate_limit) || asObject(payload.rateLimit) || payload;
  windows.push(...collectFromRateLimit(root, "codex"));

  const additional =
    payload.additional_rate_limits ?? root.additional_rate_limits;
  if (Array.isArray(additional)) {
    additional.forEach((item, index) => {
      const object = asObject(item);
      const rateLimit =
        asObject(object?.rate_limit) || asObject(object?.rateLimit) || object;
      if (!rateLimit) return;

      const limitName = toStringValue(object?.limit_name);
      const meteredFeature = toStringValue(object?.metered_feature);
      const sourceText = `${limitName || ""} ${meteredFeature || ""}`;
      const isSpark = /spark/i.test(sourceText);
      const featureId =
        slug(meteredFeature || limitName || "") || `unknown-${index}`;
      const labelPrefix = isSpark
        ? "Codex Spark"
        : limitName || meteredFeature || "Codex 附加限额";

      windows.push(
        ...collectFromRateLimit(
          rateLimit,
          `extra:${featureId}`,
          sourceText,
          labelPrefix,
        ),
      );
    });
  }

  const direct: Array<[string, LimitWindowName]> = [
    ["five_hour", "five_hour"],
    ["weekly", "weekly"],
    ["monthly", "monthly"],
  ];
  for (const [key, name] of direct) {
    const parsed = parseWindow(payload[key], `direct:${key}`, key);
    if (
      parsed &&
      !windows.some(
        (window) => isOrdinaryCodexWindow(window) && window.name === name,
      )
    ) {
      windows.push(parsed);
    }
  }

  const unique = windows.filter(
    (window, index) =>
      windows.findIndex((candidate) => candidate.id === window.id) === index,
  );
  return unique.sort((left, right) => {
    const sourceOrder =
      Number(!isOrdinaryCodexWindow(left)) -
      Number(!isOrdinaryCodexWindow(right));
    return (
      sourceOrder ||
      (left.windowSeconds || 1e20) - (right.windowSeconds || 1e20) ||
      left.id.localeCompare(right.id)
    );
  });
}

export function pickOrdinaryCodexWindow(
  windows: LimitWindow[],
  name: Exclude<LimitWindowName, "unknown">,
): LimitWindow | null {
  return (
    windows.find(
      (window) => isOrdinaryCodexWindow(window) && window.name === name,
    ) || null
  );
}

export function codexPlanTypeFromJwt(token: string | null): string | null {
  const payload = parseJwtPayload(token);
  if (!payload) return null;
  const auth = asObject(payload["https://api.openai.com/auth"]);
  return (
    toStringValue(auth?.chatgpt_plan_type) ||
    toStringValue(payload.chatgpt_plan_type) ||
    toStringValue(auth?.plan_type)
  );
}

export function resolveCodexPlanType(
  payloadPlanType: unknown,
  idToken: string | null,
  accessToken: string | null,
): string | null {
  return (
    toStringValue(payloadPlanType) ||
    codexPlanTypeFromJwt(idToken) ||
    codexPlanTypeFromJwt(accessToken)
  );
}

export function codexPlanLabel(rawPlanType: string | null): string | null {
  const raw = rawPlanType?.toLowerCase().trim() || null;
  if (!raw) return null;
  const labels: Record<string, string> = {
    guest: "Guest",
    free: "Free",
    go: "Go",
    plus: "Plus",
    prolite: "Pro 5X",
    pro: "Pro 20X",
    chatgptpro: "Pro 20X",
    chatgpt_pro: "Pro 20X",
    free_workspace: "Free Workspace",
    team: "Team",
    self_serve_business_prolite: "Business Pro Lite",
    self_serve_business_usage_based: "Business",
    business: "Business",
    ent26: "Enterprise",
    enterprise_cbp_automation: "Enterprise",
    enterprise_cbp_usage_based: "Enterprise",
    enterprise: "Enterprise",
    education: "Education",
    edu: "Education",
    edu_plus: "Education Plus",
    edu_pro: "Education Pro",
    quorum: "Quorum",
    k12: "Education",
  };
  return (
    labels[raw] ||
    raw
      .replace(
        /(^|_)(\w)/g,
        (_, __, character: string) => ` ${character.toUpperCase()}`,
      )
      .trim()
  );
}

export function resolveCodexPlanLabel(
  rawPlanType: string | null,
  fallbackPlanLabel: string | null | undefined,
  fallbackPlanType: string | null | undefined,
): string | null {
  return (
    codexPlanLabel(rawPlanType) ||
    toStringValue(fallbackPlanLabel) ||
    codexPlanLabel(toStringValue(fallbackPlanType)) ||
    toStringValue(fallbackPlanType)
  );
}
