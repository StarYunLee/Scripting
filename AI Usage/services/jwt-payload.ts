type DataRuntime = {
  fromBase64String(
    value: string,
  ): { toRawString(encoding: string): string } | null;
};

declare const Buffer:
  | {
      from(
        value: string,
        encoding: string,
      ): { toString(encoding: string): string };
    }
  | undefined;

export function parseJwtPayload(
  token: string | null,
): Record<string, unknown> | null {
  if (!token) return null;
  try {
    const part = token.split(".")[1];
    if (!part) return null;
    let base64 = part.replace(/-/g, "+").replace(/_/g, "/");
    while (base64.length % 4) base64 += "=";
    const runtime = globalThis as unknown as { Data?: DataRuntime };
    const scriptingText =
      runtime.Data?.fromBase64String(base64)?.toRawString("utf-8");
    const text =
      scriptingText ||
      (typeof Buffer !== "undefined"
        ? Buffer.from(base64, "base64").toString("utf8")
        : null);
    if (!text) return null;
    const value = JSON.parse(text);
    return value && typeof value === "object" && !Array.isArray(value)
      ? (value as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}
