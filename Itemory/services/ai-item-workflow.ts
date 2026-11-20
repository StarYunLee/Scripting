import type { AbortSignal } from "scripting";
import type { AiVisionProfile } from "./ai-vision";
import {
  runAiVisionWorkflow,
  type AiVisionWorkflowResult,
} from "./ai-vision-workflow";
import {
  runAiCutoutTest,
  buildAiCutoutDiagnostic,
  emptyCutoutMetrics,
  type AiCutoutPhase,
  type AiCutoutTestResult,
} from "./ai-cutout";
import {
  resolveAiCutoutRoot,
  isSupportedAiCutoutModel,
  AI_CUTOUT_MODEL_HINT,
} from "./ai-cutout-config";
import { sanitizeAiVisionDiagnostic } from "./ai-vision-diagnostics";

export type AiItemMode = "information" | "combined" | "cutout";
export type AiItemWorkflowResult = {
  mode: AiItemMode;
  information: AiVisionWorkflowResult | null;
  cutout: AiCutoutTestResult | null;
  informationError: string | null;
  totalMs: number;
  /** All selected branches have settled, not necessarily succeeded. */
  complete: boolean;
  /** UI may mark a retained snapshot after local cancellation; no server completion implied. */
  stopped?: boolean;
};
export type AiItemWorkflowInput = {
  mode: AiItemMode;
  profile: AiVisionProfile;
  cutoutModel: string;
  apiKey: string;
  image: UIImage;
  signal?: AbortSignal;
  isCurrent: () => boolean;
  onUpdate?: (result: AiItemWorkflowResult) => void;
  onInformationPhase?: (phase: "preparing" | "requesting") => void;
  onCutoutPhase?: (phase: AiCutoutPhase) => void;
};
export type AiItemWorkflowRuntime = {
  now(): number;
  consent(root: string, current: () => boolean): Promise<boolean>;
  information: typeof runAiVisionWorkflow;
  cutout: typeof runAiCutoutTest;
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
function safeError(error: unknown, secrets: string[] = []): string {
  const text =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "AI 操作未完成";
  return sanitizeAiVisionDiagnostic(
    text.replace(/[A-Za-z0-9+/]{128,}={0,2}/g, "[图片编码已省略]"),
    secrets,
  );
}
/** Clone/freeze plain metadata only. Native UIImage identity and ownership remain unchanged. */
function snapshot<T>(value: T, field = ""): T {
  if (field === "image" || value === null || typeof value !== "object")
    return value;
  if (Array.isArray(value))
    return Object.freeze(value.map((entry) => snapshot(entry))) as T;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return value;
  const copy: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value))
    copy[key] = snapshot(entry, key);
  return Object.freeze(copy) as T;
}
function cutoutFailure(error: string, totalMs: number): AiCutoutTestResult {
  return {
    cutout: null,
    error,
    totalMs,
    httpStatus: null,
    attempts: 0,
    track: null,
    metrics: emptyCutoutMetrics(),
  };
}
export async function runAiItemWorkflow(
  input: AiItemWorkflowInput,
  runtime: AiItemWorkflowRuntime = defaultRuntime,
): Promise<AiItemWorkflowResult> {
  const active = () => !input.signal?.aborted && input.isCurrent();
  const assertCurrent = () => {
    if (!active()) throw new Error("操作已取消");
  };
  assertCurrent();
  if (!["information", "combined", "cutout"].includes(input.mode))
    throw new Error("未知 AI 物品处理模式");
  const hasInformation = input.mode !== "cutout";
  const hasCutout = input.mode !== "information";
  // Validate every selected configuration before consent, preparation or branch calls.
  const root = resolveAiCutoutRoot(input.profile.baseURL);
  const key = input.apiKey.trim();
  if (!key) throw new Error("请先保存 API Key");
  if (
    hasInformation &&
    (!input.profile.model.trim() || input.profile.model.trim().length > 200)
  )
    throw new Error("请选择文字识别模型（最多 200 字符）");
  if (hasCutout && !isSupportedAiCutoutModel(input.cutoutModel))
    throw new Error(AI_CUTOUT_MODEL_HINT);
  const profile = snapshot({ ...input.profile, baseURL: root });
  const cutoutModel = hasCutout ? input.cutoutModel.trim() : "";
  const start = runtime.now();
  const elapsed = () => Math.max(0, runtime.now() - start);
  if (!(await runtime.consent(root, active))) {
    assertCurrent();
    throw new Error("已取消上传");
  }
  assertCurrent();
  let information: AiVisionWorkflowResult | null = null;
  let cutout: AiCutoutTestResult | null = null;
  let informationError: string | null = null;
  let informationSettled = !hasInformation;
  let cutoutSettled = !hasCutout;
  const result = (): AiItemWorkflowResult =>
    snapshot({
      mode: input.mode,
      information,
      cutout,
      informationError,
      totalMs: elapsed(),
      complete: informationSettled && cutoutSettled,
    });
  const publish = () => {
    assertCurrent();
    input.onUpdate?.(result());
    assertCurrent();
  };
  // This adapter grants only the already-confirmed root; it cannot display a second consent.
  const approvedConsent = async (
    requestedRoot: string,
    current: () => boolean,
  ) => active() && current() && resolveAiCutoutRoot(requestedRoot) === root;
  const tasks: Promise<void>[] = [];
  if (hasInformation)
    tasks.push(
      Promise.resolve().then(async () => {
        assertCurrent();
        try {
          const value = await runtime.information(
            {
              profile,
              apiKey: key,
              image: input.image,
              signal: input.signal,
              isCurrent: active,
              onPhase: (phase) => {
                assertCurrent();
                input.onInformationPhase?.(phase);
                assertCurrent();
              },
            },
            approvedConsent,
          );
          assertCurrent();
          information = snapshot({
            ...value,
            error: value.error
              ? safeError(value.error, [input.apiKey, key])
              : null,
          });
          if (!value.requestOk || !value.contractOk || !value.editorDraft)
            informationError = information.error || "文字识别未完成";
        } catch (error) {
          assertCurrent();
          informationError = safeError(error, [input.apiKey, key]);
        }
        informationSettled = true;
        publish();
      }),
    );
  if (hasCutout)
    tasks.push(
      Promise.resolve().then(async () => {
        assertCurrent();
        const cutoutStart = runtime.now();
        try {
          const value = await runtime.cutout({
            profile: { baseURL: root, model: cutoutModel },
            apiKey: key,
            image: input.image,
            signal: input.signal,
            isCurrent: active,
            onPhase: (phase) => {
              assertCurrent();
              input.onCutoutPhase?.(phase);
              assertCurrent();
            },
          });
          assertCurrent();
          cutout = snapshot({
            ...value,
            error: value.error
              ? safeError(value.error, [input.apiKey, key])
              : null,
          });
        } catch (error) {
          assertCurrent();
          cutout = snapshot(
            cutoutFailure(
              safeError(error, [input.apiKey, key]),
              Math.max(0, runtime.now() - cutoutStart),
            ),
          );
        }
        cutoutSettled = true;
        publish();
      }),
    );
  // Branch failures are data; cancellation/staleness still rejects and suppresses late callbacks.
  await Promise.all(tasks);
  assertCurrent();
  return result();
}
export function buildAiItemDiagnostic(result: AiItemWorkflowResult): string {
  const milliseconds = (n: number) =>
    Number.isFinite(n) ? `${Math.max(0, Math.round(n))}ms` : "未知";
  const lines = [
    "AI 物品处理（脱敏诊断）",
    `模式：${result.mode === "combined" ? "信息与物品图" : result.mode === "information" ? "仅信息" : "仅物品图"}`,
    `任务：${result.stopped ? "已停止本地等待，分支结束未确认" : result.complete ? "选中分支均已结束" : "处理中"}`,
  ];
  if (result.mode !== "cutout") {
    const info = result.information;
    lines.push(
      `信息识别：${result.informationError ? "未完成" : info ? "已完成" : result.stopped ? "未取得结果（已停止本地等待）" : "处理中"}`,
    );
    if (info) {
      lines.push(
        `信息 HTTP：${Number.isFinite(info.httpStatus) ? info.httpStatus : "未知"}`,
        `请求成功：${info.requestOk ? "是" : "否"} · 数据契约：${info.contractOk ? "通过" : "未通过"}`,
        `信息请求：${info.attempts.length} 次 · 耗时：${milliseconds(info.latencyMs)}`,
        `使用 JSON Object：${info.usedJsonObject ? "是" : "否"}`,
        `信息参考图：${info.imagePreparation.width}×${info.imagePreparation.height} · 缩放：${info.imagePreparation.resized ? "是" : "否"}`,
      );
    }
    if (result.informationError) lines.push(safeError(result.informationError));
  }
  if (result.mode !== "information")
    lines.push(
      result.cutout
        ? buildAiCutoutDiagnostic(result.cutout)
        : result.stopped
          ? "物品图：未取得结果（已停止本地等待）"
          : "物品图：处理中",
    );
  lines.push(`共享任务总耗时：${milliseconds(result.totalMs)}`);
  // Explicit scalar allowlist above: no rawOutput, extraction, draft, profile, key or image bytes.
  return lines.join("\n");
}
