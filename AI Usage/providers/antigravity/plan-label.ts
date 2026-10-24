import type { AntigravityProjectInfo } from "./types";

const PLAN_LABELS: Record<string, string> = {
  free: "Free",
  "free tier": "Free",
  "google ai free": "Free",
  "ai plus": "Google AI Plus",
  "google ai plus": "Google AI Plus",
  "ai pro": "Google AI Pro",
  "google ai pro": "Google AI Pro",
  "g1 pro tier": "Google AI Pro",
  "google one ai premium": "Google AI Pro",
  ultra: "Google AI Ultra",
  "ai ultra": "Google AI Ultra",
  "google ai ultra": "Google AI Ultra",
  "ultra tier": "Google AI Ultra",
  "g1 ultra tier": "Google AI Ultra",
  "g1 ultra lite tier": "Google AI Ultra",
  "ultra 5x": "Google AI Ultra 5x",
  "ai ultra 5x": "Google AI Ultra 5x",
  "google ai ultra 5x": "Google AI Ultra 5x",
  "ultra 20x": "Google AI Ultra 20x",
  "ai ultra 20x": "Google AI Ultra 20x",
  "google ai ultra 20x": "Google AI Ultra 20x",
};

function planKey(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s*(?:（受限）|\(受限\)|\(restricted\))$/i, "")
    .replace(/^antigravity[\s_-]+/, "")
    .replace(/×/g, "x")
    .replace(/[_()-]+/g, " ")
    .replace(/\b(5|20)\s*x\b/g, "$1x")
    .replace(/\s+/g, " ")
    .trim();
}

export function knownAntigravityPlanLabel(value: string): string | null {
  const key = planKey(value);
  return Object.prototype.hasOwnProperty.call(PLAN_LABELS, key)
    ? PLAN_LABELS[key]
    : null;
}

export function normalizeAntigravityPlanLabel(value: string): string {
  return knownAntigravityPlanLabel(value) || value.trim();
}

export function isUnspecifiedAntigravityUltra(value: string): boolean {
  return knownAntigravityPlanLabel(value) === "Google AI Ultra";
}

export function displayAntigravityPlanLabel(value: unknown): string | null {
  if (typeof value !== "string" || !value.trim()) return null;
  // 服务注册层不是 Google AI 订阅；旧缓存中的此类占位不覆盖已知套餐。
  if (
    /^(?:standard tier|legacy tier|gemini code assist(?: for individuals)?)$/.test(
      planKey(value),
    )
  ) {
    return null;
  }
  return normalizeAntigravityPlanLabel(value);
}

export function resolveAntigravityPlanLabel(
  info: AntigravityProjectInfo | null,
  previous: unknown,
): string | null {
  const lastKnown = displayAntigravityPlanLabel(previous);
  const incoming = displayAntigravityPlanLabel(info?.planLabel);
  // 请求失败、缺字段或冲突都不等于取消订阅，不能清空最后确认类型。
  if (!incoming) return lastKnown;
  // currentTier=free-tier 可与付费 paidTier 同时出现；付费信息暂缺时
  // 不能仅依据服务注册层，把最后确认的付费订阅降为 Free。
  if (incoming === "Free" && info?.planSource === "current" && lastKnown) {
    return lastKnown;
  }
  return incoming;
}
