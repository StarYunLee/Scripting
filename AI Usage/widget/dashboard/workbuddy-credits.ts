/** Dashboard-only view of the cached "used / total 积分" detail. */
export type DashboardCreditValues = { remaining: string; total: string };

function creditCents(value: string): number | null {
  const match = /^(\d+)(?:\.(\d{1,2}))?$/.exec(value.trim());
  if (!match) return null;
  const cents = Number(match[1]) * 100 + Number((match[2] || "").padEnd(2, "0"));
  return Number.isSafeInteger(cents) ? cents : null;
}

function creditText(cents: number): string {
  const whole = Math.floor(cents / 100);
  const fraction = String(cents % 100).padStart(2, "0").replace(/0+$/, "");
  return fraction ? `${whole}.${fraction}` : String(whole);
}

/** Subtract displayed quantities exactly; never infer points from a rounded percentage. */
export function workbuddyDashboardCredits(detail?: string | null): DashboardCreditValues {
  const parts = typeof detail === "string"
    ? detail.trim().replace(/\s*积分$/, "").trim().split("/")
    : [];
  if (parts.length !== 2) return { remaining: "—", total: "—" };
  const used = creditCents(parts[0]);
  const total = creditCents(parts[1]);
  return {
    remaining: used == null || total == null ? "—" : creditText(Math.max(0, total - used)),
    total: total == null ? "—" : creditText(total),
  };
}
