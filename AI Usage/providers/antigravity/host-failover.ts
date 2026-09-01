/**
 * sandbox host 对正式账号常返回 403/404；这类状态应继续尝试后续生产 host。
 * 401/429 等更像凭证或全局限流，不必在坏 host 与好 host 间空转。
 */
export function shouldTryNextCodeAssistHost(
  status: number | undefined,
): boolean {
  return status === 403 || status === 404;
}

/** host 循环是否因当前 HTTP 状态提前结束（不再试后续 host）。 */
export function shouldStopCodeAssistHostLoop(
  status: number | undefined,
): boolean {
  if (status == null || status < 400 || status >= 500) return false;
  return !shouldTryNextCodeAssistHost(status);
}
