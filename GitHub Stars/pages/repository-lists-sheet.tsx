import {
  Button,
  List,
  NavigationStack,
  Section,
  Text,
  Toggle,
  useState,
} from "scripting";
import type { GitHubListSummary, GitHubRepository } from "../types";
import type { GitHubDataStore } from "../services/data-store";

export function RepositoryListsSheet(props: {
  store: GitHubDataStore;
  repository: GitHubRepository;
  lists: readonly GitHubListSummary[];
  initialListIds: readonly string[];
  onClose: () => void;
}) {
  const [selectedIds, setSelectedIds] = useState<string[]>(() => [
    ...props.initialListIds,
  ]);
  const [saving, setSaving] = useState(false);

  function setSelected(listId: string, selected: boolean) {
    setSelectedIds((current) =>
      selected
        ? Array.from(new Set([...current, listId]))
        : current.filter((id) => id !== listId),
    );
  }

  async function save() {
    if (saving) return;
    setSaving(true);
    try {
      await props.store.saveRepositoryMemberships(
        props.repository.nodeId,
        selectedIds,
      );
      props.onClose();
    } catch (error) {
      await Dialog.alert({
        title: "保存失败",
        message:
          typeof error === "object" && error !== null && "message" in error
            ? String(error.message)
            : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  async function createList() {
    if (saving) return;
    const name = await Dialog.prompt({
      title: "新建列表",
      message: "创建后会将当前仓库加入该列表。",
      placeholder: "列表名称",
      confirmLabel: "创建",
      cancelLabel: "取消",
    });
    const trimmed = name?.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await props.store.createListForRepository(
        props.repository.nodeId,
        trimmed,
        selectedIds,
      );
      props.onClose();
    } catch (error) {
      await Dialog.alert({
        title: "创建失败",
        message:
          typeof error === "object" && error !== null && "message" in error
            ? String(error.message)
            : String(error),
      });
    } finally {
      setSaving(false);
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="管理列表"
        navigationBarTitleDisplayMode="inline"
        interactiveDismissDisabled={saving}
        toolbar={{
          cancellationAction: (
            <Button title="取消" disabled={saving} action={props.onClose} />
          ),
          confirmationAction: (
            <Button
              title={saving ? "保存中…" : "保存"}
              disabled={saving}
              action={() => {
                void save();
              }}
            />
          ),
        }}
      >
        <Section header={<Text>{props.repository.fullName}</Text>}>
          {props.lists.map((list) => (
            <Toggle
              key={list.id}
              title={list.name}
              value={selectedIds.includes(list.id)}
              onChanged={(value) => setSelected(list.id, value)}
              disabled={saving}
            />
          ))}
        </Section>
        <Section>
          <Button
            title="新建列表"
            systemImage="plus"
            disabled={saving}
            action={() => {
              void createList();
            }}
          />
        </Section>
      </List>
    </NavigationStack>
  );
}
