const DIAGNOSTIC_LIMIT = 1200;
/** Conservative display boundary; never interpolate URL/body/error objects directly. */
export function sanitizeAiVisionDiagnostic(
  value: unknown,
  secrets: string[] = [],
): string {
  let text =
    typeof value === "string"
      ? value
      : value instanceof Error
        ? value.message
        : "AI 操作未完成";
  for (const secret of secrets.filter(Boolean))
    text = text.split(secret).join("[已脱敏]");
  text = text
    .replace(/data:image\/[^;,\s]+;base64,[A-Za-z0-9+/=]+/gi, "[图片已省略]")
    .replace(/Bearer\s+\S+/gi, "Bearer [已脱敏]")
    .replace(/\bsk-[A-Za-z0-9_-]+\b/g, "[已脱敏]")
    .replace(
      /((?:api[_-]?key|token|secret|password|authorization|cookie)\s*[=:]\s*)(?:"[^"]*"|'[^']*'|[^\s,;}&]+)/gi,
      "$1[已脱敏]",
    )
    .replace(/https?:\/\/[^\s"<>]+/gi, "[接口地址已省略]")
    .replace(/[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}/g, "[邮箱已省略]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[手机号已省略]");
  return text.length > DIAGNOSTIC_LIMIT
    ? `${text.slice(0, DIAGNOSTIC_LIMIT)}…（已截断）`
    : text;
}

export function safeAiVisionError(
  error: unknown,
  secrets: string[] = [],
): string {
  return sanitizeAiVisionDiagnostic(error, secrets);
}
