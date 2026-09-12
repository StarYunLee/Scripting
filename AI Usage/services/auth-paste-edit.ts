import type { ProviderId } from "../models";
import { looksLikeAuthorizationInput } from "./auth-callback-input";

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
    ((provider !== "zai" && provider !== "minimax") ||
      next.trim().replace(/^Bearer\s+/i, "").length >= 8)
  );
}
