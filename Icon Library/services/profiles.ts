import { removeProfilePat } from "./github";
import { nextId } from "./id";
import type {
  IconLibrarySettings,
  RepoProfile,
  RepoProfileStore,
} from "./models";
import { defaultSettings, normalizeSettings } from "./settings";

const STORE_KEY = "icon_library_profiles_v1";
const LEGACY_SETTINGS_KEY = "icon_library_settings_v3";
const LEGACY_MIGRATION_KEY = "icon_library_profiles_legacy_migrated_v1";
let lastKnownStore: RepoProfileStore | null = null;

function emptyStore(): RepoProfileStore {
  return { profiles: [], activeId: null };
}

function migrateLegacySettings(): RepoProfileStore {
  if (Storage.get<boolean | null>(LEGACY_MIGRATION_KEY)) {
    return emptyStore();
  }
  const legacy = Storage.get<Partial<IconLibrarySettings> | null>(
    LEGACY_SETTINGS_KEY,
  );
  const settings = normalizeSettings(legacy);

  // 旧数据可能只是一个空壳（用户从未真正配置），此时不生成 profile。
  if (!settings.owner || !settings.repo) {
    Storage.set(LEGACY_MIGRATION_KEY, true);
    return emptyStore();
  }

  const profile: RepoProfile = {
    id: nextId("repo"),
    label: settings.repo,
    settings,
  };

  // 旧全局 token 已废弃：多仓库下每个 profile 独立填写 PAT，不再迁移旧凭证。
  const store = saveStore({
    profiles: [profile],
    activeId: profile.id,
  });
  Storage.set(LEGACY_MIGRATION_KEY, true);
  return store;
}

export function asProfileStore(value: unknown): RepoProfileStore {
  if (!value || typeof value !== "object") {
    return emptyStore();
  }
  const record = value as Partial<RepoProfileStore>;
  const seenIds = new Set<string>();
  const profiles = Array.isArray(record.profiles)
    ? record.profiles.flatMap((item) => {
        if (
          !item ||
          typeof item !== "object" ||
          typeof item.id !== "string" ||
          typeof item.label !== "string" ||
          !item.settings ||
          typeof item.settings !== "object" ||
          seenIds.has(item.id)
        ) {
          return [];
        }
        seenIds.add(item.id);
        return [{
          id: item.id,
          label: item.label.trim() || "未命名仓库",
          settings: normalizeSettings(item.settings),
        }];
      })
    : [];
  const activeId =
    typeof record.activeId === "string" &&
    profiles.some((item) => item.id === record.activeId)
      ? record.activeId
      : (profiles[0]?.id ?? null);
  return { profiles, activeId };
}

export function loadProfileStore(): RepoProfileStore {
  let raw: RepoProfileStore | null;
  try {
    raw = Storage.get<RepoProfileStore | null>(STORE_KEY);
  } catch {
    // 读取失败时不能回退执行迁移，否则可能用旧单仓配置覆盖现有多 profile。
    if (lastKnownStore) {
      return lastKnownStore;
    }
    throw new Error("读取仓库配置失败，请重开应用后重试。");
  }

  if (raw != null) {
    if (typeof raw !== "object") {
      throw new Error("仓库配置格式损坏，请先备份后再重置。");
    }
    const store = asProfileStore(raw);
    lastKnownStore = store;
    return store;
  }

  // 只有明确不存在新 store 时，才尝试一次旧单实例配置迁移。
  try {
    const migrated = migrateLegacySettings();
    if (migrated.profiles.length > 0) {
      return migrated;
    }
  } catch {
    /* fall through to empty */
  }

  return emptyStore();
}

function saveStore(store: RepoProfileStore): RepoProfileStore {
  Storage.set(STORE_KEY, store);
  lastKnownStore = store;
  return store;
}

export function currentProfile(
  store: RepoProfileStore = loadProfileStore(),
): RepoProfile | null {
  return store.profiles.find((item) => item.id === store.activeId) ?? null;
}

export function currentSettings(
  store: RepoProfileStore = loadProfileStore(),
): IconLibrarySettings {
  return currentProfile(store)?.settings ?? defaultSettings();
}

export function selectProfile(id: string): RepoProfileStore {
  const store = loadProfileStore();
  if (!store.profiles.some((item) => item.id === id)) {
    throw new Error("仓库配置不存在。");
  }
  return saveStore({ ...store, activeId: id });
}

export function upsertProfile(
  input: {
    id?: string;
    label: string;
    settings: IconLibrarySettings;
  },
): RepoProfileStore {
  const store = loadProfileStore();
  const nextLabel = input.label.trim() || input.settings.repo || "未命名仓库";
  const nextSettings = normalizeSettings(input.settings);

  if (input.id) {
    const found = store.profiles.some((item) => item.id === input.id);
    if (!found) {
      throw new Error("仓库配置不存在。");
    }
    const profiles = store.profiles.map((item) =>
      item.id === input.id
        ? { ...item, label: nextLabel, settings: nextSettings }
        : item,
    );
    return saveStore({
      profiles,
      activeId: store.activeId ?? input.id,
    });
  }

  const profile: RepoProfile = {
    id: nextId("repo"),
    label: nextLabel,
    settings: nextSettings,
  };
  return saveStore({
    profiles: [...store.profiles, profile],
    activeId: profile.id,
  });
}

export function renameProfile(
  profileId: string,
  label: string,
): RepoProfileStore {
  const nextLabel = label.trim();
  if (!nextLabel) {
    throw new Error("显示名称不能为空。");
  }
  if (nextLabel.length > 40) {
    throw new Error("显示名称不能超过 40 个字符。");
  }

  const store = loadProfileStore();
  if (!store.profiles.some((item) => item.id === profileId)) {
    throw new Error("仓库配置不存在。");
  }
  const duplicate = store.profiles.some(
    (item) =>
      item.id !== profileId &&
      item.label.trim().toLowerCase() === nextLabel.toLowerCase(),
  );
  if (duplicate) {
    throw new Error("仓库列表中已有同名项，请换一个显示名称。");
  }

  return saveStore({
    ...store,
    profiles: store.profiles.map((item) =>
      item.id === profileId ? { ...item, label: nextLabel } : item,
    ),
  });
}

export function deleteProfile(profileId: string): RepoProfileStore {
  const store = loadProfileStore();
  const index = store.profiles.findIndex((item) => item.id === profileId);
  if (index < 0) {
    throw new Error("仓库配置不存在。");
  }

  const profiles = store.profiles.filter((item) => item.id !== profileId);
  const activeId =
    store.activeId === profileId
      ? (profiles[index]?.id ?? profiles[index - 1]?.id ?? null)
      : store.activeId;

  // 先持久化 profile store；成功后再删除 Keychain PAT，避免写入失败时丢凭证。
  const saved = saveStore({ profiles, activeId });
  try {
    removeProfilePat(profileId);
  } catch {
    // Profile 已删除且 id 不会复用；即使 Keychain 清理失败也不能让 UI 保留幽灵配置。
  }
  return saved;
}

export function saveProfileSettings(
  profileId: string,
  value: IconLibrarySettings,
): RepoProfileStore {
  const next = normalizeSettings(value);
  const store = loadProfileStore();
  const active = store.profiles.find((item) => item.id === profileId);
  if (!active) {
    throw new Error("仓库配置不存在。");
  }
  const isPlaceholder =
    active.label === "新仓库" ||
    active.label === "默认仓库" ||
    active.label.trim() === "";
  const label = isPlaceholder && next.repo ? next.repo : active.label;
  return saveStore({
    ...store,
    profiles: store.profiles.map((item) =>
      item.id === profileId
        ? { ...item, label, settings: next }
        : item,
    ),
  });
}
