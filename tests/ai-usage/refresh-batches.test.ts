import assert from "node:assert/strict";
import { test } from "node:test";
import {
  runWithConcurrency,
  type SettledItem,
} from "../../AI Usage/services/refresh-batches";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

test("caps active refreshes while starting the next target as capacity frees", async () => {
  const gates = [deferred<number>(), deferred<number>(), deferred<number>()];
  const started: number[] = [];
  let active = 0;
  let peak = 0;

  const pending = runWithConcurrency([0, 1, 2], 2, async (item) => {
    started.push(item);
    active += 1;
    peak = Math.max(peak, active);
    const value = await gates[item].promise;
    active -= 1;
    return value;
  });

  await Promise.resolve();
  assert.deepEqual(started, [0, 1]);
  assert.equal(peak, 2);

  gates[1].resolve(20);
  for (let attempt = 0; attempt < 5 && started.length < 3; attempt += 1) {
    await new Promise<void>((resolve) => setImmediate(resolve));
  }
  assert.deepEqual(started, [0, 1, 2]);
  assert.equal(peak, 2);

  gates[0].resolve(10);
  gates[2].resolve(30);
  assert.deepEqual(await pending, [
    { ok: true, value: 10 },
    { ok: true, value: 20 },
    { ok: true, value: 30 },
  ] satisfies SettledItem<number>[]);
});

test("uses a safe one-at-a-time limit when concurrency is invalid", async () => {
  let active = 0;
  let peak = 0;
  const values = await runWithConcurrency([1, 2, 3], 0, async (item) => {
    active += 1;
    peak = Math.max(peak, active);
    await Promise.resolve();
    active -= 1;
    return item * 2;
  });

  assert.deepEqual(values, [
    { ok: true, value: 2 },
    { ok: true, value: 4 },
    { ok: true, value: 6 },
  ]);
  assert.equal(peak, 1);
});

test("settles one rejected refresh without dropping other results", async () => {
  const error = new Error("boom");
  const results = await runWithConcurrency(
    ["first", "broken", "last"],
    3,
    async (item) => {
      if (item === "broken") throw error;
      return item.toUpperCase();
    },
  );

  assert.deepEqual(results, [
    { ok: true, value: "FIRST" },
    { ok: false, error },
    { ok: true, value: "LAST" },
  ]);
});
