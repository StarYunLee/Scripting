export type PendingIssueKind = "uncommitted" | "corrupt" | "storage" | "committed_cleanup_failed" | "failed_cleanup";

export interface PendingIssueSummary {
  id: string;
  commandId: string | null;
  kind: PendingIssueKind;
  recoverable: boolean;
}

export interface PendingState {
  runningCount?: number;
  cleanupWarningCount?: number;
  failedCleanupCount?: number;
  unresolvedCount: number;
  recoverableCount: number;
  corruptCount: number;
  checking: boolean;
  issues: PendingIssueSummary[];
  lastError: string | null;
}

type PendingListener = (state: PendingState) => void;

let state: PendingState = {
  unresolvedCount: 0,
  recoverableCount: 0,
  corruptCount: 0,
  checking: false,
  issues: [],
  lastError: null,
};
const listeners = new Set<PendingListener>();

export function getPendingState(): PendingState {
  return state;
}

export function setPendingState(next: PendingState): void {
  state = next;
  for (const listener of listeners) {
    try {
      listener(state);
    } catch (error) {
      console.log(`[PendingState] Listener error: ${String(error)}`);
    }
  }
}

export function subscribePendingState(listener: PendingListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
