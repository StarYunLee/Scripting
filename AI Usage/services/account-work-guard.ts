import type { ProviderId } from "../models";
const generations = new Map<string, number>();
let discarded = 0;
const key = (provider: ProviderId, profileId: string) =>
  `${provider}:${profileId}`;
/** Best-effort runtime fencing, not cross-process CAS. */
export function retireAccountWork(
  provider: ProviderId,
  profileId: string,
): void {
  const id = key(provider, profileId);
  generations.set(id, (generations.get(id) || 0) + 1);
}
export function captureAccountWork(
  provider: ProviderId,
  profileId: string,
): () => boolean {
  const id = key(provider, profileId);
  const generation = generations.get(id) || 0;
  return () => generation === (generations.get(id) || 0);
}
/** Credential comparison stays inside a short-lived closure, never in task keys or logs. */
export function captureAccountCredentialWork(
  provider: ProviderId,
  profileId: string,
  readCredential: () => string | null,
): () => boolean {
  const current = captureAccountWork(provider, profileId);
  const credential = readCredential();
  return () => current() && readCredential() === credential;
}

export function assertCurrentAccountWork(
  current: () => boolean,
  sameCredential: boolean,
): void {
  if (current() && sameCredential) return;
  discarded += 1;
  throw new Error("账号状态已变化，已丢弃旧刷新结果");
}
export function discardedAccountWorkCount(): number {
  return discarded;
}
