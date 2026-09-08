type Metric = "authorizationReads" | "snapshotReads" | "cardLists";
const counters: Record<Metric, number> = {
  authorizationReads: 0,
  snapshotReads: 0,
  cardLists: 0,
};
/** In-memory counters only: no account identifiers, credentials or disk writes. */
export function countUsageOperation(metric: Metric): void {
  counters[metric] += 1;
}
export function readUsagePerformanceCounters(): Readonly<
  Record<Metric, number>
> {
  return { ...counters };
}
