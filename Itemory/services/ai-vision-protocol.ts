export type AiVisionOptionalParameter = "json" | "reasoning" | "temperature";
export type AiVisionAttempt = {
  number: number;
  removed: AiVisionOptionalParameter | null;
  status: number;
};

/** Retry only machine-readable errors explicitly rejecting a parameter. */
export function classifyAiVisionUnsupportedParameter(
  status: number,
  text: string,
): AiVisionOptionalParameter | null {
  if (status !== 400 && status !== 422) return null;
  let error: Record<string, unknown>;
  try {
    const body = JSON.parse(text);
    error = body?.error;
    if (!error || typeof error !== "object") return null;
  } catch {
    return null;
  }
  const code = typeof error.code === "string" ? error.code.toLowerCase() : "";
  const message =
    typeof error.message === "string" ? error.message.toLowerCase() : "";
  const param =
    typeof error.param === "string" ? error.param.toLowerCase() : "";
  const unsupported =
    code === "unsupported_parameter" ||
    code === "unsupported_value" ||
    /not supported|unsupported|does not support|not compatible/.test(message);
  if (!unsupported) return null;
  const clue = param || message;
  if (/reasoning(?:_effort)?|reasoning\.effort/.test(clue)) return "reasoning";
  if (/temperature/.test(clue)) return "temperature";
  if (/response_format|json_object|text(?:\.format|\.format\.type)/.test(clue))
    return "json";
  return null;
}

export const AI_VISION_MAX_ATTEMPTS = 4;
export const AI_VISION_TOTAL_TIMEOUT_MS = 60000;
export const AI_VISION_MAX_RESPONSE_CHARS = 512000;

/** Prefer structured Responses output; never stitch unrelated assistant messages. */
export function contentFromAiVisionPayload(payload: unknown): string {
  if (!payload || typeof payload !== "object")
    throw new Error("响应不是 JSON 对象");
  const o = payload as Record<string, unknown>;
  if (o.error) throw new Error("模型返回错误，未生成物品信息");
  if (typeof o.status === "string" && o.status !== "completed")
    throw new Error("模型响应未完整完成，请重试");
  function blocks(content: unknown): string {
    if (typeof content === "string") return content;
    if (!Array.isArray(content)) return "";
    let text = "";
    for (const entry of content) {
      if (!entry || typeof entry !== "object") continue;
      const block = entry as Record<string, unknown>;
      if (block.type === "refusal" || block.refusal)
        throw new Error("模型拒绝识别此图片，请更换图片");
      if (
        (block.type === "text" || block.type === "output_text") &&
        typeof block.text === "string"
      )
        text += block.text;
    }
    return text;
  }
  if (Array.isArray(o.output)) {
    const messages = o.output.filter(
      (x): x is Record<string, unknown> =>
        !!x &&
        typeof x === "object" &&
        (x as Record<string, unknown>).type === "message" &&
        (!(x as Record<string, unknown>).role ||
          (x as Record<string, unknown>).role === "assistant"),
    );
    if (messages.length > 1)
      throw new Error("模型返回多个消息，无法确定单物品结果");
    if (messages.length === 1) {
      const message = messages[0];
      if (message.status === "incomplete" || message.status === "failed")
        throw new Error("模型消息未完整完成，请重试");
      const text = blocks(message.content);
      if (text.trim()) return text;
    }
  }
  if (typeof o.output_text === "string" && o.output_text.trim())
    return o.output_text;
  if (Array.isArray(o.choices) && o.choices.length) {
    const choice = o.choices[0] as Record<string, unknown>;
    if (choice.finish_reason === "length")
      throw new Error("模型回复被截断，请重试");
    if (choice.finish_reason === "content_filter")
      throw new Error("模型拒绝识别此图片，请更换图片");
    const message = choice.message as Record<string, unknown> | undefined;
    if (message?.refusal) throw new Error("模型拒绝识别此图片，请更换图片");
    const text = blocks(message?.content);
    if (text.trim()) return text;
  }
  throw new Error("响应中缺少模型文本");
}
