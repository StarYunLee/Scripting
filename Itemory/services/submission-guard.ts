// Per-editor intent guard, not a database transaction or cross-process receipt.
export function createSubmissionGuard() {
  let state: "idle" | "running" | "completed" = "idle";
  return {
    begin(): boolean {
      if (state !== "idle") return false;
      state = "running";
      return true;
    },
    complete(): void { state = "completed"; },
    release(): void { if (state === "running") state = "idle"; },
    isCompleted(): boolean { return state === "completed"; },
  };
}
