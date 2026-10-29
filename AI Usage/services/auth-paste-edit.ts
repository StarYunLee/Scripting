import type { ProviderId } from "../models";
import { looksLikeAuthorizationInput } from "./auth-callback-input";

/** 粘贴即验证的 API Key 平台：短于此长度的整段替换不当作完整密钥。 */
const API_KEY_PASTE_PROVIDERS: ReadonlySet<ProviderId> = new Set<ProviderId>([
  "zai",
  "minimax",
  "deepseek",
]);

/** A bulk edit is only a paste candidate; the UI must also match the clipboard. */
export function isAuthorizationPasteCandidate(
  provider: ProviderId,
  previous: string,
  next: string,
): boolean {
  if (previous === next || !looksLikeAuthorizationInput(provider, next))
    return false;
  let prefix = 0;
  while (
    prefix < previous.length &&
    prefix < next.length &&
    previous[prefix] === next[prefix]
  )
    prefix++;
  let suffix = 0;
  while (
    suffix < previous.length - prefix &&
    suffix < next.length - prefix &&
    previous[previous.length - suffix - 1] === next[next.length - suffix - 1]
  )
    suffix++;
  return (
    next.length - prefix - suffix > 1 &&
    (!API_KEY_PASTE_PROVIDERS.has(provider) ||
      next.trim().replace(/^Bearer\s+/i, "").length >= 8)
  );
}
