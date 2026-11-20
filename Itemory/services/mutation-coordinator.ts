import { getPendingState } from "./pending-state";
import { DATA_HOME } from "./paths";
import { Path } from "scripting";

// Serializes entire command bodies in this JS instance only.
// Database CAS/receipts remain the authority across instances.
let tail: Promise<void> = Promise.resolve();
let restartRequired = false;
const restartListeners = new Set<() => void>();
export function needsRestartAfterRestore(): boolean {
  return restartRequired;
}
export function subscribeRestoreRestart(listener: () => void): () => void {
  restartListeners.add(listener);
  return () => {
    restartListeners.delete(listener);
  };
}
export function requireRestartAfterRestore(notifyView = true): void {
  restartRequired = true;
  // A successful preparation keeps the original page behind its terminal alert.
  // Writes are still blocked; notify only when an error needs the fallback screen.
  if (!notifyView) return;
  for (const listener of restartListeners) {
    try {
      listener();
    } catch {
      /* UI observers cannot undo commit. */
    }
  }
}
export function assertSessionWritable(): void {
  if (restartRequired || FileManager.existsSync(Path.join(DATA_HOME, "restore-work")))
    throw new Error("备份恢复待核对，请完全退出并重新打开 Itemory 后继续操作。");
}
/**
 * Queue a gate ahead of every later mutation in this instance. Startup uses
 * it so the inventory can render while pending journals are reconciled in
 * the background: writes wait for the gate, then re-check pending state.
 */
export function holdWritesUntil(gate: Promise<unknown>): void {
  const settled = gate.then(
    () => undefined,
    () => undefined,
  );
  tail = tail.then(
    () => settled,
    () => settled,
  );
}
export function coordinateMutation<T>(work: () => Promise<T>): Promise<T> {
  const guarded = () => {
    assertSessionWritable();
    const state = getPendingState();
    if (
      state.unresolvedCount > 0 ||
      state.corruptCount > 0 ||
      state.lastError !== null
    ) {
      throw new Error("存在待核对操作，当前数据保持只读，不能提交新的修改。");
    }
    return work();
  };
  const result = tail.then(guarded, guarded);
  tail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}
