import type { GitHubError, GitHubErrorKind } from "../types";

type HeaderReadableResponse = {
  status: number;
  headers: { get(name: string): string | null };
};

export function responseRetryAfter(
  response: HeaderReadableResponse,
  now = Date.now(),
): string | null {
  const retryAfter = response.headers.get("Retry-After")?.trim();
  if (retryAfter) return retryAfter;
  const reset = Number(response.headers.get("X-RateLimit-Reset"));
  if (Number.isFinite(reset) && reset > Math.floor(now / 1000)) {
    return String(Math.max(1, Math.ceil(reset - now / 1000)));
  }
  return null;
}

export function isRateLimitedResponse(
  response: HeaderReadableResponse,
): boolean {
  const retryAfter = response.headers.get("Retry-After")?.trim();
  return (
    response.status === 429 ||
    (response.status === 403 &&
      (response.headers.get("X-RateLimit-Remaining") === "0" ||
        Boolean(retryAfter)))
  );
}

export function createGitHubError(
  kind: GitHubErrorKind,
  message: string,
  status: number | null = null,
  retryAfter: string | null = null,
): GitHubError {
  return { kind, message, status, retryAfter };
}

export function errorMessage(error: unknown): string {
  if (typeof error === "object" && error !== null && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return typeof error === "string" ? error : "请求失败，请稍后重试";
}

export function displayError(error: GitHubError | null): string | null {
  if (!error) return null;
  switch (error.kind) {
    case "missing_token":
      return "请先在设置中配置 GitHub Token。";
    case "unauthorized":
      return "GitHub Token 无效或已过期，请重新配置。";
    case "forbidden":
      return error.message.includes("public_repo") ||
        error.message.includes("Not Found")
        ? error.message
        : "GitHub 拒绝了请求，可能是权限不足。";
    case "not_found":
      return error.message;
    case "rate_limited": {
      const retryAfter = error.retryAfter?.trim();
      if (!retryAfter) return "GitHub API 已限流，请稍后重试。";
      return /^\d+(?:\.\d+)?$/.test(retryAfter)
        ? `GitHub API 已限流，请在约 ${retryAfter} 秒后重试。`
        : `GitHub API 已限流，请在 ${retryAfter} 后重试。`;
    }
    case "network":
      return "网络请求失败，请检查网络后重试。";
    case "graphql":
      return `GitHub GraphQL 请求失败：${error.message}`;
    case "server":
      return "GitHub 服务暂时不可用，请稍后重试。";
    case "invalid_response":
      return "GitHub 返回了无法识别的数据格式。";
    default:
      return error.message;
  }
}

export function normalizeThrownError(error: unknown): GitHubError {
  const message = errorMessage(error);
  const lower = message.toLowerCase();
  if (
    lower.includes("network") ||
    lower.includes("fetch") ||
    lower.includes("timeout")
  ) {
    return createGitHubError("network", "网络请求失败");
  }
  return createGitHubError("unknown", message);
}
