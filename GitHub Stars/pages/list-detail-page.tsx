import { List, Section, Text, useEffect, useState } from "scripting";
import type { AppState, GitHubListSummary, GitHubRepository } from "../types";
import type { GitHubDataStore } from "../services/data-store";
import { displayError } from "../services/errors";
import { EmptyState } from "../ui/common";
import {
  GlassActionRow,
  GlassDivider,
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
} from "../ui/glass";
import { glassListPageProps } from "../ui/glass-list-page";
import { RepositoryCard } from "../ui/repository-row";
import { RepositoryListsSheet } from "./repository-lists-sheet";

export function ListDetailPage(props: {
  store: GitHubDataStore;
  list: GitHubListSummary;
}) {
  const { store, list } = props;
  const [state, setState] = useState<AppState>(() => store.getState());
  const [managedRepository, setManagedRepository] =
    useState<GitHubRepository | null>(null);
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

  useEffect(() => {
    const unsubscribe = store.subscribe(`detail:${list.id}`, setState);
    void store.openListDetail(list.id);
    return unsubscribe;
  }, [list.id]);
  const detail = state.listDetails[list.id];
  const error = displayError(state.detailErrors[list.id] ?? null);
  const loading = state.detailStates[list.id] === "loading";
  return (
    <List
      navigationTitle={list.name}
      {...glassListPageProps()}
      listRowSpacing={0}
      refreshable={() => store.refreshListDetail(list.id)}
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
                    state.memberships?.repositories[managedRepository.nodeId] ??
                    []
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
            title="分组内容"
            detail={`${detail?.itemCount ?? list.itemCount} 个仓库`}
          />
        }
        listRowBackground={glassRowBackground}
      >
        {list.description ? (
          <GlassGroup>
            <Text
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
              foregroundStyle="secondaryLabel"
            >
              {list.description}
            </Text>
          </GlassGroup>
        ) : null}
        {error ? (
          <GlassGroup>
            <Text
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
              foregroundStyle="systemRed"
            >
              {error}
            </Text>
            <GlassDivider />
            <GlassActionRow
              title="重试"
              action={() => {
                void store.refreshListDetail(list.id);
              }}
            />
          </GlassGroup>
        ) : null}
        {loading && !detail ? <EmptyState title="正在加载分组内容" /> : null}
        {!loading && !error && detail && detail.items.length === 0 ? (
          <EmptyState title="分组为空" />
        ) : null}
        {detail?.items.map((repo) => (
          <RepositoryCard
            key={repo.nodeId}
            repository={repo}
            onManageLists={() => {
              void openListManager(repo);
            }}
          />
        ))}
        {detail?.hasNextPage ? (
          <GlassGroup>
            <GlassActionRow
              title="加载下一页"
              action={() => {
                void store.loadNextListDetailPage(list.id);
              }}
            />
          </GlassGroup>
        ) : null}
      </Section>
    </List>
  );
}
