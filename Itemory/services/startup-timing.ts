/**
 * Lightweight launch timing, printed to the Scripting console as
 * `[Startup] <step> <duration>ms (+<since launch>ms)`. Each step logs once per
 * script run, so resume/refresh paths do not flood the console.
 */
const launchedAt = Date.now();
const logged = new Set<string>();

export function logStartupStep(step: string, startedAt: number): void {
  if (logged.has(step)) return;
  logged.add(step);
  const now = Date.now();
  console.log(`[Startup] ${step} ${now - startedAt}ms (+${now - launchedAt}ms)`);
}

/** Time one awaited step and log it the first time it runs. */
export async function timeStartupStep<T>(
  step: string,
  work: () => Promise<T>,
): Promise<T> {
  const startedAt = Date.now();
  try {
    return await work();
  } finally {
    logStartupStep(step, startedAt);
  }
}

/** Log a milestone measured from script launch. */
export function markStartup(step: string): void {
  logStartupStep(step, launchedAt);
}
