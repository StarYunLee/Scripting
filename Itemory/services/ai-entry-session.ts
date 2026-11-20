import { AbortController } from "scripting";
import {
  runAiItemWorkflow,
  type AiItemWorkflowInput,
  type AiItemWorkflowResult,
  type AiItemWorkflowRuntime,
} from "./ai-item-workflow";
import { runAiVisionWorkflow } from "./ai-vision-workflow";
import { runAiCutoutTest } from "./ai-cutout";
import { resolveAiCutoutRoot } from "./ai-cutout-config";
import { safeAiVisionError } from "./ai-vision-diagnostics";

export type AiEntryBranch = "information" | "cutout";
export type AiEntryBranchStatus =
  | "idle"
  | "running"
  | "success"
  | "failed"
  | "cancelled"
  | "ignored"
  | "disabled";
export type AiEntrySnapshot = Readonly<{
  result: AiItemWorkflowResult;
  informationStatus: AiEntryBranchStatus;
  cutoutStatus: AiEntryBranchStatus;
  informationGeneration: number;
  cutoutGeneration: number;
  owner: "creator" | "editor" | "closed";
  phase: string;
  closed: boolean;
}>;
export type AiEntrySessionInput = Pick<
  AiItemWorkflowInput,
  "profile" | "cutoutModel" | "apiKey" | "image"
> & {
  mode: "information" | "combined";
  cutoutPrompt?: string;
};
export type AiEntrySession = {
  start(): Promise<void>;
  getSnapshot(): AiEntrySnapshot;
  subscribe(listener: (snapshot: AiEntrySnapshot) => void): () => void;
  handoff(): boolean;
  abandon(): void;
  close(): void;
  cancel(branch?: AiEntryBranch): void;
  /** Explicit caller confirmation of possible additional charges is required. */
  retry(branch: AiEntryBranch): Promise<boolean>;
  ignoreCutout(): void;
};
const defaultRuntime: AiItemWorkflowRuntime = {
  now: () => Date.now(),
  consent: async (root, current) => {
    const { ensureAiVisionUploadConsent } = await import("./ai-vision-consent");
    return ensureAiVisionUploadConsent(root, current);
  },
  information: runAiVisionWorkflow,
  cutout: runAiCutoutTest,
};
/** A finite, memory-only operation. Page disappearance is NOT operation ownership. */
export function createAiEntrySession(
  input: AiEntrySessionInput,
  runtime: AiItemWorkflowRuntime = defaultRuntime,
): AiEntrySession {
  // Configuration is fixed before the first await; retries retain this snapshot.
  const mode = input.mode;
  const profile = Object.freeze({
    ...input.profile,
    models: Object.freeze([...input.profile.models]) as unknown as string[],
  });
  const cutoutModel = input.cutoutModel;
  const cutoutPrompt = input.cutoutPrompt;
  let apiKey = input.apiKey;
  let image: UIImage | null = input.image;
  let owner: AiEntrySnapshot["owner"] = "creator";
  let started = false;
  let phase = "";
  let information: AiItemWorkflowResult["information"] = null;
  let cutout: AiItemWorkflowResult["cutout"] = null;
  let informationError: string | null = null;
  let informationStatus: AiEntryBranchStatus = "idle";
  let cutoutStatus: AiEntryBranchStatus =
    mode === "combined" ? "idle" : "disabled";
  let informationGeneration = 0,
    cutoutGeneration = 0;
  let approvedRoot: string | null = null;
  let consentPromise: Promise<boolean> | null = null;
  const listeners = new Set<(snapshot: AiEntrySnapshot) => void>();
  const controllers: Partial<Record<AiEntryBranch, AbortController>> = {};
  const startTime = runtime.now();
  const closed = () => owner === "closed";
  const status = (branch: AiEntryBranch) =>
    branch === "information" ? informationStatus : cutoutStatus;
  const generation = (branch: AiEntryBranch) =>
    branch === "information" ? informationGeneration : cutoutGeneration;
  const setStatus = (branch: AiEntryBranch, value: AiEntryBranchStatus) => {
    if (branch === "information") informationStatus = value;
    else cutoutStatus = value;
  };
  const getSnapshot = (): AiEntrySnapshot =>
    Object.freeze({
      result: Object.freeze({
        mode,
        information,
        cutout,
        informationError,
        totalMs: Math.max(0, runtime.now() - startTime),
        complete: ![informationStatus, cutoutStatus].some(
          (s) => s === "running" || s === "idle",
        ),
        stopped:
          informationStatus === "cancelled" || cutoutStatus === "cancelled",
      }),
      informationStatus,
      cutoutStatus,
      informationGeneration,
      cutoutGeneration,
      owner,
      phase,
      closed: closed(),
    });
  const publish = () => {
    if (closed()) return;
    const snapshot = getSnapshot();
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch {
        /* One disposed view must not stop another subscriber. */
      }
    }
  };
  const consent = async (
    root: string,
    current: () => boolean,
  ): Promise<boolean> => {
    if (closed() || !current()) return false;
    const canonical = resolveAiCutoutRoot(root);
    if (approvedRoot === canonical) return true;
    if (!consentPromise)
      consentPromise = runtime
        .consent(canonical, () => !closed())
        .then((ok) => {
          if (ok && !closed()) approvedRoot = canonical;
          return ok && !closed();
        })
        .finally(() => {
          consentPromise = null;
        });
    return (
      (await consentPromise) &&
      !closed() &&
      current() &&
      approvedRoot === canonical
    );
  };
  const execute = async (branches: AiEntryBranch[]): Promise<void> => {
    if (closed() || !image) return;
    const requestImage = image;
    const key = apiKey;
    const expected = {
      information: informationGeneration,
      cutout: cutoutGeneration,
    };
    for (const branch of branches) {
      controllers[branch] = new AbortController();
      setStatus(branch, "running");
    }
    const active = (branch: AiEntryBranch) =>
      !closed() &&
      generation(branch) === expected[branch] &&
      !controllers[branch]?.signal.aborted;
    const operationActive = () => !closed() && branches.some(active);
    publish();
    const scopedRuntime: AiItemWorkflowRuntime = {
      now: runtime.now,
      consent,
      information: (request, approved) => {
        if (!active("information"))
          return Promise.reject(new Error("操作已取消"));
        return runtime.information(
          {
            ...request,
            signal: controllers.information?.signal,
            isCurrent: () => active("information"),
          },
          approved,
        );
      },
      cutout: (request) => {
        if (!active("cutout")) return Promise.reject(new Error("操作已取消"));
        return runtime.cutout({
          ...request,
          signal: controllers.cutout?.signal,
          isCurrent: () => active("cutout"),
          ...(cutoutPrompt === undefined ? {} : { prompt: cutoutPrompt }),
        });
      },
    };
    const update = (value: AiItemWorkflowResult) => {
      if (closed()) return;
      if (
        branches.includes("information") &&
        active("information") &&
        (value.information || value.informationError)
      ) {
        information = value.information;
        informationError = value.informationError;
        informationStatus =
          value.informationError || !value.information?.editorDraft
            ? "failed"
            : "success";
      }
      if (branches.includes("cutout") && active("cutout") && value.cutout) {
        cutout = value.cutout;
        cutoutStatus = value.cutout.cutout ? "success" : "failed";
      }
      publish();
    };
    try {
      const result = await runAiItemWorkflow(
        {
          mode:
            branches.length === 2
              ? "combined"
              : branches[0] === "information"
                ? "information"
                : "cutout",
          profile,
          cutoutModel,
          apiKey: key,
          image: requestImage,
          isCurrent: operationActive,
          onUpdate: update,
          onInformationPhase: (value) => {
            if (active("information")) {
              phase =
                value === "preparing"
                  ? "正在准备信息参考图…"
                  : "正在解析订单信息…";
              publish();
            }
          },
          onCutoutPhase: (value) => {
            if (active("cutout")) {
              phase =
                value === "cutting" ? "正在生成物品封面…" : "正在准备物品封面…";
              publish();
            }
          },
        },
        scopedRuntime,
      );
      update(result);
    } catch (error) {
      for (const branch of branches)
        if (active(branch) && status(branch) === "running") {
          setStatus(branch, "failed");
          if (branch === "information")
            informationError = safeAiVisionError(error, [key]);
        }
      publish();
    } finally {
      for (const branch of branches)
        if (generation(branch) === expected[branch]) delete controllers[branch];
      if (!closed()) {
        if (informationStatus !== "running" && cutoutStatus !== "running")
          phase = "";
        publish();
      }
    }
  };
  const cancel = (branch?: AiEntryBranch) => {
    if (closed()) return;
    for (const selected of branch
      ? [branch]
      : (["information", "cutout"] as AiEntryBranch[])) {
      if (status(selected) !== "running" && status(selected) !== "idle")
        continue;
      if (selected === "information") informationGeneration++;
      else cutoutGeneration++;
      controllers[selected]?.abort();
      delete controllers[selected];
      setStatus(selected, "cancelled");
    }
    publish();
  };
  /**
   * One terminal snapshot for the subscribers that were still live when close
   * happened. It never carries the uploaded image, the API key or a partial
   * result, and it is delivered before the listeners are released so a view can
   * leave its spinner instead of waiting forever. A throwing subscriber cannot
   * keep the session or the remaining listeners alive.
   */
  const publishClosed = () => {
    const snapshot = getSnapshot();
    for (const listener of [...listeners]) {
      try {
        listener(snapshot);
      } catch {
        /* releasing the session must not depend on a disposed view */
      }
    }
  };
  const close = () => {
    if (closed()) return;
    // Unfinished branches become a recognizable terminal state, never pending.
    for (const branch of ["information", "cutout"] as AiEntryBranch[]) {
      if (status(branch) === "running" || status(branch) === "idle")
        setStatus(branch, "cancelled");
    }
    owner = "closed";
    informationGeneration++;
    cutoutGeneration++;
    for (const controller of Object.values(controllers)) controller?.abort();
    delete controllers.information;
    delete controllers.cutout;
    image = null;
    apiKey = "";
    information = null;
    cutout = null;
    informationError = null;
    approvedRoot = null;
    phase = "";
    publishClosed();
    listeners.clear();
  };
  return {
    getSnapshot,
    subscribe(listener) {
      if (closed()) return () => {};
      listeners.add(listener);
      listener(getSnapshot());
      return () => {
        listeners.delete(listener);
      };
    },
    async start() {
      if (started || closed()) return;
      started = true;
      await execute(
        mode === "combined" ? ["information", "cutout"] : ["information"],
      );
    },
    handoff() {
      if (owner !== "creator") return false;
      owner = "editor";
      publish();
      return true;
    },
    abandon() {
      if (owner === "creator") close();
    },
    close,
    cancel,
    async retry(branch) {
      if (
        !started ||
        closed() ||
        !image ||
        !(
          branch === "cutout"
            ? ["failed", "cancelled", "success", "ignored"]
            : ["failed", "cancelled"]
        ).includes(status(branch))
      )
        return false;
      if (branch === "information") {
        informationGeneration++;
        information = null;
        informationError = null;
      } else {
        cutoutGeneration++;
        cutout = null;
      }
      await execute([branch]);
      return true;
    },
    ignoreCutout() {
      if (closed() || cutoutStatus === "disabled" || cutoutStatus === "ignored")
        return;
      cutoutGeneration++;
      controllers.cutout?.abort();
      delete controllers.cutout;
      cutout = null;
      cutoutStatus = "ignored";
      publish();
    },
  };
}
