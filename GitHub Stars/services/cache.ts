import type {
  CacheEnvelope,
  ForkStatusesCache,
  GitHubListDetail,
  MembershipSnapshot,
  OwnedRepositoriesCache,
  RepositoryPreferences,
} from "../types";

const CACHE_KEY = "github_stars_cache_v1";
const MEMBERSHIP_CACHE_KEY = "github_stars_memberships_v1";
const DETAIL_CACHE_INDEX_KEY = "github_stars_detail_index_v1";
const DETAIL_CACHE_KEY_PREFIX = "github_stars_detail_v1:";
const DETAIL_CACHE_LIMIT = 5;
const OWNED_REPOSITORIES_CACHE_KEY = "github_stars_owned_repositories_v1";
const FORK_STATUSES_CACHE_KEY = "github_stars_fork_statuses_v1";
const REPOSITORY_PREFERENCES_KEY = "github_stars_repository_preferences_v1";

export type DetailCacheRecord = {
  version: 1;
  detail: GitHubListDetail;
  savedAt: string;
};

type DetailCacheIndex = {
  version: 1;
  entries: Array<{ listId: string; lastAccessedAt: string }>;
};

export function loadCache(): CacheEnvelope | null {
  const value = Storage.get<CacheEnvelope>(CACHE_KEY);
  if (!value || value.version !== 1) return null;
  return value;
}

export function saveCache(value: CacheEnvelope): void {
  Storage.set(CACHE_KEY, value);
}

export function clearCache(): void {
  Storage.remove(CACHE_KEY);
}

export function loadMembershipCache(): MembershipSnapshot | null {
  const value = Storage.get<MembershipSnapshot>(MEMBERSHIP_CACHE_KEY);
  if (!value || value.version !== 1 || !value.repositories) return null;
  return value;
}

export function saveMembershipCache(value: MembershipSnapshot): void {
  Storage.set(MEMBERSHIP_CACHE_KEY, value);
}

export function clearMembershipCache(): void {
  Storage.remove(MEMBERSHIP_CACHE_KEY);
}

export function loadOwnedRepositoriesCache(): OwnedRepositoriesCache | null {
  const value = Storage.get<OwnedRepositoriesCache>(
    OWNED_REPOSITORIES_CACHE_KEY,
  );
  if (!value || value.version !== 1 || !Array.isArray(value.repositories)) {
    return null;
  }
  return value;
}

export function saveOwnedRepositoriesCache(
  value: OwnedRepositoriesCache,
): void {
  Storage.set(OWNED_REPOSITORIES_CACHE_KEY, value);
}

export function clearOwnedRepositoriesCache(): void {
  Storage.remove(OWNED_REPOSITORIES_CACHE_KEY);
}

export function loadForkStatusesCache(): ForkStatusesCache | null {
  const value = Storage.get<ForkStatusesCache>(FORK_STATUSES_CACHE_KEY);
  if (!value || value.version !== 1 || !value.statuses) return null;
  return value;
}

export function saveForkStatusesCache(value: ForkStatusesCache): void {
  Storage.set(FORK_STATUSES_CACHE_KEY, value);
}

export function clearForkStatusesCache(): void {
  Storage.remove(FORK_STATUSES_CACHE_KEY);
}

export function loadRepositoryPreferences(): RepositoryPreferences {
  const value = Storage.get<RepositoryPreferences>(REPOSITORY_PREFERENCES_KEY);
  if (!value || value.version !== 1) {
    return { version: 1, includePrivateRepositories: false };
  }
  return {
    version: 1,
    includePrivateRepositories: value.includePrivateRepositories === true,
  };
}

export function saveRepositoryPreferences(value: RepositoryPreferences): void {
  Storage.set(REPOSITORY_PREFERENCES_KEY, value);
}

export function clearRepositoryPreferences(): void {
  Storage.remove(REPOSITORY_PREFERENCES_KEY);
}

function detailCacheKey(listId: string): string {
  return `${DETAIL_CACHE_KEY_PREFIX}${listId}`;
}

function loadDetailCacheIndex(): DetailCacheIndex {
  const value = Storage.get<DetailCacheIndex>(DETAIL_CACHE_INDEX_KEY);
  if (!value || value.version !== 1 || !Array.isArray(value.entries)) {
    return { version: 1, entries: [] };
  }
  return value;
}

export function loadDetailCache(listId: string): DetailCacheRecord | null {
  const value = Storage.get<DetailCacheRecord>(detailCacheKey(listId));
  if (!value || value.version !== 1 || value.detail.id !== listId) return null;
  touchDetailCache(listId);
  return value;
}

export function saveDetailCache(
  listId: string,
  detail: GitHubListDetail,
): void {
  const savedAt = new Date().toISOString();
  Storage.set<DetailCacheRecord>(detailCacheKey(listId), {
    version: 1,
    detail,
    savedAt,
  });
  touchDetailCache(listId, savedAt);
}

function touchDetailCache(
  listId: string,
  lastAccessedAt = new Date().toISOString(),
): void {
  const current = loadDetailCacheIndex().entries.filter(
    (entry) => entry.listId !== listId,
  );
  current.unshift({ listId, lastAccessedAt });
  const evicted = current.splice(DETAIL_CACHE_LIMIT);
  for (const entry of evicted) Storage.remove(detailCacheKey(entry.listId));
  Storage.set<DetailCacheIndex>(DETAIL_CACHE_INDEX_KEY, {
    version: 1,
    entries: current,
  });
}

export function removeDetailCache(listId: string): void {
  Storage.remove(detailCacheKey(listId));
  const entries = loadDetailCacheIndex().entries.filter(
    (entry) => entry.listId !== listId,
  );
  Storage.set<DetailCacheIndex>(DETAIL_CACHE_INDEX_KEY, {
    version: 1,
    entries,
  });
}

export function clearDetailCaches(): void {
  const index = loadDetailCacheIndex();
  for (const entry of index.entries)
    Storage.remove(detailCacheKey(entry.listId));
  Storage.remove(DETAIL_CACHE_INDEX_KEY);
}
