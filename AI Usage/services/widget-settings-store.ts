export type ReloadableSettings = {
  reloadMinutes: number;
};

type ProfileRegistry<TProfile extends object> = {
  profiles: Record<string, TProfile>;
};

type WidgetSettingsStoreOptions<
  TSettings extends ReloadableSettings,
  TProfile extends object,
> = {
  settingsKey: string;
  profileSettingsKey: string;
  defaults: TSettings;
  sanitizeProfile(value: unknown, fallback: TProfile): TProfile;
  profileDefaults: TProfile;
  buildSettings(value: unknown, defaults: TSettings): TSettings;
  merge(settings: TSettings, profile: TProfile): TSettings;
  migrateSettings?: (value: unknown, next: TSettings) => boolean;
  invalidProfileRegistry?: "ignore" | "remove";
};

export type WidgetSettingsStore<
  TSettings extends ReloadableSettings,
  TProfile extends object,
> = {
  getSettings(): TSettings;
  getEffectiveSettings(profileId?: string | null): TSettings;
  setProfileSettings(profileId: string, patch: Partial<TProfile>): TSettings;
  clearProfileSettings(profileId: string): TSettings;
  setReloadMinutes(reloadMinutes: number): TSettings;
};

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function sameObjectValues(
  left: object,
  right: Record<string, unknown>,
): boolean {
  const leftRecord = left as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(right);
  if (leftKeys.length !== rightKeys.length) return false;
  return leftKeys.every((key) => {
    const a = leftRecord[key];
    const b = right[key];
    if (Array.isArray(a) && Array.isArray(b)) {
      return a.length === b.length && a.every((item, index) => item === b[index]);
    }
    return a === b;
  });
}

export function clampReloadMinutes(value: unknown, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 5
    ? Math.min(value, 360)
    : fallback;
}

/**
 * Widget 全局设置与账号覆盖的共享存储。两个注册表都在单次脚本运行内缓存；
 * Provider 只需要提供字段校验和 merge 规则。
 */
export function createWidgetSettingsStore<
  TSettings extends ReloadableSettings,
  TProfile extends object,
>(
  options: WidgetSettingsStoreOptions<TSettings, TProfile>,
): WidgetSettingsStore<TSettings, TProfile> {
  let settingsCache: TSettings | null = null;
  let profileCache: ProfileRegistry<TProfile> | null = null;

  function writeSettings(value: TSettings): TSettings {
    try {
      if (Storage.set(options.settingsKey, value)) settingsCache = value;
    } catch {
      /* ignore */
    }
    return settingsCache || value;
  }

  function getSettings(): TSettings {
    if (settingsCache) return settingsCache;
    try {
      const value = Storage.get<unknown>(options.settingsKey);
      const next = options.buildSettings(value, options.defaults);
      settingsCache = next;
      if (options.migrateSettings?.(value, next)) writeSettings(next);
      return settingsCache;
    } catch {
      settingsCache = { ...options.defaults };
      return settingsCache;
    }
  }

  function writeProfiles(
    value: ProfileRegistry<TProfile>,
  ): ProfileRegistry<TProfile> {
    try {
      if (Storage.set(options.profileSettingsKey, value)) profileCache = value;
    } catch {
      /* ignore */
    }
    return profileCache || value;
  }

  function readProfiles(): ProfileRegistry<TProfile> {
    if (profileCache) return profileCache;
    try {
      const value = Storage.get<unknown>(options.profileSettingsKey);
      if (!isObject(value) || !isObject(value.profiles)) {
        if (value != null && options.invalidProfileRegistry === "remove") {
          Storage.remove(options.profileSettingsKey);
        }
        profileCache = { profiles: {} };
        return profileCache;
      }
      const profiles: Record<string, TProfile> = {};
      let changed = false;
      for (const [profileId, settings] of Object.entries(value.profiles)) {
        if (!profileId.trim() || !isObject(settings)) {
          changed = true;
          continue;
        }
        const sanitized = options.sanitizeProfile(
          settings,
          options.profileDefaults,
        );
        profiles[profileId] = sanitized;
        if (!sameObjectValues(sanitized, settings)) changed = true;
      }
      profileCache = { profiles };
      if (changed) writeProfiles(profileCache);
      return profileCache;
    } catch {
      profileCache = { profiles: {} };
      return profileCache;
    }
  }

  function getEffectiveSettings(profileId?: string | null): TSettings {
    const global = getSettings();
    if (!profileId) return global;
    const profile = readProfiles().profiles[profileId];
    return profile ? options.merge(global, profile) : global;
  }

  return {
    getSettings,
    getEffectiveSettings,
    setProfileSettings(profileId, patch) {
      if (!profileId) return getSettings();
      const global = getSettings();
      const registry = readProfiles();
      const current =
        registry.profiles[profileId] ||
        options.sanitizeProfile(global, options.profileDefaults);
      const next = options.sanitizeProfile({ ...current, ...patch }, current);
      const persisted = writeProfiles({
        profiles: { ...registry.profiles, [profileId]: next },
      });
      const saved = persisted.profiles[profileId];
      return saved ? options.merge(global, saved) : global;
    },
    clearProfileSettings(profileId) {
      if (!profileId) return getSettings();
      const registry = readProfiles();
      if (profileId in registry.profiles) {
        const profiles = { ...registry.profiles };
        delete profiles[profileId];
        writeProfiles({ profiles });
      }
      return getSettings();
    },
    setReloadMinutes(reloadMinutes) {
      const current = getSettings();
      return writeSettings({
        ...current,
        reloadMinutes: clampReloadMinutes(reloadMinutes, current.reloadMinutes),
      });
    },
  };
}
