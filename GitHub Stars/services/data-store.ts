import { hasToken } from "../auth/token";
import type {
  AppState,
  GitHubError,
  GitHubListDetail,
  GitHubListSummary,
  GitHubRepository,
  GitHubUser,
  MembershipSnapshot,
  RepositoryMembership,
} from "../types";
import {
  clearCache,
  clearDetailCaches,
  clearMembershipCache,
  loadCache,
  loadDetailCache,
  loadMembershipCache,
  removeDetailCache,
  saveCache,
  saveDetailCache,
  saveMembershipCache,
} from "./cache";
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
  fetchRepository,
  fetchStarredRepositories,
  fetchViewer,
  starRepository,
  unstarRepository,
} from "./github-rest";
import {
  normalizeListDetail,
  normalizeListSummary,
  normalizeRestRepository,
  normalizeViewer,
} from "./normalizer";

type Listener = (state: AppState) => void;
type StoreScope = "stars" | "lists" | "settings" | `detail:${string}`;

function initialState(): AppState {
  const cached = loadCache();
  return {
    tokenConfigured: hasToken(),
    viewer: cached?.viewer ?? null,
    stars: cached?.stars ?? [],
    lists: cached?.lists ?? [],
    memberships: loadMembershipCache(),
    listDetails: {},
    viewerState: cached?.viewer ? "loaded" : "idle",
    starsState: cached?.stars ? "loaded" : "idle",
    listsState: cached?.lists ? "loaded" : "idle",
    detailStates: {},
    viewerError: null,
    starsError: null,
    listsError: null,
    detailErrors: {},
    lastSyncedAt: cached?.savedAt ?? null,
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

async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await task(items[index]);
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker()),
  );
  return results;
}

export class GitHubDataStore {
  private state: AppState = initialState();
  private scopedListeners = new Map<StoreScope, Set<Listener>>();
  private membershipRefresh: Promise<void> | null = null;
  private dataGeneration = 0;

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

  private saveNonSensitiveCache(): void {
    saveCache({
      version: 1,
      viewer: this.state.viewer,
      stars: this.state.stars,
      lists: this.state.lists,
      savedAt: this.state.lastSyncedAt ?? new Date().toISOString(),
    });
  }

  refreshTokenState(): void {
    this.update({ tokenConfigured: hasToken() }, [
      "stars",
      "lists",
      "settings",
    ]);
  }

  async syncOnLaunch(): Promise<void> {
    this.refreshTokenState();
    if (!this.state.tokenConfigured) return;

    // 若本地已有 Stars 缓存，直接保持已有数据呈现，不在前台阻塞展示；
    // 仅当本地 Stars 完全为空时才阻塞加载；有缓存时在后台静默补全与校验
    const hasCachedStars = this.state.stars.length > 0;
    const hasCachedLists = this.state.lists.length > 0;
    const hasCachedViewer = Boolean(this.state.viewer);

    if (!hasCachedStars || !hasCachedLists || !hasCachedViewer) {
      await this.refreshAll(false);
      return;
    }

    // 后台静默平滑校验，不重置 loading 遮罩状态
    void this.silentRevalidate();
  }

  private async silentRevalidate(): Promise<void> {
    try {
      const [rawStars, rawLists, user, summary] = await Promise.all([
        fetchStarredRepositories(),
        fetchListSummaries(),
        fetchViewer(),
        fetchViewerSummary(),
      ]);

      const stars = rawStars.map(normalizeRestRepository);
      const lists = rawLists.map(normalizeListSummary);
      const viewer = normalizeViewer(user, summary);

      // 浅比较：判断核心数据是否产生实质变更，避免无意义的组件整页重绘
      const currentStars = this.state.stars;
      const starsUnchanged =
        currentStars.length === stars.length &&
        currentStars.every((s, i) => s.nodeId === stars[i]?.nodeId);

      const currentLists = this.state.lists;
      const listsUnchanged =
        currentLists.length === lists.length &&
        currentLists.every(
          (l, i) =>
            l.id === lists[i]?.id &&
            l.itemCount === lists[i]?.itemCount &&
            l.updatedAt === lists[i]?.updatedAt,
        );

      const currentViewer = this.state.viewer;
      const pinnedUnchanged =
        (currentViewer?.pinnedRepositories?.length ?? 0) ===
          (viewer.pinnedRepositories?.length ?? 0) &&
        (currentViewer?.pinnedRepositories ?? []).every(
          (item, index) =>
            item.nodeId === viewer.pinnedRepositories?.[index]?.nodeId,
        );
      const viewerUnchanged =
        currentViewer?.login === viewer.login &&
        currentViewer?.starredRepositoriesCount ===
          viewer.starredRepositoriesCount &&
        currentViewer?.listsCount === viewer.listsCount &&
        currentViewer?.followersCount === viewer.followersCount &&
        currentViewer?.followingCount === viewer.followingCount &&
        pinnedUnchanged;

      const syncedAt = new Date().toISOString();

      if (starsUnchanged && listsUnchanged && viewerUnchanged) {
        // 数据无实质变动，仅更新同步时间戳，跳过大对象替换
        this.update({ lastSyncedAt: syncedAt }, ["stars", "lists", "settings"]);
        return;
      }

      this.update(
        {
          stars,
          lists,
          viewer: {
            ...viewer,
            // 保留已懒加载的历年热力图缓存
            contributionsByYear: {
              ...(currentViewer?.contributionsByYear ?? {}),
              ...(viewer.contributionsByYear ?? {}),
            },
          },
          starsState: "loaded",
          listsState: "loaded",
          viewerState: "loaded",
          lastSyncedAt: syncedAt,
        },
        ["stars", "lists", "settings"],
      );
      this.saveNonSensitiveCache();
    } catch {
      // 静默后台同步失败时不打扰用户，继续展示已有本地缓存
    }
  }

  async refreshAll(refreshMembershipsAfter = false): Promise<void> {
    this.refreshTokenState();
    if (!this.state.tokenConfigured) return;
    const results = await Promise.allSettled([
      this.refreshViewer(false),
      this.refreshStars(false),
      this.refreshLists(false),
    ]);
    if (results.some((result) => result.status === "fulfilled")) {
      this.saveNonSensitiveCache();
    }
    if (refreshMembershipsAfter) await this.refreshMemberships();
    const rejected = results.find(
      (result): result is PromiseRejectedResult => result.status === "rejected",
    );
    if (rejected) throw rejected.reason;
  }

  async createEmptyList(name: string): Promise<void> {
    const created = await createUserList(name.trim(), null, false);
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
    const updated = await updateUserList(listId, name.trim());
    const lists = this.state.lists.map((list) =>
      list.id === listId ? { ...list, name: updated.name } : list,
    );
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
  }

  async deleteList(listId: string): Promise<void> {
    await deleteUserList(listId);
    const lists = this.state.lists.filter((list) => list.id !== listId);
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
        }
      : null;
    if (memberships) saveMembershipCache(memberships);
    removeDetailCache(listId);
    const { [listId]: _removedDetail, ...listDetails } = this.state.listDetails;
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
  }

  async createListForRepository(
    repositoryId: string,
    name: string,
    selectedListIds: readonly string[],
  ): Promise<string[]> {
    const created = await createUserList(name.trim(), null, false);
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
    const lists = await updateUserListsForItem(repositoryId, listIds);
    const memberships: RepositoryMembership[] = lists.map((list) => ({
      listId: list.id,
      listName: list.name,
    }));
    const current = this.state.memberships;
    const snapshot: MembershipSnapshot = {
      version: 1,
      repositories: {
        ...(current?.repositories ?? {}),
        [repositoryId]: memberships,
      },
      savedAt: new Date().toISOString(),
    };
    saveMembershipCache(snapshot);
    this.update({ memberships: snapshot }, ["stars", "settings"]);
    try {
      await this.refreshLists();
    } catch {
      // Membership mutation succeeded; list counts can be calibrated later.
    }
  }

  async unstar(repository: GitHubRepository): Promise<void> {
    await unstarRepository(repository.fullName);
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
    const memberships = currentMemberships
      ? {
          ...currentMemberships,
          repositories: Object.fromEntries(
            Object.entries(currentMemberships.repositories).filter(
              ([id]) => id !== repositoryId,
            ),
          ),
          savedAt: new Date().toISOString(),
        }
      : null;
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
  }

  async star(fullName: string): Promise<GitHubRepository> {
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
  }

  async refreshStarsAndMemberships(): Promise<void> {
    await Promise.all([this.refreshStars(), this.refreshLists()]);
    await this.refreshMemberships();
  }

  async refreshListsAndMemberships(): Promise<void> {
    await this.refreshLists();
    await this.refreshMemberships();
  }

  async refreshViewer(saveCacheAfter = true): Promise<void> {
    this.update({ viewerState: "loading", viewerError: null }, ["settings"]);
    try {
      const [user, summary] = await Promise.all([
        fetchViewer(),
        fetchViewerSummary(),
      ]);
      this.update(
        {
          viewer: normalizeViewer(user, summary),
          viewerState: "loaded",
          viewerError: null,
          lastSyncedAt: new Date().toISOString(),
        },
        ["settings"],
      );
      if (saveCacheAfter) this.saveNonSensitiveCache();
    } catch (error) {
      this.update({ viewerState: "error", viewerError: asError(error) }, [
        "settings",
      ]);
      throw error;
    }
  }

  async refreshStars(saveCacheAfter = true): Promise<void> {
    this.update({ starsState: "loading", starsError: null }, ["stars"]);
    try {
      const raw = await fetchStarredRepositories();
      const stars = raw.map(normalizeRestRepository);
      this.update(
        {
          stars,
          starsState: "loaded",
          starsError: null,
          lastSyncedAt: new Date().toISOString(),
        },
        ["stars", "settings"],
      );
      if (saveCacheAfter) this.saveNonSensitiveCache();
    } catch (error) {
      this.update({ starsState: "error", starsError: asError(error) }, [
        "stars",
        "settings",
      ]);
      throw error;
    }
  }

  async refreshLists(saveCacheAfter = true): Promise<void> {
    this.update({ listsState: "loading", listsError: null }, ["lists"]);
    try {
      const raw = await fetchListSummaries();
      const lists = raw.map(normalizeListSummary);
      this.update(
        {
          lists,
          viewer: this.state.viewer
            ? { ...this.state.viewer, listsCount: lists.length }
            : null,
          listsState: "loaded",
          listsError: null,
          lastSyncedAt: new Date().toISOString(),
        },
        ["lists", "settings"],
      );
      if (saveCacheAfter) this.saveNonSensitiveCache();
    } catch (error) {
      this.update({ listsState: "error", listsError: asError(error) }, [
        "lists",
        "settings",
      ]);
      throw error;
    }
  }

  refreshMemberships(): Promise<void> {
    if (this.membershipRefresh) return this.membershipRefresh;
    const request = this.performMembershipRefresh().finally(() => {
      if (this.membershipRefresh === request) this.membershipRefresh = null;
    });
    this.membershipRefresh = request;
    return request;
  }

  private async performMembershipRefresh(): Promise<void> {
    const generation = this.dataGeneration;
    const lists = this.state.lists;
    const details = await mapWithConcurrency(lists, 3, (list) =>
      this.fetchCompleteListDetail(list),
    );
    const repositories: Record<string, RepositoryMembership[]> = {};
    for (const detail of details) {
      for (const repository of detail.items) {
        const memberships = repositories[repository.nodeId] ?? [];
        memberships.push({ listId: detail.id, listName: detail.name });
        repositories[repository.nodeId] = memberships;
      }
    }
    const snapshot: MembershipSnapshot = {
      version: 1,
      repositories,
      savedAt: new Date().toISOString(),
    };
    if (generation !== this.dataGeneration) return;
    saveMembershipCache(snapshot);
    this.update({ memberships: snapshot }, ["stars", "settings"]);
  }

  private async fetchCompleteListDetail(
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

  async openListDetail(listId: string): Promise<void> {
    let current = this.state.listDetails[listId] ?? null;
    if (!current) {
      const cached = loadDetailCache(listId);
      if (cached) {
        current = cached.detail;
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
    await this.requestListDetailPage(
      listId,
      null,
      null,
      current === null,
      current !== null,
    );
  }

  async refreshListDetail(listId: string): Promise<void> {
    await this.requestListDetailPage(listId, null, null, true, false);
  }

  async loadNextListDetailPage(listId: string): Promise<void> {
    const current = this.state.listDetails[listId] ?? null;
    if (!current?.hasNextPage || !current.endCursor) return;
    await this.requestListDetailPage(
      listId,
      current.endCursor,
      current,
      false,
      true,
    );
  }

  private async requestListDetailPage(
    listId: string,
    cursor: string | null,
    existing: GitHubListDetail | null,
    showBlockingLoading: boolean,
    preserveCurrentOnError: boolean,
  ): Promise<void> {
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

    try {
      const calendar = await fetchContributionsByYear(year);
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
      });
    } catch (error) {
      throw asError(error);
    }
  }

  clearLocalData(): void {
    this.dataGeneration += 1;
    clearCache();
    clearDetailCaches();
    clearMembershipCache();
    this.update(
      {
        viewer: null,
        stars: [],
        lists: [],
        memberships: null,
        listDetails: {},
        detailStates: {},
        detailErrors: {},
        lastSyncedAt: null,
      },
      [
        "stars",
        "lists",
        "settings",
        ...Array.from(this.scopedListeners.keys()).filter(
          (scope): scope is `detail:${string}` => scope.startsWith("detail:"),
        ),
      ],
    );
  }
}

export type { GitHubListDetail, GitHubRepository };
