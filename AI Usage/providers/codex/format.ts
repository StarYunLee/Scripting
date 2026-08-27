export {
  formatClampedPercent as formatPercent,
  formatFetchedAt,
  formatResetDate,
  formatSmallDate,
} from "../../services/format";

export function resetCreditsSummary(
  available: number | null | undefined,
  expirations: string[] | null | undefined,
): { available: number | null; nearestExpiration: string | null } {
  const count =
    available == null || !Number.isFinite(available)
      ? null
      : Math.max(0, Math.floor(available));
  const parsed = (expirations || [])
    .map((value) => ({ value, ms: new Date(value).getTime() }))
    .filter((item) => Number.isFinite(item.ms))
    .sort((a, b) => a.ms - b.ms);
  const future = parsed.filter((item) => item.ms > Date.now());
  const effective =
    count != null && parsed.length >= count
      ? Math.min(count, future.length)
      : count;
  return {
    available: effective,
    nearestExpiration: effective === 0 ? null : future[0]?.value || null,
  };
}
