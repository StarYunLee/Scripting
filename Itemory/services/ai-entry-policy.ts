/** Production entry capability switches. Effect tests deliberately do not read this policy. */
export const AI_ENTRY_POLICY_KEY = "itemory.aiEntry.policy.v1";

export type AiEntrySwitches = {
  informationEnabled: boolean;
  cutoutEnabled: boolean;
};
export type AiEntryPolicy = Readonly<
  AiEntrySwitches & {
    mode: "information" | "combined" | null;
  }
>;
export type AiEntryPolicyRuntime = {
  storageGet(key: string): unknown;
  storageSet(key: string, value: unknown): boolean;
};

function runtime(): AiEntryPolicyRuntime {
  return {
    storageGet: (key) => Storage.get(key),
    storageSet: (key, value) => Storage.set(key, value),
  };
}
function policy(value: AiEntrySwitches): AiEntryPolicy {
  const informationEnabled = value.informationEnabled === true;
  const cutoutEnabled = informationEnabled && value.cutoutEnabled === true;
  return Object.freeze({
    informationEnabled,
    cutoutEnabled,
    mode: !informationEnabled
      ? null
      : cutoutEnabled
        ? "combined"
        : "information",
  });
}
function persist(
  value: AiEntrySwitches,
  rt: AiEntryPolicyRuntime,
): AiEntryPolicy {
  const next = policy(value);
  // Only booleans live here; models, secrets and prompts retain their separate ownership.
  if (
    !rt.storageSet(AI_ENTRY_POLICY_KEY, {
      informationEnabled: next.informationEnabled,
      cutoutEnabled: next.cutoutEnabled,
    })
  )
    throw new Error("智能录入开关未能保存");
  return next;
}

/** Initialize the new key once, never inheriting the legacy profile.enabled switch. */
export function readAiEntryPolicy(
  rt: AiEntryPolicyRuntime = runtime(),
): AiEntryPolicy {
  const saved = rt.storageGet(AI_ENTRY_POLICY_KEY);
  if (saved && typeof saved === "object" && !Array.isArray(saved)) {
    const value = saved as Record<string, unknown>;
    if (
      typeof value.informationEnabled === "boolean" &&
      typeof value.cutoutEnabled === "boolean"
    ) {
      const next = policy({
        informationEnabled: value.informationEnabled,
        cutoutEnabled: value.cutoutEnabled,
      });
      if (next.cutoutEnabled !== value.cutoutEnabled) return persist(next, rt);
      return next;
    }
  }
  return persist({ informationEnabled: false, cutoutEnabled: false }, rt);
}

/** Turning information off also clears image entry, with no hidden restore on re-enable. */
export function writeAiEntryPolicy(
  patch: Partial<AiEntrySwitches>,
  rt: AiEntryPolicyRuntime = runtime(),
): AiEntryPolicy {
  const current = readAiEntryPolicy(rt);
  return persist(
    {
      informationEnabled:
        patch.informationEnabled ?? current.informationEnabled,
      cutoutEnabled: patch.cutoutEnabled ?? current.cutoutEnabled,
    },
    rt,
  );
}
