type Entry = { credential: string; fields: Set<string>; expiresAt: number };
// Session-only observations. Never persisted, logged or included in diagnostics.
const observations = new Map<string, Entry>();
const TTL = 6 * 60 * 60 * 1000;
function credentialIdentity(value: string): string {
  try {
    const data = Data.fromRawString(value);
    return data ? Crypto.sha256(data).toHexString() : "";
  } catch {
    return "";
  }
}
function identity(root: string, endpoint: string, model: string) {
  return JSON.stringify([root, endpoint, model]);
}
export function observedAiVisionFields(
  root: string,
  endpoint: string,
  model: string,
  credential: string,
  now: number,
): string[] {
  const key = identity(root, endpoint, model);
  const entry = observations.get(key);
  if (
    !entry ||
    !credentialIdentity(credential) ||
    entry.credential !== credentialIdentity(credential) ||
    entry.expiresAt <= now
  ) {
    observations.delete(key);
    return [];
  }
  return [...entry.fields];
}
export function observeAiVisionFields(
  root: string,
  endpoint: string,
  model: string,
  credential: string,
  fields: string[],
  now: number,
): void {
  const accepted = fields.filter((x) =>
    [
      "response_format",
      "reasoning",
      "reasoning_effort",
      "temperature",
    ].includes(x),
  );
  if (!accepted.length) return;
  const key = identity(root, endpoint, model);
  const previous = observedAiVisionFields(
    root,
    endpoint,
    model,
    credential,
    now,
  );
  if (observations.size >= 24 && !observations.has(key))
    observations.delete(observations.keys().next().value!);
  observations.set(key, {
    credential: credentialIdentity(credential),
    fields: new Set([...previous, ...accepted]),
    expiresAt: now + TTL,
  });
}
export function clearAiVisionObservations(): void {
  observations.clear();
}
export function clearAiVisionCapabilities(
  root: string,
  endpoint: string,
  model: string,
): void {
  observations.delete(identity(root, endpoint, model));
}
