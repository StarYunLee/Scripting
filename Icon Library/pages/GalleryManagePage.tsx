import { Button, Group, HStack, Image, List, Section, Text, VStack } from "scripting";
import {
  GlassActionRow,
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
} from "../components/Glass";
import { glassListPageProps } from "../components/GlassListPage";
import { formatError } from "../services/errors";
import type { RemoteLibrary, RemoteLibraryStore } from "../services/models";
import {
  addRemoteLibrary,
  removeRemoteLibrary,
  renameRemoteLibrary,
  selectRemoteLibrary,
} from "../services/remoteLibraries";

function LibraryManageRow(props: {
  item: RemoteLibrary;
  isCurrent: boolean;
  onSelect: () => void;
  onRename: () => void;
  onRemove: () => void;
}) {
  const { item, isCurrent, onSelect, onRename, onRemove } = props;

  async function copyUrl() {
    await Pasteboard.setString(item.jsonUrl);
    await Dialog.alert({
      title: "已复制",
      message: "订阅地址已复制到剪贴板。",
    });
  }

  return (
    <VStack
      spacing={0}
      frame={{ maxWidth: "infinity" }}
      listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
      onTapGesture={() => {
        if (!isCurrent) {
          onSelect();
        }
      }}
      contextMenu={{
        menuItems: (
          <Group>
            <Button title="复制地址" action={() => void copyUrl()} />
          </Group>
        ),
      }}
      leadingSwipeActions={{
        allowsFullSwipe: false,
        actions: [
          <Button title="重命名" tint="accentColor" action={onRename} />,
        ],
      }}
      trailingSwipeActions={{
        allowsFullSwipe: false,
        actions: [
          <Button title="移除" role="destructive" action={onRemove} />,
        ],
      }}
    >
      <Text
        foregroundStyle="secondaryLabel"
        padding={{ vertical: true }}
        frame={{ minHeight: 44, maxWidth: "infinity", alignment: "leading" }}
      >
        {item.jsonUrl}
      </Text>
    </VStack>
  );
}

export function GalleryManagePage(props: {
  store: RemoteLibraryStore;
  onStoreChange: (store: RemoteLibraryStore) => void;
}) {
  const { store, onStoreChange } = props;

  async function addLibrary() {
    const raw = await Dialog.prompt({
      title: "添加订阅",
      message: "粘贴公开图标库的 JSON 地址。只支持 https。",
      placeholder: "https://raw.githubusercontent.com/owner/repo/main/icons.json",
    });
    if (!raw) {
      return;
    }
    try {
      const added = await addRemoteLibrary({ jsonUrl: raw });
      onStoreChange(added.store);
    } catch (error) {
      await Dialog.alert({
        title: "添加失败",
        message: formatError(error),
      });
    }
  }

  async function rename(id: string, current: string) {
    const next = await Dialog.prompt({
      title: "重命名订阅",
      message: "只改 App 内显示名称，不会修改远程 JSON。",
      defaultValue: current,
    });
    if (!next) {
      return;
    }
    try {
      onStoreChange(renameRemoteLibrary(id, next));
    } catch (error) {
      await Dialog.alert({
        title: "重命名失败",
        message: formatError(error),
      });
    }
  }

  async function remove(id: string, title: string) {
    const confirmed = await Dialog.confirm({
      title: "移除订阅",
      message: `从本机列表移除「${title}」？不会删除远程仓库。`,
      confirmLabel: "移除",
    });
    if (!confirmed) {
      return;
    }
    onStoreChange(removeRemoteLibrary(id));
  }

  return (
    <List
      navigationTitle="管理订阅"
      {...glassListPageProps()}
    >
      <Section
        listRowBackground={glassRowBackground}
        header={<GlassSectionHeader title="添加" />}
      >
        <GlassGroup>
          <GlassActionRow title="添加公开 JSON" action={() => void addLibrary()} />
        </GlassGroup>
      </Section>

      {store.libraries.length === 0 ? (
        <Section listRowBackground={glassRowBackground}>
          <GlassGroup>
            <Text
              foregroundStyle="secondaryLabel"
              padding={{ vertical: true }}
              frame={{ maxWidth: "infinity" }}
            >
              还没有订阅。添加一份公开 icons.json 即可浏览。
            </Text>
          </GlassGroup>
        </Section>
      ) : (
        store.libraries.map((item) => {
          const isCurrent = store.currentId === item.id;
          return (
            <Section
              key={item.id}
              listRowBackground={glassRowBackground}
              header={
                <HStack>
                  <Text foregroundStyle="secondaryLabel">{item.title}</Text>
                  {isCurrent ? (
                    <Image
                      systemName="checkmark.circle.fill"
                      foregroundStyle="accentColor"
                    />
                  ) : null}
                </HStack>
              }
            >
              <LibraryManageRow
                item={item}
                isCurrent={isCurrent}
                onSelect={() => onStoreChange(selectRemoteLibrary(item.id))}
                onRename={() => void rename(item.id, item.title)}
                onRemove={() => void remove(item.id, item.title)}
              />
            </Section>
          );
        })
      )}

    </List>
  );
}
