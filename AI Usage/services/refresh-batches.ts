export type SettledItem<T> =
  | { ok: true; value: T }
  | { ok: false; error: unknown };

export async function runWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  run: (item: T) => Promise<R>,
): Promise<Array<SettledItem<R>>> {
  if (!items.length) return [];
  const limit =
    Number.isFinite(concurrency) && concurrency >= 1
      ? Math.min(items.length, Math.floor(concurrency))
      : 1;
  const results = new Array<SettledItem<R>>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      try {
        results[index] = { ok: true, value: await run(items[index]) };
      } catch (error) {
        results[index] = { ok: false, error };
      }
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
