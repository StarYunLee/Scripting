import {
  Button,
  List,
  NavigationStack,
  Section,
  Text,
  useEffect,
  useState,
} from "scripting";
import type { AppState, GitHubListSummary } from "../types";
import { displayError } from "../services/errors";
import type { GitHubDataStore } from "../services/data-store";
import { EmptyState } from "../ui/common";
import {
  GlassActionRow,
  GlassGroup,
  GlassNavRow,
  GlassSectionHeader,
  glassRowBackground,
} from "../ui/glass";
import { glassListPageProps } from "../ui/glass-list-page";
import { useRootToolbar } from "./root-toolbar";
import { ListDetailPage } from "./list-detail-page";

export function ListsPage(props: { store: GitHubDataStore }) {
  const { store } = props;
  const [state, setState] = useState<AppState>(() => store.getState());
  const [openedList, setOpenedList] = useState<GitHubListSummary | null>(null);
  const [busyListId, setBusyListId] = useState<string | null>(null);
  const rootToolbar = useRootToolbar(
    <Button
      title="新建列表"
      systemImage="plus"
      labelStyle="iconOnly"
      disabled={busyListId != null}
      action={() => {
        void createList();
      }}
    />,
  );
  useEffect(() => store.subscribe("lists", setState), []);
  async function createList() {
    const name = await Dialog.prompt({
      title: "新建列表",
      placeholder: "列表名称",
      confirmLabel: "创建",
      cancelLabel: "取消",
    });
    const trimmed = name?.trim();
    if (!trimmed) return;
    setBusyListId("create");
    try {
      await store.createEmptyList(trimmed);
    } catch (error) {
      await showListError("创建失败", error);
    } finally {
      setBusyListId(null);
    }
  }

  async function manageList(list: GitHubListSummary) {
    if (busyListId) return;
    const action = await Dialog.actionSheet({
      title: list.name,
      actions: [{ label: "重命名" }, { label: "删除", destructive: true }],
    });
    if (action === 0) {
      const name = await Dialog.prompt({
        title: "重命名列表",
        placeholder: "列表名称",
        defaultValue: list.name,
        confirmLabel: "保存",
        cancelLabel: "取消",
      });
      const trimmed = name?.trim();
      if (!trimmed || trimmed === list.name) return;
      setBusyListId(list.id);
      try {
        await store.renameList(list.id, trimmed);
      } catch (error) {
        await showListError("重命名失败", error);
      } finally {
        setBusyListId(null);
      }
    } else if (action === 1) {
      const confirmed = await Dialog.confirm({
        title: "删除列表",
        message: `确定删除“${list.name}”吗？仓库本身不会被取消 Star。`,
        cancelLabel: "取消",
        confirmLabel: "删除",
      });
      if (!confirmed) return;
      setBusyListId(list.id);
      try {
        if (openedList?.id === list.id) setOpenedList(null);
        await store.deleteList(list.id);
      } catch (error) {
        await showListError("删除失败", error);
      } finally {
        setBusyListId(null);
      }
    }
  }

  async function showListError(title: string, error: unknown) {
    await Dialog.alert({
      title,
      message:
        typeof error === "object" && error !== null && "message" in error
          ? String(error.message)
          : String(error),
    });
  }

  async function refresh() {
    await store.refreshListsAndMemberships();
  }
  const error = displayError(state.listsError);
  return (
    <NavigationStack>
      <List
        navigationTitle="列表"
        {...glassListPageProps()}
        refreshable={refresh}
        toolbar={rootToolbar}
        navigationDestination={{
          isPresented: openedList != null,
          onChanged: (value: boolean) => {
            if (!value) setOpenedList(null);
          },
          content: openedList ? (
            <ListDetailPage store={store} list={openedList} />
          ) : (
            <Text>选择分组</Text>
          ),
        }}
      >
        <Section
          header={
            <GlassSectionHeader
              title="Star Lists"
              detail={`${state.lists.length} 个分组`}
            />
          }
          listRowBackground={glassRowBackground}
        >
          {error ||
          (state.listsState === "loading" && state.lists.length === 0) ||
          (state.listsState !== "loading" && state.lists.length === 0) ? (
            <GlassGroup>
              {error ? (
                <>
                  <Text
                    padding={{ vertical: true }}
                    frame={{ minHeight: 44, maxWidth: "infinity" }}
                    foregroundStyle="systemRed"
                  >
                    {error}
                  </Text>
                  <GlassActionRow
                    title="重试"
                    action={() => {
                      void refresh();
                    }}
                  />
                </>
              ) : null}
              {state.listsState === "loading" && state.lists.length === 0 ? (
                <EmptyState title="正在加载分组" />
              ) : null}
              {state.listsState !== "loading" && state.lists.length === 0 ? (
                <EmptyState
                  title="暂无分组"
                  detail="GitHub 标星列表会显示在这里"
                />
              ) : null}
            </GlassGroup>
          ) : null}
          {state.lists.length > 0 ? (
            <GlassGroup>
              {state.lists.map((list, index) => (
                <GlassNavRow
                  key={list.id}
                  title={list.name}
                  detail={`${list.itemCount} 个仓库`}
                  showDivider={index < state.lists.length - 1}
                  action={() => setOpenedList(list)}
                  onMenu={() => {
                    void manageList(list);
                  }}
                />
              ))}
            </GlassGroup>
          ) : null}
        </Section>
      </List>
    </NavigationStack>
  );
}
