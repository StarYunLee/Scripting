function stringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function titleCasePlan(value: string): string {
  return value
    .replace(/(^|_)(\w)/g, (_, __, character) => ` ${character.toUpperCase()}`)
    .trim();
}

function hasProPlanSignal(value: unknown): boolean {
  const object = objectValue(value);
  if (!object) return false;
  for (const key of ["plan", "plan_type", "subscription_type", "tier", "sku"]) {
    const signal = stringValue(object[key]);
    if (signal && /(?:^|[_ -])pro[_ -]?(?:20x|5x)(?:$|[_ -])|^pro[_ -]?(?:20x|5x)$/i.test(signal)) {
      return true;
    }
  }
  return false;
}

function hasProMultiplier(value: unknown): boolean {
  const object = objectValue(value);
  if (!object) return false;
  return object.multiplier === 5 ||
    object.multiplier === 20 ||
    object.usage_multiplier === 5 ||
    object.usage_multiplier === 20;
}

/**
 * ChatGPT 的 wham payload 在部分账号只把 Pro 信号放在已验证的
 * subscription/account/entitlement 元数据中，顶层 plan_type 仍可能是 plus。
 */
export function codexPlanLabel(payload: Record<string, unknown>): string | null {
  const raw = stringValue(payload.plan_type)?.toLowerCase() || "";
  const entitlement = objectValue(payload.entitlement);
  const entitlements = Array.isArray(payload.entitlements)
    ? payload.entitlements
    : [];

  if (
    hasProPlanSignal(payload.subscription) ||
    hasProPlanSignal(entitlement) ||
    entitlements.some((value) => hasProPlanSignal(value)) ||
    hasProMultiplier(payload.account) ||
    hasProMultiplier(entitlement) ||
    entitlements.some((value) => hasProMultiplier(value))
  ) {
    return "Pro";
  }

  const labels: Record<string, string> = {
    guest: "Guest",
    free: "Free",
    go: "Go",
    plus: "Plus",
    pro: "Pro",
    prolite: "Pro Lite",
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
  if (!raw) return null;
  return labels[raw] || titleCasePlan(raw);
}
