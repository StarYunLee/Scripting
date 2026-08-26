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
import type { AppState, GitHubRepository } from "../types";
import { displayError } from "../services/errors";
import { parseRepositoryRef } from "../services/github-rest";
import type { GitHubDataStore } from "../services/data-store";
import { EmptyState } from "../ui/common";
import {
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
} from "../ui/glass";
import { glassListPageProps } from "../ui/glass-list-page";
import { RepositoryCard } from "../ui/repository-row";
import { RepositoryListsSheet } from "./repository-lists-sheet";
import { useRootToolbar } from "./root-toolbar";

type SortKey = "starred" | "pushed" | "stars" | "name";

const SORT_OPTIONS: readonly { key: SortKey; label: string }[] = [
  { key: "starred", label: "按 Star 时间" },
  { key: "pushed", label: "按最近推送" },
  { key: "stars", label: "按星标数" },
  { key: "name", label: "按名称" },
];

function formatLastSyncedAt(value: string | null): string | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return undefined;
  return `${date.toLocaleDateString([], { month: "numeric", day: "numeric" })} ${date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} 更新`;
}

function timestamp(value: string | null): number {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
}

function collectLanguages(stars: readonly GitHubRepository[]): string[] {
  const counts = new Map<string, number>();
  for (const item of stars) {
    if (!item.language) continue;
    counts.set(item.language, (counts.get(item.language) ?? 0) + 1);
  }
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([name]) => name);
}

function membershipIds(
  memberships: AppState["memberships"],
  repositoryId: string,
): readonly string[] {
  return memberships?.repositories[repositoryId]?.map((item) => item.listId) ?? [];
}

function filterAndSortStars(
  stars: readonly GitHubRepository[],
  query: string,
  language: string | null,
  listId: string | null,
  memberships: AppState["memberships"],
  sortKey: SortKey,
): GitHubRepository[] {
  const keyword = query.trim().toLowerCase();
  const filtered = stars.filter((item) => {
    if (language === "") {
      if (item.language) return false;
    } else if (language && item.language !== language) {
      return false;
    }
    if (listId !== null) {
      const ids = membershipIds(memberships, item.nodeId);
      if (listId === "") {
        if (ids.length > 0) return false;
      } else if (!ids.includes(listId)) {
        return false;
      }
    }
    if (!keyword) return true;
    return `${item.fullName} ${item.description ?? ""} ${item.language ?? ""}`
      .toLowerCase()
      .includes(keyword);
  });
  const sorted = filtered.slice();
  sorted.sort((a, b) => {
    switch (sortKey) {
      case "pushed":
        return timestamp(b.pushedAt) - timestamp(a.pushedAt);
      case "stars":
        return b.stargazersCount - a.stargazersCount;
      case "name":
        return a.fullName.localeCompare(b.fullName);
      default:
        return timestamp(b.starredAt) - timestamp(a.starredAt);
    }
  });
  return sorted;
}

function sortLabel(sortKey: SortKey): string {
  return SORT_OPTIONS.find((item) => item.key === sortKey)?.label ?? "按 Star 时间";
}

function languageLabel(language: string | null): string {
  if (language === null) return "全部语言";
  if (language === "") return "未标注语言";
  return language;
}

export function AllStarsPage(props: { store: GitHubDataStore }) {
  const { store } = props;
  const [state, setState] = useState<AppState>(() => store.getState());
  const [query, setQuery] = useState("");
  const [language, setLanguage] = useState<string | null>(null);
  const [listId, setListId] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<SortKey>("starred");
  const [managedRepository, setManagedRepository] =
    useState<GitHubRepository | null>(null);
  useEffect(() => store.subscribe("stars", setState), []);
  const languages = useMemo(
    () => collectLanguages(state.stars),
    [state.stars],
  );
  const stars = useMemo(
    () =>
      filterAndSortStars(
        state.stars,
        query,
        language,
        listId,
        state.memberships,
        sortKey,
      ),
    [state.stars, state.memberships, query, language, listId, sortKey],
  );
  const hasUnknownLanguage = useMemo(
    () => state.stars.some((item) => !item.language),
    [state.stars],
  );
  const filterActive = language !== null || listId !== null;
  const sortActive = sortKey !== "starred";
  const visibleLanguages = languages.slice(0, 20);
  const visibleLists = state.lists.slice(0, 20);
  const rootToolbar = useRootToolbar([
    <Menu
      title="筛选"
      systemImage={
        filterActive
          ? "line.3.horizontal.decrease.circle.fill"
          : "line.3.horizontal.decrease.circle"
      }
    >
      <Button
        title="清除筛选"
        action={() => {
          setLanguage(null);
          setListId(null);
        }}
      />
      <Menu title="语言">
        <Button
          title="全部语言"
          action={() => {
            setLanguage(null);
          }}
        />
        {visibleLanguages.map((name) => (
          <Button
            key={name}
            title={name}
            action={() => {
              setLanguage(name);
            }}
          />
        ))}
        {hasUnknownLanguage ? (
          <Button
            title="未标注语言"
            action={() => {
              setLanguage("");
            }}
          />
        ) : null}
      </Menu>
      <Menu title="列表">
        <Button
          title="全部列表"
          action={() => {
            setListId(null);
          }}
        />
        <Button
          title="未分组"
          action={() => {
            void selectUngrouped();
          }}
        />
        {visibleLists.map((list) => (
          <Button
            key={list.id}
            title={list.name}
            action={() => {
              void selectList(list.id);
            }}
          />
        ))}
      </Menu>
    </Menu>,
    <Menu
      title="排序"
      systemImage={
        sortActive
          ? "arrow.up.arrow.down.circle.fill"
          : "arrow.up.arrow.down.circle"
      }
    >
      {SORT_OPTIONS.map((item) => (
        <Button
          key={item.key}
          title={item.label}
          action={() => {
            setSortKey(item.key);
          }}
        />
      ))}
    </Menu>,
    <Button
      title="添加"
      systemImage="plus"
      labelStyle="iconOnly"
      action={() => {
        void addStarredRepository();
      }}
    />,
  ]);
  async function openListManager(repository: GitHubRepository) {
    if (!store.getState().memberships) {
      try {
        await store.refreshMemberships();
      } catch (error) {
        await Dialog.alert({
          title: "无法管理列表",
          message:
            typeof error === "object" && error !== null && "message" in error
              ? String(error.message)
              : String(error),
        });
        return;
      }
    }
    setManagedRepository(repository);
  }

  async function ensureMemberships(): Promise<boolean> {
    if (store.getState().memberships) return true;
    try {
      await store.refreshMemberships();
      return true;
    } catch (error) {
      await Dialog.alert({
        title: "无法筛选列表",
        message:
          typeof error === "object" && error !== null && "message" in error
            ? String(error.message)
            : String(error),
      });
      return false;
    }
  }

  async function selectUngrouped() {
    if (!(await ensureMemberships())) return;
    setListId("");
  }

  async function selectList(id: string) {
    if (!(await ensureMemberships())) return;
    setListId(id);
  }

  async function addStarredRepository() {
    const input = await Dialog.prompt({
      title: "添加 Star",
      message: "粘贴 GitHub 链接或 owner/repo",
      placeholder: "owner/repo",
      confirmLabel: "添加",
      cancelLabel: "取消",
    });
    const trimmed = input?.trim();
    if (!trimmed) return;
    const fullName = parseRepositoryRef(trimmed);
    if (!fullName) {
      await Dialog.alert({
        title: "无法识别仓库",
        message: "请输入 owner/repo，或完整的 GitHub 仓库链接。",
      });
      return;
    }
    const alreadyStarred = store
      .getState()
      .stars.some(
        (item) => item.fullName.toLowerCase() === fullName.toLowerCase(),
      );
    if (alreadyStarred) {
      await Dialog.alert({
        title: "已在 Stars 中",
        message: `${fullName} 已经加过 Star。`,
      });
      return;
    }
    const confirmed = await Dialog.confirm({
      title: "确认添加",
      message: `确定 Star ${fullName} 吗？`,
      cancelLabel: "取消",
      confirmLabel: "Star",
    });
    if (!confirmed) return;
    try {
      await store.star(fullName);
    } catch (error) {
      const githubError =
        typeof error === "object" &&
        error !== null &&
        "kind" in error &&
        "message" in error
          ? (error as Parameters<typeof displayError>[0])
          : null;
      await Dialog.alert({
        title: "添加失败",
        message:
          displayError(githubError) ??
          (githubError?.message ||
            (typeof error === "object" &&
            error !== null &&
            "message" in error
              ? String(error.message)
              : String(error))),
      });
    }
  }

  async function confirmUnstar(repository: GitHubRepository) {
    const confirmed = await Dialog.confirm({
      title: "取消 Star",
      message: `确定取消对 ${repository.fullName} 的 Star 吗？它也会从所有自定义列表中移除。`,
      cancelLabel: "取消",
      confirmLabel: "取消 Star",
    });
    if (!confirmed) return;
    try {
      await store.unstar(repository);
    } catch (error) {
      const githubError =
        typeof error === "object" &&
        error !== null &&
        "kind" in error &&
        "message" in error
          ? (error as Parameters<typeof displayError>[0])
          : null;
      await Dialog.alert({
        title: "取消 Star 失败",
        message:
          displayError(githubError) ??
          (githubError?.message ||
            (typeof error === "object" &&
            error !== null &&
            "message" in error
              ? String(error.message)
              : String(error))),
      });
    }
  }

  async function refresh() {
    await store.refreshStarsAndMemberships();
  }
  const error = displayError(state.starsError);
  const emptyBecauseFilter =
    state.starsState !== "loading" &&
    stars.length === 0 &&
    state.stars.length > 0;
  return (
    <NavigationStack>
      <List
        navigationTitle="Stars"
        {...glassListPageProps()}
        listRowSpacing={0}
        searchable={{ value: query, onChanged: setQuery, prompt: "搜索仓库" }}
        refreshable={refresh}
        toolbar={rootToolbar}
        sheet={
          managedRepository
            ? {
                isPresented: true,
                onChanged: (presented: boolean) => {
                  if (!presented) setManagedRepository(null);
                },
                content: (
                  <RepositoryListsSheet
                    store={store}
                    repository={managedRepository}
                    lists={state.lists}
                    initialListIds={(
                      state.memberships?.repositories[
                        managedRepository.nodeId
                      ] ?? []
                    ).map((membership) => membership.listId)}
                    onClose={() => setManagedRepository(null)}
                  />
                ),
              }
            : undefined
        }
      >
        <Section
          header={
            <GlassSectionHeader
              title="收藏的仓库"
              detail={
                filterActive || query
                  ? `${stars.length}/${state.stars.length}`
                  : formatLastSyncedAt(state.lastSyncedAt)
              }
            />
          }
          listRowBackground={glassRowBackground}
        >
          {error ||
          (state.starsState === "loading" && state.stars.length === 0) ||
          (state.starsState !== "loading" && stars.length === 0) ? (
            <GlassGroup>
              {error ? (
                <VStack
                  spacing={8}
                  padding={{ vertical: true }}
                  frame={{ maxWidth: "infinity" }}
                >
                  <Text foregroundStyle="systemRed">{error}</Text>
                  <Button
                    title="重试"
                    action={() => {
                      void refresh();
                    }}
                  />
                </VStack>
              ) : null}
              {state.starsState === "loading" && state.stars.length === 0 ? (
                <EmptyState title="正在加载 Stars" />
              ) : null}
              {state.starsState !== "loading" && stars.length === 0 ? (
                <EmptyState
                  title={
                    emptyBecauseFilter || query
                      ? "没有匹配的仓库"
                      : "暂无 Stars"
                  }
                  detail={
                    emptyBecauseFilter
                      ? "尝试更换语言或列表筛选"
                      : query
                        ? "尝试更换搜索关键词"
                        : "配置 Token 后刷新 GitHub 数据"
                  }
                />
              ) : null}
            </GlassGroup>
          ) : null}
          {stars.map((repo) => (
            <RepositoryCard
              key={repo.nodeId}
              repository={repo}
              showStarredDate
              memberships={state.memberships?.repositories[repo.nodeId]}
              onManageLists={() => {
                void openListManager(repo);
              }}
              onUnstar={() => {
                void confirmUnstar(repo);
              }}
            />
          ))}
        </Section>
      </List>
    </NavigationStack>
  );
}
