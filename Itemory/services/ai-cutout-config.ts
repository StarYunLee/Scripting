import { resolveOpenAICompatibleRoot } from "./ai-vision";

const MODEL_KEY = "itemory.aiCutout.modelSelection.v1";
const PROMPT_KEY = "itemory.aiCutout.prompt.v1";
const FORMAT_KEY = "itemory.aiCutout.requestFormat.v1";
export const AI_CUTOUT_MODEL_HINT =
  "物品图提取仅支持 GPT Image 系列模型（可带中转前缀，如 openai/gpt-image-1）";
export type AiCutoutProfile = { baseURL: string; model: string };
export type AiCutoutModelRuntime = {
  storageGet(key: string): unknown;
  storageSet(key: string, value: unknown): boolean;
};
function runtime(): AiCutoutModelRuntime {
  const storage = globalThis as {
    Storage?: {
      get(key: string): unknown;
      set(key: string, value: unknown): boolean;
    };
  };
  return {
    storageGet: (key) => storage.Storage?.get(key),
    storageSet: (key, value) => storage.Storage?.set(key, value) === true,
  };
}
export function resolveAiCutoutRoot(raw: string): string {
  if (raw.length > 2048) throw new Error("接口地址过长");
  return resolveOpenAICompatibleRoot(
    raw.trim().replace(/\/(images\/edits|images\/generations)\/?$/i, ""),
  );
}
/** Only a model ID scoped to the shared connection is stored. Never read/write a key. */
export function readAiCutoutModel(
  baseURL: string,
  rt: AiCutoutModelRuntime = runtime(),
): string {
  const root = resolveAiCutoutRoot(baseURL);
  const value = rt.storageGet(MODEL_KEY);
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  const saved = value as Record<string, unknown>;
  return saved.baseURL === root && isSupportedAiCutoutModel(saved.model)
    ? saved.model.trim()
    : "";
}
export function saveAiCutoutModel(
  baseURL: string,
  model: string,
  rt: AiCutoutModelRuntime = runtime(),
): string {
  const root = resolveAiCutoutRoot(baseURL);
  const id = model.trim();
  if (!isSupportedAiCutoutModel(id))
    throw new Error(AI_CUTOUT_MODEL_HINT);
  if (!rt.storageSet(MODEL_KEY, { baseURL: root, model: id }))
    throw new Error("图像模型未能保存");
  return id;
}

/**
 * Only GPT Image models are supported for transparent product editing.
 * Relay prefixes such as `openai/gpt-image-1` are accepted; the ID is sent unchanged.
 */
export function isSupportedAiCutoutModel(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const id = value.trim();
  return (
    id.length <= 200 &&
    /^(?:[A-Za-z0-9][A-Za-z0-9._-]*\/)*(?:gpt-image(?:-[A-Za-z0-9._-]+)?|chatgpt-image-latest)$/i.test(
      id,
    )
  );
}

/** How the Images Edits request is sent. "auto" keeps JSON first, Multipart on 404/405/415. */
export type AiCutoutRequestFormat = "auto" | "multipart" | "json";
export const AI_CUTOUT_REQUEST_FORMATS: readonly AiCutoutRequestFormat[] = [
  "auto",
  "multipart",
  "json",
];
export function aiCutoutRequestFormatLabel(format: AiCutoutRequestFormat): string {
  return format === "multipart" ? "Multipart" : format === "json" ? "JSON" : "自动（推荐）";
}
export function readAiCutoutRequestFormat(
  rt: AiCutoutModelRuntime = runtime(),
): AiCutoutRequestFormat {
  const value = rt.storageGet(FORMAT_KEY);
  return value === "multipart" || value === "json" ? value : "auto";
}
export function saveAiCutoutRequestFormat(
  format: AiCutoutRequestFormat,
  rt: AiCutoutModelRuntime = runtime(),
): AiCutoutRequestFormat {
  if (!AI_CUTOUT_REQUEST_FORMATS.includes(format))
    throw new Error("图片请求格式无效");
  if (!rt.storageSet(FORMAT_KEY, format)) throw new Error("图片请求格式未能保存");
  return format;
}
/** Preserve API-list order and deduplicate supported IDs; never invent unlisted models. */
export function listAiCutoutModels(
  models: readonly string[],
  selected: string,
): string[] {
  const candidates = selected ? [selected, ...models] : models;
  return Array.from(
    new Set(candidates.filter(isSupportedAiCutoutModel).map((id) => id.trim())),
  );
}

const MAX_CUTOUT_PROMPT = 6000;

function normalizeCutoutPrompt(value: string): string {
  return value.trim();
}

/** Custom cutout prompt is stored separately from the model selection and never touches Keychain. */
export function readAiCutoutPrompt(
  rt: AiCutoutModelRuntime = runtime(),
): string {
  const value = rt.storageGet(PROMPT_KEY);
  if (typeof value !== "string") return "";
  const prompt = normalizeCutoutPrompt(value);
  return prompt.length > 0 && prompt.length <= MAX_CUTOUT_PROMPT ? prompt : "";
}

export function saveAiCutoutPrompt(
  prompt: string,
  rt: AiCutoutModelRuntime = runtime(),
): string {
  const next = normalizeCutoutPrompt(prompt);
  if (!next) {
    if (!rt.storageSet(PROMPT_KEY, "")) throw new Error("抠图提示词未能保存");
    return "";
  }
  if (next.length > MAX_CUTOUT_PROMPT) throw new Error("抠图提示词过长");
  if (!rt.storageSet(PROMPT_KEY, next)) throw new Error("抠图提示词未能保存");
  return next;
}

export function resolveAiCutoutPrompt(
  customPrompt: string | undefined,
  fallback: string,
): string {
  const next = customPrompt?.trim() ?? "";
  return next || fallback;
}
