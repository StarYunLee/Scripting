export type PendingAuthorization = { createdAt: number };

export function activePendingAuthorization<T extends PendingAuthorization>(
  value: T | null,
  ttlMs: number,
  clear: () => void,
): T | null {
  if (!value) return null;
  if (
    !Number.isFinite(value.createdAt) ||
    value.createdAt <= 0 ||
    Date.now() - value.createdAt > ttlMs
  ) {
    clear();
    return null;
  }
  return value;
}
