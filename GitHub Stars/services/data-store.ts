import { hasToken } from "../auth/token";
import type {
  AppState,
  ForkSyncStatus,
  GitHubError,
  GitHubListDetail,
  GitHubListSummary,
  GitHubRepository,
  GitHubUser,
  MembershipSnapshot,
  OwnedRepository,
  ResourceSyncTimestamps,
  RepositoryMembership,
} from "../types";
import {
  clearCache,
  clearDetailCaches,
  clearForkStatusesCache,
  clearMembershipCache,
  clearOwnedRepositoriesCache,
  clearRepositoryPreferences,
  loadCache,
  loadDetailCache,
  loadForkStatusesCache,
  loadMembershipCache,
  loadOwnedRepositoriesCache,
  loadRepositoryPreferences,
  removeDetailCache,
  saveCache,
  saveDetailCache,
  saveForkStatusesCache,
  saveMembershipCache,
  saveOwnedRepositoriesCache,
  saveRepositoryPreferences,
} from "./cache";
import { classifyForkSyncState } from "./fork-status";
import { mapWithConcurrency } from "./request-retry";
import { normalizeThrownError } from "./errors";
import {
  createUserList,
  deleteUserList,
  fetchContributionsByYear,
  fetchListItems,
  fetchListSummaries,
  fetchViewerSummary,
  updateUserList,
  updateUserListsForItem,
} from "./github-graphql";
import {
  archiveOwnedRepository as archiveOwnedRepositoryRequest,
  fetchForkUpstreamComparison,
  fetchOwnedRepositories,
  fetchRepository,
  fetchStarredRepositories,
  fetchViewer,
  starRepository,
  syncOwnedFork as syncOwnedForkRequest,
  unstarRepository,
  updateOwnedRepository as updateOwnedRepositoryRequest,
  type UpdateOwnedRepositoryInput,
} from "./github-rest";
import {
  normalizeListDetail,
  normalizeListSummary,
  normalizeOwnedRepository,
  normalizeRestRepository,
  normalizeViewer,
} from "./normalizer";

type Listener = (state: AppState) => void;
type StoreScope =
  "stars" | "lists" | "repositories" | "settings" | `detail:${string}`;

type RefreshResource = "viewer" | "stars" | "lists" | "ownedRepositories";

type InFlightRequest<T> = {
  generation: number;
  revision: number;
  foreground: boolean;
  promise: Promise<T>;
};

type ListDetailRequestKind = "refresh" | "next";
type ListDetailRequest = {
  kind: ListDetailRequestKind;
  promise: Promise<void>;
};

type MembershipDetailRequest = {
  generation: number;
  promise: Promise<GitHubListDetail>;
};

type MembershipRefreshRequest = {
  generation: number;
  listsRevision: number;
  sourceFingerprint: string;
  promise: Promise<boolean>;
};

function repositoriesEqual(
  left: GitHubRepository,
  right: GitHubRepository,
): boolean {
  return (
    left.nodeId === right.nodeId &&
    left.restId === right.restId &&
    left.name === right.name &&
    left.fullName === right.fullName &&
    left.description === right.description &&
    left.htmlUrl === right.htmlUrl &&
    left.language === right.language &&
    left.stargazersCount === right.stargazersCount &&
    left.forksCount === right.forksCount &&
    left.pushedAt === right.pushedAt &&
    left.starredAt === right.starredAt &&
    left.updatedAt === right.updatedAt &&
    left.owner.login === right.owner.login &&
    left.owner.avatarUrl === right.owner.avatarUrl
  );
}

function listSummariesEqual(
  left: GitHubListSummary,
  right: GitHubListSummary,
): boolean {
  return (
    left.id === right.id &&
    left.name === right.name &&
    left.description === right.description &&
    left.isPrivate === right.isPrivate &&
    left.itemCount === right.itemCount &&
    left.createdAt === right.createdAt &&
    left.updatedAt === right.updatedAt &&
    left.lastAddedAt === right.lastAddedAt
  );
}

function repositoryArraysEqual(
  left: readonly GitHubRepository[],
  right: readonly GitHubRepository[],
): boolean {
  return (
    left.length === right.length &&
    left.every((repository, index) => {
      const other = right[index];
      return other !== undefined && repositoriesEqual(repository, other);
    })
  );
}

function listArraysEqual(
  left: readonly GitHubListSummary[],
  right: readonly GitHubListSummary[],
): boolean {
  return (
    left.length === right.length &&
    left.every((list, index) => {
      const other = right[index];
      return other !== undefined && listSummariesEqual(list, other);
    })
  );
}

function viewerEqual(left: GitHubUser | null, right: GitHubUser): boolean {
  if (!left) return false;
  return (
    left.login === right.login &&
    left.name === right.name &&
    left.bio === right.bio &&
    left.avatarUrl === right.avatarUrl &&
    left.location === right.location &&
    left.company === right.company &&
    left.websiteUrl === right.websiteUrl &&
    left.twitterUsername === right.twitterUsername &&
    JSON.stringify(left.status) === JSON.stringify(right.status) &&
    left.followersCount === right.followersCount &&
    left.followingCount === right.followingCount &&
    left.publicReposCount === right.publicReposCount &&
    left.starredRepositoriesCount === right.starredRepositoriesCount &&
    left.listsCount === right.listsCount &&
    JSON.stringify(left.topLanguages ?? []) ===
      JSON.stringify(right.topLanguages ?? []) &&
    repositoryArraysEqual(
      left.pinnedRepositories ?? [],
      right.pinnedRepositories ?? [],
    ) &&
    JSON.stringify(left.contributionYears ?? []) ===
      JSON.stringify(right.contributionYears ?? []) &&
    JSON.stringify(left.contributionsByYear ?? {}) ===
      JSON.stringify(right.contributionsByYear ?? {})
  );
}

function membershipSourceFingerprint(
  lists: readonly GitHubListSummary[],
): string {
  return lists
    .map((list) => [
      list.id,
      list.name,
      list.description,
      list.isPrivate,
      list.itemCount,
      list.createdAt,
      list.updatedAt,
      list.lastAddedAt,
    ])
    .sort((left, right) => String(left[0]).localeCompare(String(right[0])))
    .map((item) => JSON.stringify(item))
    .join("|");
}

const MEMBERSHIP_CACHE_TTL_MS = 5 * 60 * 1000;
const FORK_STATUS_TTL_MS = 20 * 60 * 1000;

function unknownForkStatus(): ForkSyncStatus {
  return {
    state: "unknown",
    upstreamFullName: null,
    upstreamBranch: null,
    aheadBy: 0,
    behindBy: 0,
    checkedAt: null,
    error: null,
  };
}

function isForkStatusFresh(status: ForkSyncStatus | undefined): boolean {
  if (!status?.checkedAt || status.state === "checking") return false;
  const checkedAt = new Date(status.checkedAt).getTime();
  return (
    Number.isFinite(checkedAt) && Date.now() - checkedAt < FORK_STATUS_TTL_MS
  );
}

const STARTUP_REVALIDATE_MIN_INTERVAL_MS = 2 * 60 * 1000;
const BACKGROUND_BACKOFF_BASE_MS = 30 * 1000;
const BACKGROUND_BACKOFF_MAX_MS = 10 * 60 * 1000;

type ReadResource =
  | "stars"
  | "lists"
  | "viewer"
  | "ownedRepositories"
  | "memberships"
  | "details"
  | "contributions";

type ReadRetryState = {
  failures: number;
  retryAt: number;
};

function parseRetryAfterMs(value: string | null): number | null {
  if (!value) return null;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp)
    ? Math.max(0, timestamp - Date.now())
    : null;
}

function isRetryableReadError(error: unknown): boolean {
  const normalized = asError(error);
  return (
    normalized.kind === "network" ||
    normalized.kind === "server" ||
    normalized.kind === "rate_limited"
  );
}

function isMembershipCacheFresh(
  snapshot: MembershipSnapshot | null,
  fingerprint: string,
): boolean {
  if (!snapshot || snapshot.sourceFingerprint !== fingerprint) return false;
  const savedAt = new Date(snapshot.savedAt).getTime();
  return (
    Number.isFinite(savedAt) && Date.now() - savedAt < MEMBERSHIP_CACHE_TTL_MS
  );
}

function isStale(value: string | null, maxAge: number): boolean {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  return !Number.isFinite(timestamp) || Date.now() - timestamp >= maxAge;
}

function cachedResourceSyncedAt(
  cached: {
    savedAt: string;
    resourceSyncedAt?: ResourceSyncTimestamps;
  } | null,
  memberships: MembershipSnapshot | null,
  ownedRepositories: { savedAt: string } | null,
): ResourceSyncTimestamps {
  const fallback = cached?.savedAt ?? null;
  return {
    viewer: cached?.resourceSyncedAt?.viewer ?? fallback,
    stars: cached?.resourceSyncedAt?.stars ?? fallback,
    lists: cached?.resourceSyncedAt?.lists ?? fallback,
    ownedRepositories:
      cached?.resourceSyncedAt?.ownedRepositories ??
      ownedRepositories?.savedAt ??
      null,
    memberships:
      cached?.resourceSyncedAt?.memberships ?? memberships?.savedAt ?? null,
  };
}

function initialState(): AppState {
  const cached = loadCache();
  const hasCachedMain = cached !== null;
  const preferences = loadRepositoryPreferences();
  const ownedRepositoriesCache = loadOwnedRepositoriesCache();
  const memberships = loadMembershipCache();
  const forkStatusesCache = loadForkStatusesCache();
  const ownedRepositories = preferences.includePrivateRepositories
    ? (ownedRepositoriesCache?.repositories ?? [])
    : (ownedRepositoriesCache?.repositories ?? []).filter(
        (repository) => repository.visibility === "public",
      );
  return {
    tokenConfigured: hasToken(),
    includePrivateRepositories: preferences.includePrivateRepositories,
    viewer: cached?.viewer ?? null,
    stars: cached?.stars ?? [],
    lists: cached?.lists ?? [],
    ownedRepositories,
    forkStatuses: forkStatusesCache?.statuses ?? {},
    memberships,
    resourceSyncedAt: cachedResourceSyncedAt(
      cached,
      memberships,
      ownedRepositoriesCache,
    ),
    listDetails: {},
    viewerState: cached?.viewer ? "loaded" : "idle",
    starsState: cached?.stars ? "loaded" : "idle",
    listsState: cached?.lists ? "loaded" : "idle",
    ownedRepositoriesState: ownedRepositoriesCache ? "loaded" : "idle",
    detailStates: {},
    viewerError: null,
    starsError: null,
    listsError: null,
    ownedRepositoriesError: null,
    detailErrors: {},
    lastSyncedAt: cached?.savedAt ?? null,
    hasCachedMain,
  };
}

function asError(error: unknown): GitHubError {
  if (
    typeof error === "object" &&
    error !== null &&
    "kind" in error &&
    "message" in error
  ) {
    return error as GitHubError;
  }
  return normalizeThrownError(error);
}

export class GitHubDataStore {
  private state: AppState = initialState();
  private scopedListeners = new Map<StoreScope, Set<Listener>>();
  private starsRefresh: InFlightRequest<boolean> | null = null;
  private listsRefresh: InFlightRequest<boolean> | null = null;
  private viewerRefresh: InFlightRequest<boolean> | null = null;
  private ownedRepositoriesRefresh: InFlightRequest<boolean> | null = null;
  private membershipRefresh: MembershipRefreshRequest | null = null;
  private listDetailRequests = new Map<string, ListDetailRequest>();
  private listDetailGenerations = new Map<string, number>();
  private membershipDetailRequests = new Map<string, MembershipDetailRequest>();
  private repositoryMutations = new Map<string, Promise<void>>();
  private listMutations = new Map<string, Promise<void>>();
  private membershipMutations = new Map<string, Promise<void>>();
  private forkStatusRefreshes = new Map<string, Promise<ForkSyncStatus>>();
  private mutationQueueGeneration = 0;
  private readRetryStates = new Map<ReadResource, ReadRetryState>();
  private resourceRevisions: Record<RefreshResource, number> = {
    viewer: 0,
    stars: 0,
    lists: 0,
    ownedRepositories: 0,
  };
  private sessionGeneration = 0;

  getState(): AppState {
    return this.state;
  }

  subscribe(scope: StoreScope, listener: Listener): () => void {
    const listeners = this.scopedListeners.get(scope) ?? new Set<Listener>();
    listeners.add(listener);
    this.scopedListeners.set(scope, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.scopedListeners.delete(scope);
    };
  }

  private update(
    patch: Partial<AppState>,
    scopes: readonly StoreScope[],
  ): void {
    this.state = { ...this.state, ...patch };
    const notified = new Set<Listener>();
    for (const scope of scopes) {
      for (const listener of this.scopedListeners.get(scope) ?? []) {
        if (notified.has(listener)) continue;
        notified.add(listener);
        listener(this.state);
      }
    }
  }

  private isCurrentGeneration(generation: number): boolean {
    return generation === this.sessionGeneration;
  }

  private currentRevision(resource: RefreshResource): number {
    return this.resourceRevisions[resource];
  }

  private bumpRevision(...resources: RefreshResource[]): void {
    for (const resource of resources) {
      this.resourceRevisions[resource] += 1;
    }
  }

  private isCurrentRequest(
    resource: RefreshResource,
    generation: number,
    revision: number,
  ): boolean {
    return (
      this.isCurrentGeneration(generation) &&
      this.currentRevision(resource) === revision
    );
  }

  private canStartSilentRead(resource: ReadResource): boolean {
    const retryState = this.readRetryStates.get(resource);
    return !retryState || retryState.retryAt <= Date.now();
  }

  private skippedRefresh(
    generation: number,
    revision: number,
  ): InFlightRequest<boolean> {
    return {
      generation,
      revision,
      foreground: false,
      promise: Promise.resolve(false),
    };
  }

  private noteReadSuccess(resource: ReadResource): void {
    this.readRetryStates.delete(resource);
  }

  private noteReadFailure(resource: ReadResource, error: unknown): void {
    const normalized = asError(error);
    if (!isRetryableReadError(normalized)) {
      this.readRetryStates.delete(resource);
      return;
    }
    const previous = this.readRetryStates.get(resource);
    const retryAfter = parseRetryAfterMs(normalized.retryAfter);
    const fallback = Math.min(
      BACKGROUND_BACKOFF_MAX_MS,
      BACKGROUND_BACKOFF_BASE_MS * 2 ** (previous?.failures ?? 0),
    );
    this.readRetryStates.set(resource, {
      failures: (previous?.failures ?? 0) + 1,
      retryAt: Date.now() + Math.max(1000, retryAfter ?? fallback),
    });
  }

  private recordReadResult(
    resource: ReadResource,
    error: unknown | null,
  ): void {
    if (error === null) this.noteReadSuccess(resource);
    else this.noteReadFailure(resource, error);
  }

  private invalidateSession(): void {
    this.sessionGeneration += 1;
    this.mutationQueueGeneration += 1;
    this.repositoryMutations.clear();
    this.listMutations.clear();
    this.membershipMutations.clear();
    this.forkStatusRefreshes.clear();
    this.readRetryStates.clear();
  }

  private nextListDetailGeneration(listId: string): number {
    const generation = (this.listDetailGenerations.get(listId) ?? 0) + 1;
    this.listDetailGenerations.set(listId, generation);
    return generation;
  }

  private isCurrentListDetailGeneration(
    listId: string,
    generation: number,
  ): boolean {
    return this.listDetailGenerations.get(listId) === generation;
  }

  private saveForkStatuses(): void {
    saveForkStatusesCache({
      version: 1,
      statuses: this.state.forkStatuses,
      savedAt: new Date().toISOString(),
    });
  }

  private updateForkStatus(repositoryId: string, status: ForkSyncStatus): void {
    const forkStatuses = {
      ...this.state.forkStatuses,
      [repositoryId]: status,
    };
    this.update({ forkStatuses }, ["repositories"]);
    this.saveForkStatuses();
  }

  private saveNonSensitiveCache(): void {
    saveCache({
      version: 1,
      viewer: this.state.viewer,
      stars: this.state.stars,
      lists: this.state.lists,
      savedAt: this.state.lastSyncedAt ?? new Date().toISOString(),
      resourceSyncedAt: this.state.resourceSyncedAt,
    });
    if (!this.state.hasCachedMain) {
      this.update({ hasCachedMain: true }, []);
    }
  }

  private saveCacheIfCurrent(generation: number, committed: boolean): void {
    if (committed && this.isCurrentGeneration(generation)) {
      this.saveNonSensitiveCache();
    }
  }

  private enqueueMutation<T>(
    queue: Map<string, Promise<void>>,
    key: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    const normalizedKey = key.toLowerCase();
    const queueGeneration = this.mutationQueueGeneration;
    const previous = queue.get(normalizedKey) ?? Promise.resolve();
    const run = () => {
      if (queueGeneration !== this.mutationQueueGeneration) {
        throw new Error("操作已因账户切换或本地数据清理而取消。");
      }
      return operation();
    };
    const current = previous.then(run, run);
    const tracked = current.then(
      () => undefined,
      () => undefined,
    );
    queue.set(normalizedKey, tracked);
    void tracked
      .finally(() => {
        if (queue.get(normalizedKey) === tracked) {
          queue.delete(normalizedKey);
        }
      })
      .catch(() => {});
    return current;
  }

  private enqueueRepositoryMutation<T>(
    fullName: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.enqueueMutation(this.repositoryMutations, fullName, operation);
  }

  private enqueueListMutation<T>(
    listId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.enqueueMutation(this.listMutations, listId, operation);
  }

  private enqueueMembershipMutation<T>(
    repositoryId: string,
    operation: () => Promise<T>,
  ): Promise<T> {
    return this.enqueueMutation(
      this.membershipMutations,
      repositoryId,
      operation,
    );
  }

  refreshTokenState(invalidateInFlight = false): void {
    if (invalidateInFlight) {
      this.invalidateSession();
    }
    this.update({ tokenConfigured: hasToken() }, [
      "stars",
      "lists",
      "repositories",
      "settings",
    ]);
  }

  async syncOnLaunch(): Promise<void> {
    this.refreshTokenState();
    if (!this.state.tokenConfigured) return;

    // 若本地已有 Stars 缓存，直接保持已有数据呈现，不在前台阻塞展示；
    // 仅当本地 Stars 完全为空时才阻塞加载；有缓存时在后台静默补全与校验
    const hasCachedViewer =
      this.state.hasCachedMain && Boolean(this.state.viewer);
    const hasCachedStars = this.state.hasCachedMain;
    const hasCachedLists = this.state.hasCachedMain;

    if (!hasCachedStars || !hasCachedLists || !hasCachedViewer) {
      await this.refreshAll(false);
      return;
    }

    const needsMemberships =
      this.state.lists.length > 0 &&
      (this.state.memberships === null ||
        isStale(
          this.state.resourceSyncedAt.memberships,
          MEMBERSHIP_CACHE_TTL_MS,
        ));
    const needsMainRefresh =
      isStale(
        this.state.resourceSyncedAt.viewer,
        STARTUP_REVALIDATE_MIN_INTERVAL_MS,
      ) ||
      isStale(
        this.state.resourceSyncedAt.stars,
        STARTUP_REVALIDATE_MIN_INTERVAL_MS,
      ) ||
      isStale(
        this.state.resourceSyncedAt.lists,
        STARTUP_REVALIDATE_MIN_INTERVAL_MS,
      );
    if (!needsMainRefresh && !needsMemberships) return;

    // 后台静默平滑校验，不重置 loading 遮罩状态
    void this.silentRevalidate();
  }

  private async silentRevalidate(): Promise<void> {
    const generation = this.sessionGeneration;
    const needsViewer = isStale(
      this.state.resourceSyncedAt.viewer,
      STARTUP_REVALIDATE_MIN_INTERVAL_MS,
    );
    const needsStars = isStale(
      this.state.resourceSyncedAt.stars,
      STARTUP_REVALIDATE_MIN_INTERVAL_MS,
    );
    const needsLists = isStale(
      this.state.resourceSyncedAt.lists,
      STARTUP_REVALIDATE_MIN_INTERVAL_MS,
    );
    const needsMemberships =
      this.state.lists.length > 0 &&
      (this.state.memberships === null ||
        isStale(
          this.state.resourceSyncedAt.memberships,
          MEMBERSHIP_CACHE_TTL_MS,
        ));
    const results = await Promise.allSettled([
      needsViewer
        ? this.requestViewerRefresh(true).promise
        : Promise.resolve(false),
      needsStars
        ? this.requestStarsRefresh(true).promise
        : Promise.resolve(false),
      needsLists
        ? this.requestListsRefresh(true).promise
        : Promise.resolve(false),
    ]);
    if (!this.isCurrentGeneration(generation)) return;
    if (
      results.some(
        (result): result is PromiseFulfilledResult<boolean> =>
          result.status === "fulfilled" && result.value,
      )
    ) {
      this.saveNonSensitiveCache();
    }
    const listsSucceeded =
      needsLists && results[2]?.status === "fulfilled" && results[2].value;
    if (
      (listsSucceeded || needsMemberships) &&
      this.isCurrentGeneration(generation)
    ) {
      void this.refreshMemberships(false, true).catch(() => {});
    }
  }

  async refreshAll(refreshMembershipsAfter = false): Promise<void> {
    this.refreshTokenState();
    if (!this.state.tokenConfigured) return;
    const generation = this.sessionGeneration;
    const results = await Promise.allSettled([
      this.refreshViewer(false),
      this.refreshStars(false),
      this.refreshLists(false),
    ]);
    if (!this.isCurrentGeneration(generation)) return;
    if (
      results.some(
        (result): result is PromiseFulfilledResult<void> =>
          result.status === "fulfilled",
      )
    ) {
      this.saveNonSensitiveCache();
    }
    let membershipError: unknown = null;
    if (
      refreshMembershipsAfter &&
      results[2]?.status === "fulfilled" &&
      this.isCurrentGeneration(generation)
    ) {
      try {
        await this.refreshMemberships(true);
      } catch (error) {
        membershipError = error;
      }
    }
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (rejected) throw rejected.reason;
    if (membershipError) throw membershipError;
  }

  async createEmptyList(name: string): Promise<void> {
    const generation = this.sessionGeneration;
    const created = await createUserList(name.trim(), null, false);
    if (!this.isCurrentGeneration(generation)) return;
    this.bumpRevision("lists");
    try {
      await this.refreshLists();
    } catch (error) {
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : String(error);
      throw new Error(
        `列表“${created.name}”已创建并保留，但列表摘要刷新失败：${message}`,
      );
    }
  }

  async renameList(listId: string, name: string): Promise<void> {
    return this.enqueueListMutation(listId, async () => {
      const generation = this.sessionGeneration;
      const updated = await updateUserList(listId, name.trim());
      if (!this.isCurrentGeneration(generation)) return;
      this.bumpRevision("lists");
      const lists = this.state.lists.map((list) =>
        list.id === listId ? { ...list, name: updated.name } : list,
      );
      const sourceFingerprint = membershipSourceFingerprint(lists);
      const currentMemberships = this.state.memberships;
      const memberships = currentMemberships
        ? {
            ...currentMemberships,
            repositories: Object.fromEntries(
              Object.entries(currentMemberships.repositories).map(
                ([repositoryId, values]) => [
                  repositoryId,
                  values.map((value) =>
                    value.listId === listId
                      ? { ...value, listName: updated.name }
                      : value,
                  ),
                ],
              ),
            ),
            savedAt: new Date().toISOString(),
            sourceFingerprint,
          }
        : null;
      const currentDetail = this.state.listDetails[listId];
      const listDetails = currentDetail
        ? {
            ...this.state.listDetails,
            [listId]: { ...currentDetail, name: updated.name },
          }
        : this.state.listDetails;
      if (currentDetail) saveDetailCache(listId, listDetails[listId]);
      if (memberships) saveMembershipCache(memberships);
      this.update(
        {
          lists,
          memberships,
          listDetails,
          viewer: this.state.viewer
            ? { ...this.state.viewer, listsCount: lists.length }
            : null,
        },
        ["lists", "stars", "settings", `detail:${listId}`],
      );
      this.saveNonSensitiveCache();
    });
  }

  async deleteList(listId: string): Promise<void> {
    return this.enqueueListMutation(listId, async () => {
      const generation = this.sessionGeneration;
      await deleteUserList(listId);
      if (!this.isCurrentGeneration(generation)) return;
      this.bumpRevision("lists");
      const lists = this.state.lists.filter((list) => list.id !== listId);
      const sourceFingerprint = membershipSourceFingerprint(lists);
      const currentMemberships = this.state.memberships;
      const memberships = currentMemberships
        ? {
            ...currentMemberships,
            repositories: Object.fromEntries(
              Object.entries(currentMemberships.repositories).map(
                ([repositoryId, values]) => [
                  repositoryId,
                  values.filter((value) => value.listId !== listId),
                ],
              ),
            ),
            savedAt: new Date().toISOString(),
            sourceFingerprint,
          }
        : null;
      if (memberships) saveMembershipCache(memberships);
      removeDetailCache(listId);
      const { [listId]: _removedDetail, ...listDetails } =
        this.state.listDetails;
      const { [listId]: _removedState, ...detailStates } =
        this.state.detailStates;
      const { [listId]: _removedError, ...detailErrors } =
        this.state.detailErrors;
      this.update(
        {
          lists,
          memberships,
          listDetails,
          detailStates,
          detailErrors,
          viewer: this.state.viewer
            ? { ...this.state.viewer, listsCount: lists.length }
            : null,
        },
        ["lists", "stars", "settings", `detail:${listId}`],
      );
      this.saveNonSensitiveCache();
    });
  }

  async createListForRepository(
    repositoryId: string,
    name: string,
    selectedListIds: readonly string[],
  ): Promise<string[]> {
    const generation = this.sessionGeneration;
    const created = await createUserList(name.trim(), null, false);
    if (!this.isCurrentGeneration(generation)) return [];
    this.bumpRevision("lists");
    const listIds = Array.from(new Set([...selectedListIds, created.id]));
    try {
      await this.saveRepositoryMemberships(repositoryId, listIds);
    } catch (error) {
      try {
        await this.refreshLists();
      } catch {
        // Preserve the more important partial-success error below.
      }
      const message =
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : String(error);
      throw new Error(
        `列表“${created.name}”已创建并保留，但仓库加入失败：${message}`,
      );
    }
    return listIds;
  }

  async saveRepositoryMemberships(
    repositoryId: string,
    listIds: readonly string[],
  ): Promise<void> {
    return this.enqueueMembershipMutation(repositoryId, async () => {
      const generation = this.sessionGeneration;
      const lists = await updateUserListsForItem(repositoryId, listIds);
      if (!this.isCurrentGeneration(generation)) return;
      this.bumpRevision("lists");
      const memberships: RepositoryMembership[] = lists.map((list) => ({
        listId: list.id,
        listName: list.name,
      }));
      const sourceFingerprint = membershipSourceFingerprint(this.state.lists);
      const current = this.state.memberships;
      const snapshot: MembershipSnapshot = {
        version: 1,
        repositories: {
          ...(current?.repositories ?? {}),
          [repositoryId]: memberships,
        },
        savedAt: new Date().toISOString(),
        sourceFingerprint,
      };
      saveMembershipCache(snapshot);
      this.update({ memberships: snapshot }, ["stars", "settings"]);
      try {
        await this.refreshLists();
      } catch {
        // Membership mutation succeeded; list counts can be calibrated later.
      }
    });
  }

  async unstar(repository: GitHubRepository): Promise<void> {
    return this.enqueueRepositoryMutation(repository.fullName, async () => {
      const generation = this.sessionGeneration;
      const existing = this.state.stars.some(
        (item) => item.nodeId === repository.nodeId,
      );
      if (!existing) return;
      await unstarRepository(repository.fullName);
      if (!this.isCurrentGeneration(generation)) return;
      this.bumpRevision("stars", "lists");
      const repositoryId = repository.nodeId;
      const stars = this.state.stars.filter(
        (item) => item.nodeId !== repositoryId,
      );
      const currentMemberships = this.state.memberships;
      const affectedListIds = new Set(
        (currentMemberships?.repositories[repositoryId] ?? []).map(
          (membership) => membership.listId,
        ),
      );
      const listDetails = Object.fromEntries(
        Object.entries(this.state.listDetails).map(([listId, detail]) => {
          const items = detail.items.filter(
            (item) => item.nodeId !== repositoryId,
          );
          if (items.length === detail.items.length) return [listId, detail];
          affectedListIds.add(listId);
          const next = {
            ...detail,
            items,
            itemCount: Math.max(0, detail.itemCount - 1),
          };
          saveDetailCache(listId, next);
          return [listId, next];
        }),
      );
      const lists = this.state.lists.map((list) =>
        affectedListIds.has(list.id)
          ? { ...list, itemCount: Math.max(0, list.itemCount - 1) }
          : list,
      );
      const sourceFingerprint = membershipSourceFingerprint(lists);
      const memberships = currentMemberships
        ? {
            ...currentMemberships,
            repositories: Object.fromEntries(
              Object.entries(currentMemberships.repositories).filter(
                ([id]) => id !== repositoryId,
              ),
            ),
            savedAt: new Date().toISOString(),
            sourceFingerprint,
          }
        : null;
      if (memberships) saveMembershipCache(memberships);
      this.update(
        {
          stars,
          lists,
          memberships,
          listDetails,
          viewer: this.state.viewer
            ? {
                ...this.state.viewer,
                starredRepositoriesCount: Math.max(
                  0,
                  this.state.viewer.starredRepositoriesCount - 1,
                ),
              }
            : null,
          lastSyncedAt: new Date().toISOString(),
        },
        [
          "stars",
          "lists",
          "settings",
          ...Array.from(affectedListIds).map(
            (listId) => `detail:${listId}` as const,
          ),
        ],
      );
      this.saveNonSensitiveCache();
    });
  }

  async star(fullName: string): Promise<GitHubRepository> {
    return this.enqueueRepositoryMutation(fullName, async () => {
      const generation = this.sessionGeneration;
      const existing = this.state.stars.find(
        (item) => item.fullName.toLowerCase() === fullName.toLowerCase(),
      );
      if (existing) return existing;
      await starRepository(fullName);
      const raw = await fetchRepository(fullName);
      const repository = {
        ...normalizeRestRepository(raw),
        starredAt: new Date().toISOString(),
      };
      if (!this.isCurrentGeneration(generation)) return repository;
      this.bumpRevision("stars");
      const stars = [
        repository,
        ...this.state.stars.filter((item) => item.nodeId !== repository.nodeId),
      ];
      this.update(
        {
          stars,
          viewer: this.state.viewer
            ? {
                ...this.state.viewer,
                starredRepositoriesCount:
                  this.state.viewer.starredRepositoriesCount + 1,
              }
            : null,
          lastSyncedAt: new Date().toISOString(),
        },
        ["stars", "settings"],
      );
      this.saveNonSensitiveCache();
      return repository;
    });
  }

  async refreshStarsAndMemberships(): Promise<void> {
    const generation = this.sessionGeneration;
    const results = await Promise.allSettled([
      this.refreshStars(false),
      this.refreshLists(false),
    ]);
    if (!this.isCurrentGeneration(generation)) return;
    if (
      results.some(
        (result): result is PromiseFulfilledResult<void> =>
          result.status === "fulfilled",
      )
    ) {
      this.saveNonSensitiveCache();
    }
    let membershipError: unknown = null;
    const listsResult = results[1];
    if (
      listsResult?.status === "fulfilled" &&
      this.isCurrentGeneration(generation)
    ) {
      try {
        await this.refreshMemberships(true);
      } catch (error) {
        membershipError = error;
      }
    }
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (rejected) throw rejected.reason;
    if (membershipError) throw membershipError;
  }

  async refreshListsAndMemberships(): Promise<void> {
    const generation = this.sessionGeneration;
    try {
      await this.refreshLists(false);
      if (!this.isCurrentGeneration(generation)) return;
      await this.refreshMemberships(true);
      this.saveCacheIfCurrent(generation, true);
    } catch (error) {
      this.saveCacheIfCurrent(generation, this.isCurrentGeneration(generation));
      throw error;
    }
  }

  setIncludePrivateRepositoriesPreference(enabled: boolean): void {
    saveRepositoryPreferences({
      version: 1,
      includePrivateRepositories: enabled,
    });
    this.bumpRevision("ownedRepositories");
    if (!enabled) {
      const ownedRepositories = this.state.ownedRepositories.filter(
        (repository) => repository.visibility === "public",
      );
      saveOwnedRepositoriesCache({
        version: 1,
        repositories: ownedRepositories,
        savedAt: new Date().toISOString(),
      });
      const forkStatuses = Object.fromEntries(
        Object.entries(this.state.forkStatuses).filter(([repositoryId]) =>
          ownedRepositories.some(
            (repository) =>
              repository.nodeId === repositoryId && repository.isFork,
          ),
        ),
      );
      this.update(
        {
          includePrivateRepositories: false,
          ownedRepositories,
          forkStatuses,
          ownedRepositoriesState: "loaded",
          ownedRepositoriesError: null,
        },
        ["repositories", "settings"],
      );
      return;
    }
    this.update({ includePrivateRepositories: true }, [
      "repositories",
      "settings",
    ]);
  }

  async setIncludePrivateRepositories(enabled: boolean): Promise<void> {
    this.setIncludePrivateRepositoriesPreference(enabled);
    if (!enabled) return;
    try {
      await this.refreshOwnedRepositories();
    } catch (error) {
      this.setIncludePrivateRepositoriesPreference(false);
      throw error;
    }
  }

  async ensureOwnedRepositories(): Promise<void> {
    if (
      this.state.ownedRepositoriesState === "idle" ||
      (this.state.ownedRepositoriesState === "error" &&
        this.state.ownedRepositories.length === 0)
    ) {
      await this.refreshOwnedRepositories();
      return;
    }
    // 有缓存时先直接展示，再后台校验公开仓库列表。
    void this.requestOwnedRepositoriesRefresh(true)
      .promise.then(() => this.refreshForkStatuses(false))
      .catch(() => {});
  }

  async ensurePinnedRepositories(): Promise<void> {
    if (this.state.viewer?.pinnedRepositories !== undefined) return;
    await this.refreshViewer();
  }

  private requestOwnedRepositoriesRefresh(
    silent: boolean,
  ): InFlightRequest<boolean> {
    const generation = this.sessionGeneration;
    const revision = this.currentRevision("ownedRepositories");
    const existing = this.ownedRepositoriesRefresh;
    if (existing?.generation === generation && existing.revision === revision) {
      if (!silent) {
        existing.foreground = true;
        if (this.state.ownedRepositoriesState !== "loading") {
          this.update(
            { ownedRepositoriesState: "loading", ownedRepositoriesError: null },
            ["repositories"],
          );
        }
      }
      return existing;
    }
    if (silent && !this.canStartSilentRead("ownedRepositories")) {
      return this.skippedRefresh(generation, revision);
    }

    if (!silent) {
      this.update(
        { ownedRepositoriesState: "loading", ownedRepositoriesError: null },
        ["repositories"],
      );
    }

    const includePrivateRepositories = this.state.includePrivateRepositories;
    const entry: InFlightRequest<boolean> = {
      generation,
      revision,
      foreground: !silent,
      promise: Promise.resolve(false),
    };
    const operation = (async (): Promise<boolean> => {
      try {
        const raw = await fetchOwnedRepositories(includePrivateRepositories);
        const ownedRepositories = raw.map(normalizeOwnedRepository);
        if (!this.isCurrentRequest("ownedRepositories", generation, revision))
          return false;
        const syncedAt = new Date().toISOString();
        saveOwnedRepositoriesCache({
          version: 1,
          repositories: ownedRepositories,
          savedAt: syncedAt,
        });
        this.update(
          {
            ownedRepositories,
            ownedRepositoriesState: "loaded",
            ownedRepositoriesError: null,
            resourceSyncedAt: {
              ...this.state.resourceSyncedAt,
              ownedRepositories: syncedAt,
            },
          },
          ["repositories"],
        );
        this.recordReadResult("ownedRepositories", null);
        return true;
      } catch (error) {
        if (!this.isCurrentRequest("ownedRepositories", generation, revision))
          return false;
        this.recordReadResult("ownedRepositories", error);
        this.update(
          {
            ownedRepositoriesState:
              this.state.ownedRepositories.length > 0 ? "loaded" : "error",
            ownedRepositoriesError: entry.foreground ? asError(error) : null,
          },
          ["repositories"],
        );
        throw error;
      }
    })();
    entry.promise = operation.finally(() => {
      if (this.ownedRepositoriesRefresh === entry) {
        this.ownedRepositoriesRefresh = null;
      }
    });
    this.ownedRepositoriesRefresh = entry;
    return entry;
  }

  async refreshOwnedRepositories(): Promise<void> {
    const request = this.requestOwnedRepositoriesRefresh(false);
    await request.promise;
  }

  async refreshForkStatus(
    repository: OwnedRepository,
    force = false,
  ): Promise<ForkSyncStatus> {
    if (!repository.isFork) return unknownForkStatus();
    const cached = this.state.forkStatuses[repository.nodeId];
    if (!force && isForkStatusFresh(cached)) return cached;
    const existing = this.forkStatusRefreshes.get(repository.nodeId);
    if (existing) return existing;

    const generation = this.sessionGeneration;
    this.updateForkStatus(repository.nodeId, {
      ...(cached ?? unknownForkStatus()),
      state: "checking",
      error: null,
    });
    const request = (async (): Promise<ForkSyncStatus> => {
      try {
        const comparison = await fetchForkUpstreamComparison(
          repository.fullName,
          repository.defaultBranch,
        );
        const status: ForkSyncStatus = {
          state: classifyForkSyncState(comparison.aheadBy, comparison.behindBy),
          upstreamFullName: comparison.upstreamFullName,
          upstreamBranch: comparison.upstreamBranch,
          aheadBy: comparison.aheadBy,
          behindBy: comparison.behindBy,
          checkedAt: new Date().toISOString(),
          error: null,
        };
        if (this.isCurrentGeneration(generation)) {
          this.updateForkStatus(repository.nodeId, status);
        }
        return status;
      } catch (error) {
        const status: ForkSyncStatus = {
          ...(cached ?? unknownForkStatus()),
          state: "error",
          checkedAt: new Date().toISOString(),
          error:
            typeof error === "object" && error !== null && "message" in error
              ? String(error.message)
              : String(error),
        };
        if (this.isCurrentGeneration(generation)) {
          this.updateForkStatus(repository.nodeId, status);
        }
        throw error;
      }
    })().finally(() => {
      if (this.forkStatusRefreshes.get(repository.nodeId) === request) {
        this.forkStatusRefreshes.delete(repository.nodeId);
      }
    });
    this.forkStatusRefreshes.set(repository.nodeId, request);
    return request;
  }

  async refreshForkStatuses(force = false): Promise<void> {
    const forks = this.state.ownedRepositories.filter(
      (repository) => repository.isFork && !repository.isArchived,
    );
    await mapWithConcurrency(forks, 3, async (repository) => {
      try {
        await this.refreshForkStatus(repository, force);
      } catch {
        // 单个 Fork 检查失败不阻止其他仓库继续更新状态。
      }
    });
  }

  async updateOwnedRepository(
    repository: OwnedRepository,
    input: UpdateOwnedRepositoryInput,
  ): Promise<void> {
    return this.enqueueRepositoryMutation(repository.fullName, async () => {
      const generation = this.sessionGeneration;
      const updated = normalizeOwnedRepository(
        await updateOwnedRepositoryRequest(repository.fullName, input),
      );
      if (!this.isCurrentGeneration(generation)) return;
      this.bumpRevision("ownedRepositories");
      this.replaceOwnedRepository(updated);
    });
  }

  async archiveOwnedRepository(repository: OwnedRepository): Promise<void> {
    return this.enqueueRepositoryMutation(repository.fullName, async () => {
      const generation = this.sessionGeneration;
      const updated = normalizeOwnedRepository(
        await archiveOwnedRepositoryRequest(repository.fullName),
      );
      if (!this.isCurrentGeneration(generation)) return;
      this.bumpRevision("ownedRepositories");
      this.replaceOwnedRepository(updated);
    });
  }

  async syncOwnedFork(repository: OwnedRepository): Promise<ForkSyncStatus> {
    return this.enqueueRepositoryMutation(repository.fullName, async () => {
      if (!repository.isFork || repository.isArchived) {
        throw new Error("只有未归档的 Fork 仓库可以同步上游。");
      }
      const generation = this.sessionGeneration;
      await syncOwnedForkRequest(repository.fullName, repository.defaultBranch);
      if (!this.isCurrentGeneration(generation)) return unknownForkStatus();
      this.bumpRevision("ownedRepositories");
      const [status] = await Promise.all([
        this.refreshForkStatus(repository, true),
        this.refreshOwnedRepositories(),
      ]);
      return status;
    });
  }

  private replaceOwnedRepository(repository: OwnedRepository): void {
    const ownedRepositories = this.state.ownedRepositories.map((item) =>
      item.nodeId === repository.nodeId ? repository : item,
    );
    saveOwnedRepositoriesCache({
      version: 1,
      repositories: ownedRepositories,
      savedAt: new Date().toISOString(),
    });
    this.update({ ownedRepositories }, ["repositories"]);
  }

  private requestViewerRefresh(silent: boolean): InFlightRequest<boolean> {
    const generation = this.sessionGeneration;
    const revision = this.currentRevision("viewer");
    const existing = this.viewerRefresh;
    if (existing?.generation === generation && existing.revision === revision) {
      if (!silent) {
        existing.foreground = true;
        if (this.state.viewerState !== "loading") {
          this.update({ viewerState: "loading", viewerError: null }, [
            "settings",
          ]);
        }
      }
      return existing;
    }
    if (silent && !this.canStartSilentRead("viewer")) {
      return this.skippedRefresh(generation, revision);
    }

    if (!silent) {
      this.update({ viewerState: "loading", viewerError: null }, ["settings"]);
    }

    const entry: InFlightRequest<boolean> = {
      generation,
      revision,
      foreground: !silent,
      promise: Promise.resolve(false),
    };
    const operation = (async (): Promise<boolean> => {
      try {
        const [user, summary] = await Promise.all([
          fetchViewer(),
          fetchViewerSummary(),
        ]);
        const normalized = normalizeViewer(user, summary);
        const currentViewer = this.state.viewer;
        const viewer: GitHubUser = {
          ...normalized,
          contributionsByYear: {
            ...(currentViewer?.contributionsByYear ?? {}),
            ...(normalized.contributionsByYear ?? {}),
          },
        };
        if (!this.isCurrentRequest("viewer", generation, revision))
          return false;
        const unchanged = viewerEqual(this.state.viewer, viewer);
        const syncedAt = new Date().toISOString();
        this.update(
          {
            ...(unchanged ? {} : { viewer }),
            viewerState: "loaded",
            viewerError: null,
            resourceSyncedAt: {
              ...this.state.resourceSyncedAt,
              viewer: syncedAt,
            },
            lastSyncedAt: syncedAt,
          },
          ["settings", "repositories"],
        );
        this.recordReadResult("viewer", null);
        return true;
      } catch (error) {
        if (!this.isCurrentRequest("viewer", generation, revision))
          return false;
        this.recordReadResult("viewer", error);
        this.update(
          {
            viewerState: entry.foreground ? "error" : "loaded",
            viewerError: entry.foreground ? asError(error) : null,
          },
          ["settings", "repositories"],
        );
        throw error;
      }
    })();
    entry.promise = operation.finally(() => {
      if (this.viewerRefresh === entry) this.viewerRefresh = null;
    });
    this.viewerRefresh = entry;
    return entry;
  }

  async refreshViewer(saveCacheAfter = true): Promise<void> {
    const generation = this.sessionGeneration;
    const request = this.requestViewerRefresh(false);
    const committed = await request.promise;
    this.saveCacheIfCurrent(generation, saveCacheAfter && committed);
  }

  private requestStarsRefresh(silent: boolean): InFlightRequest<boolean> {
    const generation = this.sessionGeneration;
    const revision = this.currentRevision("stars");
    const existing = this.starsRefresh;
    if (existing?.generation === generation && existing.revision === revision) {
      if (!silent) {
        existing.foreground = true;
        if (this.state.starsState !== "loading") {
          this.update({ starsState: "loading", starsError: null }, ["stars"]);
        }
      }
      return existing;
    }
    if (silent && !this.canStartSilentRead("stars")) {
      return this.skippedRefresh(generation, revision);
    }

    if (!silent) {
      this.update({ starsState: "loading", starsError: null }, ["stars"]);
    }

    const entry: InFlightRequest<boolean> = {
      generation,
      revision,
      foreground: !silent,
      promise: Promise.resolve(false),
    };
    const operation = (async (): Promise<boolean> => {
      try {
        const raw = await fetchStarredRepositories();
        const stars = raw.map(normalizeRestRepository);
        if (!this.isCurrentRequest("stars", generation, revision)) return false;
        const unchanged = repositoryArraysEqual(this.state.stars, stars);
        const syncedAt = new Date().toISOString();
        this.update(
          {
            ...(unchanged ? {} : { stars }),
            starsState: "loaded",
            starsError: null,
            resourceSyncedAt: {
              ...this.state.resourceSyncedAt,
              stars: syncedAt,
            },
            lastSyncedAt: syncedAt,
          },
          ["stars", "settings"],
        );
        this.recordReadResult("stars", null);
        return true;
      } catch (error) {
        if (!this.isCurrentRequest("stars", generation, revision)) return false;
        this.recordReadResult("stars", error);
        this.update(
          {
            starsState: entry.foreground ? "error" : "loaded",
            starsError: entry.foreground ? asError(error) : null,
          },
          ["stars", "settings"],
        );
        throw error;
      }
    })();
    entry.promise = operation.finally(() => {
      if (this.starsRefresh === entry) this.starsRefresh = null;
    });
    this.starsRefresh = entry;
    return entry;
  }

  async refreshStars(saveCacheAfter = true): Promise<void> {
    const generation = this.sessionGeneration;
    const request = this.requestStarsRefresh(false);
    const committed = await request.promise;
    this.saveCacheIfCurrent(generation, saveCacheAfter && committed);
  }

  private requestListsRefresh(silent: boolean): InFlightRequest<boolean> {
    const generation = this.sessionGeneration;
    const revision = this.currentRevision("lists");
    const existing = this.listsRefresh;
    if (existing?.generation === generation && existing.revision === revision) {
      if (!silent) {
        existing.foreground = true;
        if (this.state.listsState !== "loading") {
          this.update({ listsState: "loading", listsError: null }, ["lists"]);
        }
      }
      return existing;
    }
    if (silent && !this.canStartSilentRead("lists")) {
      return this.skippedRefresh(generation, revision);
    }

    if (!silent) {
      this.update({ listsState: "loading", listsError: null }, ["lists"]);
    }

    const entry: InFlightRequest<boolean> = {
      generation,
      revision,
      foreground: !silent,
      promise: Promise.resolve(false),
    };
    const operation = (async (): Promise<boolean> => {
      try {
        const raw = await fetchListSummaries();
        const lists = raw.map(normalizeListSummary);
        if (!this.isCurrentRequest("lists", generation, revision)) return false;
        const unchanged = listArraysEqual(this.state.lists, lists);
        const viewer = this.state.viewer
          ? { ...this.state.viewer, listsCount: lists.length }
          : null;
        const syncedAt = new Date().toISOString();
        this.update(
          {
            ...(unchanged ? {} : { lists }),
            viewer,
            listsState: "loaded",
            listsError: null,
            resourceSyncedAt: {
              ...this.state.resourceSyncedAt,
              lists: syncedAt,
            },
            lastSyncedAt: syncedAt,
          },
          ["lists", "stars", "settings"],
        );
        this.recordReadResult("lists", null);
        return true;
      } catch (error) {
        if (!this.isCurrentRequest("lists", generation, revision)) return false;
        this.recordReadResult("lists", error);
        this.update(
          {
            listsState: entry.foreground ? "error" : "loaded",
            listsError: entry.foreground ? asError(error) : null,
          },
          ["lists", "stars", "settings"],
        );
        throw error;
      }
    })();
    entry.promise = operation.finally(() => {
      if (this.listsRefresh === entry) this.listsRefresh = null;
    });
    this.listsRefresh = entry;
    return entry;
  }

  async refreshLists(saveCacheAfter = true): Promise<void> {
    const generation = this.sessionGeneration;
    const request = this.requestListsRefresh(false);
    const committed = await request.promise;
    this.saveCacheIfCurrent(generation, saveCacheAfter && committed);
  }

  async refreshMemberships(force = false, silent = false): Promise<void> {
    while (true) {
      const generation = this.sessionGeneration;
      const listsRevision = this.currentRevision("lists");
      const sourceFingerprint = membershipSourceFingerprint(this.state.lists);
      if (
        !force &&
        isMembershipCacheFresh(this.state.memberships, sourceFingerprint)
      ) {
        const syncedAt = this.state.memberships?.savedAt ?? null;
        if (syncedAt && this.state.resourceSyncedAt.memberships !== syncedAt) {
          this.update(
            {
              resourceSyncedAt: {
                ...this.state.resourceSyncedAt,
                memberships: syncedAt,
              },
            },
            ["stars", "settings"],
          );
        }
        return;
      }

      const existing = this.membershipRefresh;
      if (
        existing?.generation === generation &&
        existing.listsRevision === listsRevision
      ) {
        await existing.promise;
        if (existing.sourceFingerprint === sourceFingerprint) return;
        continue;
      }
      if (silent && !this.canStartSilentRead("memberships")) return;

      const entry: MembershipRefreshRequest = {
        generation,
        listsRevision,
        sourceFingerprint,
        promise: Promise.resolve(false),
      };
      const operation = this.performMembershipRefresh(
        generation,
        listsRevision,
        sourceFingerprint,
      );
      entry.promise = operation
        .then((committed) => {
          if (committed) this.recordReadResult("memberships", null);
          return committed;
        })
        .catch((error) => {
          if (this.isCurrentGeneration(generation)) {
            this.recordReadResult("memberships", error);
          }
          throw error;
        })
        .finally(() => {
          if (this.membershipRefresh === entry) this.membershipRefresh = null;
        });
      this.membershipRefresh = entry;
      const committed = await entry.promise;
      if (
        committed ||
        !this.isCurrentRequest("lists", generation, listsRevision)
      ) {
        return;
      }
      if (membershipSourceFingerprint(this.state.lists) !== sourceFingerprint) {
        continue;
      }
      return;
    }
  }

  private async performMembershipRefresh(
    generation: number,
    listsRevision: number,
    sourceFingerprint: string,
  ): Promise<boolean> {
    const lists = this.state.lists;
    const details = await mapWithConcurrency(lists, 3, (list) =>
      this.fetchCompleteListDetail(list, generation),
    );
    const repositories: Record<string, RepositoryMembership[]> = {};
    for (const detail of details) {
      for (const repository of detail.items) {
        const memberships = repositories[repository.nodeId] ?? [];
        memberships.push({ listId: detail.id, listName: detail.name });
        repositories[repository.nodeId] = memberships;
      }
    }
    if (
      !this.isCurrentRequest("lists", generation, listsRevision) ||
      membershipSourceFingerprint(this.state.lists) !== sourceFingerprint
    ) {
      return false;
    }
    const syncedAt = new Date().toISOString();
    const snapshot: MembershipSnapshot = {
      version: 1,
      repositories,
      savedAt: syncedAt,
      sourceFingerprint,
    };
    saveMembershipCache(snapshot);
    this.update(
      {
        memberships: snapshot,
        resourceSyncedAt: {
          ...this.state.resourceSyncedAt,
          memberships: syncedAt,
        },
      },
      ["stars", "settings"],
    );
    return true;
  }

  private fetchCompleteListDetail(
    list: GitHubListSummary,
    generation = this.sessionGeneration,
  ): Promise<GitHubListDetail> {
    const existing = this.membershipDetailRequests.get(list.id);
    if (existing?.generation === generation) return existing.promise;

    const operation = this.fetchCompleteListDetailUncached(list);
    const entry: MembershipDetailRequest = { generation, promise: operation };
    this.membershipDetailRequests.set(list.id, entry);
    void operation
      .finally(() => {
        if (this.membershipDetailRequests.get(list.id) === entry) {
          this.membershipDetailRequests.delete(list.id);
        }
      })
      .catch(() => {});
    return operation;
  }

  private async fetchCompleteListDetailUncached(
    list: GitHubListSummary,
  ): Promise<GitHubListDetail> {
    let detail: GitHubListDetail | null = null;
    let cursor: string | null = null;
    do {
      const raw = await fetchListItems(list.id, cursor);
      if (!raw) throw new Error(`分组详情不存在：${list.name}`);
      detail = normalizeListDetail(raw, detail);
      cursor = detail.hasNextPage ? detail.endCursor : null;
    } while (cursor);
    if (!detail) throw new Error(`分组详情为空：${list.name}`);
    return detail;
  }

  private startListDetailRequest(
    listId: string,
    kind: ListDetailRequestKind,
    task: () => Promise<void>,
  ): Promise<void> {
    const operation = task();
    const entry: ListDetailRequest = { kind, promise: operation };
    this.listDetailRequests.set(listId, entry);
    void operation
      .finally(() => {
        if (this.listDetailRequests.get(listId) === entry) {
          this.listDetailRequests.delete(listId);
        }
      })
      .catch(() => {});
    return operation;
  }

  private requestListDetail(
    listId: string,
    kind: ListDetailRequestKind,
    task: () => Promise<void>,
  ): Promise<void> {
    const existing = this.listDetailRequests.get(listId);
    if (!existing) return this.startListDetailRequest(listId, kind, task);
    if (kind === "refresh" && existing.kind === "next") {
      const generation = this.sessionGeneration;
      return existing.promise
        .catch(() => {})
        .then(() => {
          if (!this.isCurrentGeneration(generation)) return;
          if (this.listDetailRequests.get(listId) === existing) {
            this.listDetailRequests.delete(listId);
          }
          return this.requestListDetail(listId, kind, task);
        });
    }
    return existing.promise;
  }

  async openListDetail(listId: string): Promise<void> {
    if (!this.state.listDetails[listId]) {
      const cached = loadDetailCache(listId);
      if (cached) {
        this.update(
          {
            listDetails: { ...this.state.listDetails, [listId]: cached.detail },
            detailStates: { ...this.state.detailStates, [listId]: "loaded" },
            detailErrors: { ...this.state.detailErrors, [listId]: null },
          },
          [`detail:${listId}`],
        );
      }
    }
    await this.requestListDetail(listId, "refresh", async () => {
      const current = this.state.listDetails[listId] ?? null;
      await this.requestListDetailPage(
        listId,
        null,
        null,
        current === null,
        current !== null,
      );
    });
  }

  async refreshListDetail(listId: string): Promise<void> {
    await this.requestListDetail(listId, "refresh", () =>
      this.requestListDetailPage(listId, null, null, true, false),
    );
  }

  async loadNextListDetailPage(listId: string): Promise<void> {
    await this.requestListDetail(listId, "next", async () => {
      const current = this.state.listDetails[listId] ?? null;
      if (!current?.hasNextPage || !current.endCursor) return;
      await this.requestListDetailPage(
        listId,
        current.endCursor,
        current,
        false,
        true,
      );
    });
  }

  private async requestListDetailPage(
    listId: string,
    cursor: string | null,
    existing: GitHubListDetail | null,
    showBlockingLoading: boolean,
    preserveCurrentOnError: boolean,
  ): Promise<void> {
    const sessionGeneration = this.sessionGeneration;
    const detailGeneration = this.nextListDetailGeneration(listId);
    this.update(
      {
        detailStates: {
          ...this.state.detailStates,
          [listId]: showBlockingLoading ? "loading" : "loaded",
        },
        detailErrors: { ...this.state.detailErrors, [listId]: null },
      },
      [`detail:${listId}`],
    );
    try {
      const raw = await fetchListItems(listId, cursor);
      if (!raw) throw new Error("分组详情不存在");
      if (
        !this.isCurrentGeneration(sessionGeneration) ||
        !this.isCurrentListDetailGeneration(listId, detailGeneration)
      ) {
        return;
      }
      const detail = normalizeListDetail(raw, existing);
      this.update(
        {
          listDetails: { ...this.state.listDetails, [listId]: detail },
          detailStates: { ...this.state.detailStates, [listId]: "loaded" },
          detailErrors: { ...this.state.detailErrors, [listId]: null },
        },
        [`detail:${listId}`],
      );
      saveDetailCache(listId, detail);
    } catch (error) {
      if (
        !this.isCurrentGeneration(sessionGeneration) ||
        !this.isCurrentListDetailGeneration(listId, detailGeneration)
      ) {
        return;
      }
      this.update(
        {
          detailStates: {
            ...this.state.detailStates,
            [listId]: preserveCurrentOnError ? "loaded" : "error",
          },
          detailErrors: {
            ...this.state.detailErrors,
            [listId]: asError(error),
          },
        },
        [`detail:${listId}`],
      );
      throw error;
    }
  }

  async loadYearContributions(year: number): Promise<void> {
    if (!this.state.viewer) return;
    if (this.state.viewer.contributionsByYear?.[year]) return;
    const generation = this.sessionGeneration;

    try {
      const calendar = await fetchContributionsByYear(year);
      if (!this.isCurrentGeneration(generation) || !this.state.viewer) return;
      const updatedViewer: GitHubUser = {
        ...this.state.viewer,
        contributionsByYear: {
          ...(this.state.viewer.contributionsByYear ?? {}),
          [year]: calendar,
        },
      };
      this.update({ viewer: updatedViewer }, ["settings"]);
      saveCache({
        version: 1,
        viewer: updatedViewer,
        stars: this.state.stars,
        lists: this.state.lists,
        savedAt: this.state.lastSyncedAt ?? new Date().toISOString(),
        resourceSyncedAt: this.state.resourceSyncedAt,
      });
    } catch (error) {
      if (!this.isCurrentGeneration(generation)) return;
      throw asError(error);
    }
  }

  clearLocalData(): void {
    this.invalidateSession();
    this.listDetailRequests.clear();
    this.listDetailGenerations.clear();
    this.membershipDetailRequests.clear();
    clearCache();
    clearDetailCaches();
    clearForkStatusesCache();
    clearMembershipCache();
    clearOwnedRepositoriesCache();
    clearRepositoryPreferences();
    this.update(
      {
        viewer: null,
        viewerState: "idle",
        viewerError: null,
        includePrivateRepositories: false,
        stars: [],
        starsState: "idle",
        starsError: null,
        lists: [],
        listsState: "idle",
        listsError: null,
        ownedRepositories: [],
        forkStatuses: {},
        ownedRepositoriesState: "idle",
        ownedRepositoriesError: null,
        memberships: null,
        resourceSyncedAt: {
          viewer: null,
          stars: null,
          lists: null,
          ownedRepositories: null,
          memberships: null,
        },
        listDetails: {},
        detailStates: {},
        detailErrors: {},
        lastSyncedAt: null,
        hasCachedMain: false,
      },
      [
        "stars",
        "lists",
        "repositories",
        "settings",
        ...Array.from(this.scopedListeners.keys()).filter(
          (scope): scope is `detail:${string}` => scope.startsWith("detail:"),
        ),
      ],
    );
  }
}

export type { GitHubListDetail, GitHubRepository };
