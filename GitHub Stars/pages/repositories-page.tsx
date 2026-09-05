import {
  Button,
  List,
  Menu,
  NavigationStack,
  Section,
  Text,
  VStack,
  useEffect,
  useMemo,
  useState,
} from "scripting";
import type { AppState, GitHubRepository, OwnedRepository } from "../types";
import type { GitHubDataStore } from "../services/data-store";
import { displayError } from "../services/errors";
import { EmptyState } from "../ui/common";
import {
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
} from "../ui/glass";
import { glassListPageProps } from "../ui/glass-list-page";
import { OwnedRepositoryCard } from "../ui/owned-repository-row";
import { useRootToolbar } from "./root-toolbar";

type RepositoryFilter =
  | "all"
  | "public"
  | "private"
  | "source"
  | "fork"
  | "archived";
type RepositorySort = "pushed" | "stars" | "name";

const FILTERS: readonly { key: RepositoryFilter; label: string }[] = [
  { key: "all", label: "全部仓库" },
  { key: "public", label: "公开仓库" },
  { key: "private", label: "私有仓库" },
  { key: "source", label: "原创仓库" },
  { key: "fork", label: "Fork" },
  { key: "archived", label: "已归档" },
];

const SORTS: readonly { key: RepositorySort; label: string }[] = [
  { key: "pushed", label: "按最近推送" },
  { key: "stars", label: "按星标数" },
  { key: "name", label: "按名称" },
];

function timestamp(value: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function visibleRepositories(
  repositories: readonly OwnedRepository[],
  pinnedRepositories: readonly GitHubRepository[],
  query: string,
  filter: RepositoryFilter,
  sort: RepositorySort,
): OwnedRepository[] {
  const pinnedOrder = new Map(
    pinnedRepositories.map((repository, index) => [
      repository.fullName.toLowerCase(),
      index,
    ]),
  );
  const keyword = query.trim().toLowerCase();
  const filtered = repositories.filter((repository) => {
    if (filter === "public" && repository.visibility !== "public") {
      return false;
    }
    if (
      filter === "private" &&
      repository.visibility !== "private" &&
      repository.visibility !== "internal"
    ) {
      return false;
    }
    if (filter === "source" && (repository.isFork || repository.isArchived)) {
      return false;
    }
    if (filter === "fork" && !repository.isFork) return false;
    if (filter === "archived" && !repository.isArchived) return false;
    if (!keyword) return true;
    return `${repository.fullName} ${repository.description ?? ""} ${repository.language ?? ""} ${repository.topics.join(" ")}`
      .toLowerCase()
      .includes(keyword);
  });
  return filtered.slice().sort((a, b) => {
    const aPinned = pinnedOrder.get(a.fullName.toLowerCase());
    const bPinned = pinnedOrder.get(b.fullName.toLowerCase());
    if (aPinned !== undefined || bPinned !== undefined) {
      if (aPinned === undefined) return 1;
      if (bPinned === undefined) return -1;
      return aPinned - bPinned;
    }
    if (sort === "stars") return b.stargazersCount - a.stargazersCount;
    if (sort === "name") return a.fullName.localeCompare(b.fullName);
    return timestamp(b.pushedAt) - timestamp(a.pushedAt);
  });
}

function errorMessage(error: unknown): string {
  return error && typeof error === "object" && "message" in error
    ? String(error.message)
    : String(error);
}

export function RepositoriesPage(props: { store: GitHubDataStore }) {
  const { store } = props;
  const [state, setState] = useState<AppState>(() => store.getState());
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<RepositoryFilter>("all");
  const [sort, setSort] = useState<RepositorySort>("pushed");
  const [busyRepositoryId, setBusyRepositoryId] = useState<string | null>(null);

  useEffect(() => {
    const unsubscribe = store.subscribe("repositories", setState);
    void (async () => {
      try {
        await Promise.all([
          store.ensureOwnedRepositories(),
          store.ensurePinnedRepositories(),
        ]);
        await store.refreshForkStatuses(false);
      } catch {
        // Store state contains displayable errors; cached repositories remain usable.
      }
    })();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (!state.includePrivateRepositories && filter === "private") {
      setFilter("all");
    }
  }, [state.includePrivateRepositories, filter]);

  const repositories = useMemo(
    () =>
      visibleRepositories(
        state.ownedRepositories,
        state.viewer?.pinnedRepositories ?? [],
        query,
        filter,
        sort,
      ),
    [
      state.ownedRepositories,
      state.viewer?.pinnedRepositories,
      query,
      filter,
      sort,
    ],
  );
  const filterActive = filter !== "all";
  const sortActive = sort !== "pushed";
  const toolbar = useRootToolbar([
    <Menu
      title="筛选"
      systemImage={
        filterActive
          ? "line.3.horizontal.decrease.circle.fill"
          : "line.3.horizontal.decrease.circle"
      }
    >
      {FILTERS.filter(
        (item) => state.includePrivateRepositories || item.key !== "private",
      ).map((item) => (
        <Button
          key={item.key}
          title={item.label}
          action={() => setFilter(item.key)}
        />
      ))}
    </Menu>,
    <Menu
      title="排序"
      systemImage={
        sortActive
          ? "arrow.up.arrow.down.circle.fill"
          : "arrow.up.arrow.down.circle"
      }
    >
      {SORTS.map((item) => (
        <Button
          key={item.key}
          title={item.label}
          action={() => setSort(item.key)}
        />
      ))}
    </Menu>,
  ]);

  async function editRepository(repository: OwnedRepository) {
    if (busyRepositoryId) return;
    if (repository.isArchived) {
      await Dialog.alert({
        title: "仓库已归档",
        message: "归档仓库为只读状态，请在 GitHub 网页恢复后再编辑。",
      });
      return;
    }
    const actions = [
      { label: "编辑描述与主页" },
      { label: "编辑 Topics" },
      { label: repository.hasIssues ? "关闭 Issues" : "开启 Issues" },
      { label: "归档仓库", destructive: true },
    ];
    const action = await Dialog.actionSheet({
      title: repository.name,
      actions,
    });
    if (action == null || action < 0) return;
    const selected = actions[action]?.label;
    if (selected === "编辑描述与主页") {
      await editDescriptionAndHomepage(repository);
    }
    if (selected === "编辑 Topics") await editTopics(repository);
    if (selected === "关闭 Issues" || selected === "开启 Issues") {
      await toggleIssues(repository);
    }
    if (selected === "归档仓库") await archiveRepository(repository);
  }

  async function showForkStatus(repository: OwnedRepository) {
    if (busyRepositoryId) return;
    setBusyRepositoryId(repository.nodeId);
    let status = store.getState().forkStatuses[repository.nodeId];
    try {
      if (!status || status.state === "unknown" || status.state === "error") {
        status = await store.refreshForkStatus(repository, true);
      }
    } catch (error) {
      await Dialog.alert({
        title: "无法检查上游状态",
        message: errorMessage(error),
      });
      setBusyRepositoryId(null);
      return;
    }
    setBusyRepositoryId(null);

    const upstream = status.upstreamFullName ?? "上游仓库";
    const branch = status.upstreamBranch ?? repository.defaultBranch;
    const detail =
      status.state === "current"
        ? `当前 ${repository.defaultBranch} 分支已与 ${upstream}:${branch} 保持一致。`
        : status.state === "behind"
          ? `当前分支落后 ${upstream}:${branch} ${status.behindBy} 个提交。`
          : status.state === "diverged"
            ? `当前分支领先 ${status.aheadBy} 个提交，同时落后上游 ${status.behindBy} 个提交。`
            : "当前无法确定上游状态。";
    const actions = [
      ...(status.behindBy > 0
        ? [
            {
              label:
                status.state === "diverged"
                  ? "尝试同步上游"
                  : `同步上游 ${status.behindBy} 个提交`,
            },
          ]
        : []),
      { label: "重新检查" },
      ...(status.state === "diverged"
        ? [{ label: "在 GitHub 中查看差异" }]
        : []),
    ];
    const action = await Dialog.actionSheet({
      title: "Fork 上游状态",
      message: detail,
      actions,
    });
    if (action == null || action < 0) return;
    const selected = actions[action]?.label;
    if (selected === "重新检查") {
      await checkForkStatus(repository);
      return;
    }
    if (selected === "在 GitHub 中查看差异") {
      const [upstreamOwner] = upstream.split("/");
      const [forkOwner] = repository.fullName.split("/");
      if (upstreamOwner && forkOwner) {
        const compareUrl = `https://github.com/${repository.fullName}/compare/${encodeURIComponent(`${upstreamOwner}:${branch}...${forkOwner}:${repository.defaultBranch}`)}`;
        void Safari.present(compareUrl, false);
      }
      return;
    }
    if (selected?.startsWith("同步上游") || selected === "尝试同步上游") {
      await syncFork(repository, status.state === "diverged");
    }
  }

  async function checkForkStatus(repository: OwnedRepository) {
    setBusyRepositoryId(repository.nodeId);
    try {
      await store.refreshForkStatus(repository, true);
    } catch (error) {
      await Dialog.alert({
        title: "检查失败",
        message: errorMessage(error),
      });
    } finally {
      setBusyRepositoryId(null);
    }
  }

  async function syncFork(repository: OwnedRepository, diverged = false) {
    const confirmed = await Dialog.confirm({
      title: "同步上游仓库",
      message: diverged
        ? `当前 ${repository.defaultBranch} 分支与上游都有独立提交。GitHub 会尝试合并上游变更，可能产生合并提交或冲突，确定继续吗？`
        : `将上游最新提交同步到 ${repository.fullName} 的 ${repository.defaultBranch} 分支。存在冲突时不会强制覆盖，确定继续吗？`,
      cancelLabel: "取消",
      confirmLabel: "同步",
    });
    if (!confirmed) return;
    setBusyRepositoryId(repository.nodeId);
    try {
      await store.syncOwnedFork(repository);
      await Dialog.alert({
        title: "同步完成",
        message: `${repository.fullName} 已同步上游最新提交。`,
      });
    } catch (error) {
      const message = errorMessage(error);
      const normalizedMessage = message.toLowerCase();
      const hasConflict =
        message.includes("冲突") || normalizedMessage.includes("conflict");
      await Dialog.alert({
        title: hasConflict ? "存在合并冲突" : "同步失败",
        message: hasConflict
          ? "无法自动同步，因为默认分支与上游存在冲突。请在 GitHub 网页或本地 Git 中手动处理。"
          : message,
      });
    } finally {
      setBusyRepositoryId(null);
    }
  }

  async function editDescriptionAndHomepage(repository: OwnedRepository) {
    const description = await Dialog.prompt({
      title: "编辑仓库描述",
      message: "留空将清除描述",
      placeholder: "仓库描述",
      defaultValue: repository.description ?? "",
      confirmLabel: "下一步",
      cancelLabel: "取消",
    });
    if (description == null) return;
    const homepage = await Dialog.prompt({
      title: "编辑 Homepage",
      message: "留空将清除主页链接",
      placeholder: "https://example.com",
      defaultValue: repository.homepage ?? "",
      confirmLabel: "保存",
      cancelLabel: "取消",
    });
    if (homepage == null) return;
    await performUpdate(repository, {
      description: description.trim() || null,
      homepage: homepage.trim() || null,
    });
  }

  async function editTopics(repository: OwnedRepository) {
    const value = await Dialog.prompt({
      title: "编辑 Topics",
      message: "用英文逗号分隔；留空将清除 Topics",
      placeholder: "ios, scripting, github",
      defaultValue: repository.topics.join(", "),
      confirmLabel: "保存",
      cancelLabel: "取消",
    });
    if (value == null) return;
    const topics = Array.from(
      new Set(
        value
          .split(",")
          .map((item) => item.trim().toLowerCase())
          .filter(Boolean),
      ),
    );
    if (topics.length > 20 || topics.some((topic) => topic.length > 50)) {
      await Dialog.alert({
        title: "Topics 无效",
        message: "最多填写 20 个 Topic，每个不超过 50 个字符。",
      });
      return;
    }
    await performUpdate(repository, { topics });
  }

  async function toggleIssues(repository: OwnedRepository) {
    const next = !repository.hasIssues;
    const confirmed = await Dialog.confirm({
      title: next ? "开启 Issues" : "关闭 Issues",
      message: `确定为 ${repository.fullName} ${next ? "开启" : "关闭"} Issues 吗？`,
      cancelLabel: "取消",
      confirmLabel: "确认",
    });
    if (!confirmed) return;
    await performUpdate(repository, { hasIssues: next });
  }

  async function archiveRepository(repository: OwnedRepository) {
    const input = await Dialog.prompt({
      title: "归档仓库",
      message: `归档后仓库将变为只读。请输入 ${repository.name} 确认。`,
      placeholder: repository.name,
      confirmLabel: "归档",
      cancelLabel: "取消",
    });
    if (input?.trim() !== repository.name) {
      if (input != null) {
        await Dialog.alert({ title: "未归档", message: "仓库名称不匹配。" });
      }
      return;
    }
    setBusyRepositoryId(repository.nodeId);
    try {
      await store.archiveOwnedRepository(repository);
    } catch (error) {
      await Dialog.alert({ title: "归档失败", message: errorMessage(error) });
    } finally {
      setBusyRepositoryId(null);
    }
  }

  async function performUpdate(
    repository: OwnedRepository,
    input: {
      description?: string | null;
      homepage?: string | null;
      hasIssues?: boolean;
      topics?: string[];
    },
  ) {
    setBusyRepositoryId(repository.nodeId);
    try {
      await store.updateOwnedRepository(repository, input);
    } catch (error) {
      await Dialog.alert({ title: "保存失败", message: errorMessage(error) });
    } finally {
      setBusyRepositoryId(null);
    }
  }

  async function refresh() {
    try {
      await Promise.all([
        store.refreshOwnedRepositories(),
        store.refreshViewer(true),
      ]);
      await store.refreshForkStatuses(true);
    } catch {
      // State already contains the displayable error.
    }
  }

  const error = displayError(state.ownedRepositoriesError);
  const emptyBecauseFilter =
    state.ownedRepositoriesState !== "loading" &&
    repositories.length === 0 &&
    state.ownedRepositories.length > 0;
  return (
    <NavigationStack>
      <List
        navigationTitle="仓库"
        {...glassListPageProps()}
        listRowSpacing={0}
        searchable={{
          value: query,
          onChanged: setQuery,
          prompt: "搜索我的仓库",
        }}
        refreshable={refresh}
        toolbar={toolbar}
      >
        <Section
          header={
            <GlassSectionHeader
              title={
                state.includePrivateRepositories ? "我的仓库" : "我的公开仓库"
              }
              detail={
                filterActive || query
                  ? `${repositories.length}/${state.ownedRepositories.length}`
                  : `${state.ownedRepositories.length} 个仓库`
              }
            />
          }
          listRowBackground={glassRowBackground}
        >
          {error ||
          (state.ownedRepositoriesState === "loading" &&
            state.ownedRepositories.length === 0) ||
          (state.ownedRepositoriesState !== "loading" &&
            repositories.length === 0) ? (
            <GlassGroup>
              {error ? (
                <VStack
                  spacing={8}
                  padding={{ vertical: true }}
                  frame={{ maxWidth: "infinity" }}
                >
                  <Text foregroundStyle="systemRed">{error}</Text>
                  <Button title="重试" action={() => void refresh()} />
                </VStack>
              ) : null}
              {state.ownedRepositoriesState === "loading" &&
              state.ownedRepositories.length === 0 ? (
                <EmptyState
                  title={
                    state.includePrivateRepositories
                      ? "正在加载仓库"
                      : "正在加载公开仓库"
                  }
                />
              ) : null}
              {state.ownedRepositoriesState !== "loading" &&
              repositories.length === 0 ? (
                <EmptyState
                  title={
                    emptyBecauseFilter || query
                      ? "没有匹配的仓库"
                      : state.includePrivateRepositories
                        ? "暂无仓库"
                        : "暂无公开仓库"
                  }
                  detail={
                    emptyBecauseFilter || query
                      ? "尝试清除筛选或更换关键词"
                      : state.includePrivateRepositories
                        ? "此页显示你拥有的公开和私有仓库"
                        : "此页只显示你拥有的公开仓库"
                  }
                />
              ) : null}
            </GlassGroup>
          ) : null}
          {repositories.map((repository) => (
            <OwnedRepositoryCard
              key={repository.nodeId}
              repository={repository}
              forkStatus={state.forkStatuses[repository.nodeId]}
              forkBusy={busyRepositoryId === repository.nodeId}
              isPinned={state.viewer?.pinnedRepositories?.some(
                (pinned) =>
                  pinned.fullName.toLowerCase() ===
                  repository.fullName.toLowerCase(),
              )}
              onManage={() => void editRepository(repository)}
              onForkStatus={() => void showForkStatus(repository)}
            />
          ))}
        </Section>
      </List>
    </NavigationStack>
  );
}
