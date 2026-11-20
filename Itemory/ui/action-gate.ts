import { useRef, useState } from "scripting";
import { getPendingState } from "../services/pending-state";

function cannotStartNewMutation(): boolean {
  const state = getPendingState();
  return state.unresolvedCount > 0 || state.corruptCount > 0 || state.lastError !== null;
}

/** Owns one user action including dialogs and post-commit refresh. */
export function useActionGate() {
  const locked = useRef(false);
  const [busy, setBusy] = useState(false);
  async function run<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (locked.current) return;
    if (cannotStartNewMutation()) {
      await Dialog.alert({ title: "当前只读", message: "存在待核对操作，当前不能发起新的修改。请返回核对页。", buttonLabel: "知道了" });
      return;
    }
    locked.current = true;
    setBusy(true);
    try { return await work(); }
    finally { locked.current = false; setBusy(false); }
  }
  async function runQuiet<T>(work: () => Promise<T>): Promise<T | undefined> {
    if (locked.current) return;
    if (cannotStartNewMutation()) {
      await Dialog.alert({ title: "当前只读", message: "存在待核对操作，当前不能发起新的修改。请返回核对页。", buttonLabel: "知道了" });
      return;
    }
    locked.current = true;
    try { return await work(); }
    finally { locked.current = false; }
  }
  return { busy, run, runQuiet };
}
