function asObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function toStringValue(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function labelFromSubscription(
  subscriptionType: string | null,
  rateLimitTier: string | null,
): string | null {
  const tierWords = (rateLimitTier || "")
    .toLowerCase()
    .split(/[_\-\s]+/)
    .filter(Boolean);
  const fromOrganization = (subscriptionType || "")
    .trim()
    .toLowerCase()
    .replace(/^claude_/, "");
  const base =
    fromOrganization ||
    (["max", "pro", "team", "enterprise"] as const).find((plan) =>
      tierWords.includes(plan),
    ) ||
    null;
  if (!base) return null;

  if (base === "pro") return "Claude Pro";
  if (base.startsWith("team")) return "Claude Team";
  if (base === "enterprise") return "Claude Enterprise";
  if (base === "max") {
    const maxIndex = tierWords.indexOf("max");
    const multiplier =
      maxIndex >= 0
        ? tierWords[maxIndex + 1]
        : tierWords.find((word) => /^\d+x$/.test(word));
    if (multiplier === "20x") return "Claude Max 20×";
    if (multiplier === "5x") return "Claude Max 5×";
    return "Claude Max";
  }

  const clean = base.replace(/[_-]+/g, " ").trim();
  return clean
    ? `Claude ${clean.replace(/\b\w/g, (character) => character.toUpperCase())}`
    : null;
}

export function planLabelFromUsage(
  payload: Record<string, unknown>,
): string | null {
  for (const key of [
    "subscription_type",
    "rate_limit_tier",
    "plan_type",
    "plan",
  ]) {
    const value = payload[key];
    if (typeof value !== "string" || !value.trim()) continue;
    const clean = value
      .replace(/^default_claude_?/i, "")
      .replace(/[_-]+/g, " ")
      .trim();
    if (/^max\s*20x$/i.test(clean)) return "Claude Max 20×";
    if (/^max\s*5x$/i.test(clean)) return "Claude Max 5×";
    if (/^max$/i.test(clean)) return "Claude Max";
    if (/^pro$/i.test(clean)) return "Claude Pro";
    if (/^team/i.test(clean)) return "Claude Team";
    if (/^enterprise$/i.test(clean)) return "Claude Enterprise";
    return `Claude ${clean.replace(/\b\w/g, (character) => character.toUpperCase())}`;
  }
  return null;
}

export function planLabelFromProfile(
  payload: Record<string, unknown>,
): string | null {
  const organization = asObject(payload.organization);
  if (!organization) return null;
  const organizationType = toStringValue(organization.organization_type);
  const rateLimitTier = toStringValue(
    organization.rate_limit_tier ?? organization.rate_limit_tiers,
  );
  const subscription =
    organizationType?.replace(/^claude_/i, "") ||
    toStringValue(organization.subscription_type) ||
    null;
  return labelFromSubscription(subscription, rateLimitTier);
}
