export function formatError(error: unknown): string {
  const raw =
    error instanceof Error && error.message ? error.message : String(error);
  const lower = raw.toLowerCase();
  if (
    lower.includes("403") ||
    lower.includes("resource not accessible by personal access token") ||
    lower.includes("permission denied") ||
    lower.includes("insufficient permission") ||
    lower.includes("push access") ||
    lower.includes("write permission") ||
    lower.includes("写入权限")
  ) {
    return "目标仓库没有写入权限。请确认 Token 已授权目标仓库，并授予 Contents: Read and write。";
  }
  if (
    lower.includes("bad credentials") ||
    lower.includes("401") ||
    lower.includes("unauthorized") ||
    lower.includes("requires authentication")
  ) {
    return "GitHub 凭证无效。请到「仓库与授权」重新保存个人访问令牌。";
  }
  if (
    lower.includes("no server is currently available") ||
    lower.includes("service unavailable") ||
    lower.includes("502") ||
    lower.includes("503") ||
    lower.includes("504")
  ) {
    return "GitHub 暂时不可用，请稍后再试。";
  }
  return raw;
}

/** 状态行展示：前缀 + 少量可见字符 + 尾 4 位，中间省略。 */
export function maskPersonalAccessToken(
  value: string | null | undefined,
): string {
  if (!value) {
    return "";
  }
  const prefixes = ["github_pat_", "ghp_", "gho_", "ghu_", "ghs_", "ghr_"];
  const prefix = prefixes.find((item) => value.startsWith(item)) ?? "";
  const rest = value.slice(prefix.length);
  if (rest.length <= 8) {
    return `${prefix}${rest.slice(0, 2)}…`;
  }
  return `${prefix}${rest.slice(0, 4)}…${rest.slice(-4)}`;
}

export class MissingProfilePatError extends Error {
  constructor(public readonly profileId: string) {
    super("当前仓库未配置个人访问令牌。");
    this.name = "MissingProfilePatError";
  }
}

export function isMissingProfilePatError(
  error: unknown,
): error is MissingProfilePatError {
  return error instanceof MissingProfilePatError;
}
