import { useActionGate } from "../ui/action-gate";
import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Spacer,
  Text,
  TextField,
  VStack,
  ZStack,
  type Color,
  useEffect,
  useRef,
  useState,
} from "scripting";
import { TAG_COLORS, type TagRecord } from "../models/types";
import {
  buildTagMutationPayload,
  newMutationContext,
} from "../services/mutation";
import { listTags } from "../services/queries";
import { createTag, deleteTag, updateTag } from "../services/commands";
import { subscribeDataChanges } from "../services/change-store";
import { NativeSectionHeader } from "../ui/native-list";
import { appListProps, AppSection } from "../ui/theme-props";
import { useSettingsTheme } from "../ui/theme";


function ColorDot(props: {
  color: string;
  selected: boolean;
  onTap: () => void;
}) {
  return (
    <ZStack onTapGesture={props.onTap}>
      <VStack
        frame={{ width: 26, height: 26 }}
        background={props.color as Color}
        clipShape="circle"
      />
      {props.selected ? (
        <Image systemName="checkmark" font={10} foregroundStyle="white" />
      ) : null}
    </ZStack>
  );
}

export function TagCreateSheet(props: {
  onSaved: (tag: TagRecord) => void | Promise<void>;
}) {
  const dismiss = Navigation.useDismiss();
  const uiTheme = useSettingsTheme();
  const [name, setName] = useState("");
  const [color, setColor] = useState<string>(TAG_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const actionGate = useActionGate();

  const save = () => actionGate.run(() => saveImpl());
  async function saveImpl() {
    const trimmed = name.trim();
    if (!trimmed) {
      await Dialog.alert({
        title: "无法添加",
        message: "请填写标签名称。",
        buttonLabel: "好",
      });
      return;
    }
    if (busy) return;
    setBusy(true);
    try {
      const existing = (await listTags()).find((t) => t.name === trimmed);
      if (existing) {
        await props.onSaved(existing);
        dismiss();
        return;
      }
      const id = await createTag(
        trimmed,
        color,
        newMutationContext(
          "tag.create",
          buildTagMutationPayload({ name: trimmed, color }),
        ),
      );
      await props.onSaved({
        id,
        name: trimmed,
        normalizedName: trimmed.toLowerCase(),
        color,
        sortOrder: 0,
      });
      dismiss();
    } catch (err) {
      await Dialog.alert({
        title: "无法添加标签",
        message: err instanceof Error ? err.message : String(err),
        buttonLabel: "好",
      });
      setBusy(false);
    }
  }

  return (
    <NavigationStack>
      <List
        disabled={actionGate.busy}
        {...appListProps(uiTheme, "inline")}
        toolbar={{
          confirmationAction: (
            <Button
              title={busy ? "添加中" : "添加"}
              action={() => void save()}
            />
          ),
        }}
      >
        <AppSection theme={uiTheme}

          header={<NativeSectionHeader title="名称" />}
        >
            <HStack
              spacing={12}
              alignment="center"
            >
              <TextField
                title=" "
                value={name}
                onChanged={setName}
                axis="horizontal"
                frame={{ maxWidth: "infinity" }}
              />
            </HStack>
        </AppSection>
        <AppSection theme={uiTheme}

          header={<NativeSectionHeader title="颜色" />}
        >
            <HStack
              spacing={10}
              padding={{ vertical: 14 }}
              frame={{ maxWidth: "infinity" }}
            >
              {TAG_COLORS.map((item) => (
                <ColorDot
                  key={item}
                  color={item}
                  selected={color === item}
                  onTap={() => setColor(item)}
                />
              ))}
            </HStack>
        </AppSection>
      </List>
    </NavigationStack>
  );
}

export function TagEditSheet(props: {
  record: TagRecord;
  onSaved: () => void;
}) {
  const dismiss = Navigation.useDismiss();
  const uiTheme = useSettingsTheme();
  const [name, setName] = useState(props.record.name);
  const [color, setColor] = useState(props.record.color);
  const [busy, setBusy] = useState(false);
  const actionGate = useActionGate();

  const save = () => actionGate.run(() => saveImpl());
  async function saveImpl() {
    const trimmed = name.trim();
    if (!trimmed || busy) return;
    if (trimmed === props.record.name && color === props.record.color) {
      dismiss();
      return;
    }
    setBusy(true);
    try {
      const updates = {
        ...(trimmed === props.record.name ? {} : { name: trimmed }),
        ...(color === props.record.color ? {} : { color }),
      };
      await updateTag(
        props.record.id,
        updates,
        newMutationContext(
          "tag.update",
          buildTagMutationPayload({ id: props.record.id, ...updates }),
        ),
      );
      props.onSaved();
      dismiss();
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await Dialog.alert({
        title: "无法修改标签",
        message,
        buttonLabel: "好",
      });
      setBusy(false);
    }
  }

  return (
    <NavigationStack>
      <List
        disabled={actionGate.busy || busy}
        {...appListProps(uiTheme, "inline")}
        toolbar={{
          cancellationAction: (
            <Button title="取消" disabled={busy} action={() => dismiss()} />
          ),
          confirmationAction: (
            <Button
              title={busy ? "保存中" : "保存"}
              disabled={!name.trim() || busy}
              action={() => void save()}
            />
          ),
        }}
      >
        <AppSection theme={uiTheme}

          header={<NativeSectionHeader title="名称" />}
        >
            <HStack
              spacing={12}
              alignment="center"
            >
              <TextField
                title=" "
                value={name}
                onChanged={setName}
                axis="horizontal"
                frame={{ maxWidth: "infinity" }}
              />
            </HStack>
        </AppSection>
        <AppSection theme={uiTheme}

          header={<NativeSectionHeader title="颜色" />}
        >
            <HStack
              spacing={10}
              padding={{ vertical: 14 }}
              frame={{ maxWidth: "infinity" }}
            >
              {TAG_COLORS.map((item) => (
                <ColorDot
                  key={item}
                  color={item}
                  selected={color === item}
                  onTap={() => setColor(item)}
                />
              ))}
            </HStack>
        </AppSection>
      </List>
    </NavigationStack>
  );
}

export function TagSettingsPage() {
  const uiTheme = useSettingsTheme();
  const [tags, setTags] = useState<TagRecord[]>([]);
  const [newName, setNewName] = useState("");
  const [newColor, setNewColor] = useState<string>(TAG_COLORS[0]);
  const [busy, setBusy] = useState(false);
  const actionGate = useActionGate();
  const [loadError, setLoadError] = useState<string | null>(null);

  const reloadGeneration = useRef(0);
  const reloadAlive = useRef(true);
  async function reload() {
    if (!reloadAlive.current) return;
    const generation = ++reloadGeneration.current;
    try {
      const next = await listTags();
      if (!reloadAlive.current || generation !== reloadGeneration.current) return;
      setTags(next);
      setLoadError(null);
    } catch (error) {
      if (!reloadAlive.current || generation !== reloadGeneration.current) return;
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }

  useEffect(() => {
    reloadAlive.current = true;
    void reload();
    const unsubscribe = subscribeDataChanges(() => void reload());
    return () => {
      reloadAlive.current = false;
      reloadGeneration.current++;
      unsubscribe();
    };
  }, []);

  const handleAdd = () => actionGate.run(() => handleAddImpl());
  async function handleAddImpl() {
    const trimmed = newName.trim();
    if (!trimmed || busy) return;
    setBusy(true);
    try {
      await createTag(
        trimmed,
        newColor,
        newMutationContext(
          "tag.create",
          buildTagMutationPayload({ name: trimmed, color: newColor }),
        ),
      );
      setNewName("");
      await reload();
    } catch (err) {
      await Dialog.alert({
        title: "无法添加标签",
        message: err instanceof Error ? err.message : String(err),
        buttonLabel: "好",
      });
    } finally {
      setBusy(false);
    }
  }

  const handleEdit = (tag: TagRecord) =>
    actionGate.run(() => handleEditImpl(tag));
  async function handleEditImpl(tag: TagRecord) {
    await Navigation.present({
      element: <TagEditSheet record={tag} onSaved={() => void reload()} />,
      modalPresentationStyle: "pageSheet",
    });
  }

  const handleDelete = (tag: TagRecord) =>
    actionGate.run(() => handleDeleteImpl(tag));
  async function handleDeleteImpl(tag: TagRecord) {
    const ok = await Dialog.confirm({
      title: "删除标签",
      message: `确定要删除「${tag.name}」吗？物品上的该标签会被移除。`,
      confirmLabel: "删除",
      cancelLabel: "取消",
    });
    if (!ok) return;
    // 乐观立即剔除 UI 列表中该项，带来零延迟即时响应体验
    setTags((prev) => prev.filter((t) => t.id !== tag.id));
    try {
      await deleteTag(
        tag.id,
        newMutationContext(
          "tag.delete",
          buildTagMutationPayload({ id: tag.id }),
        ),
      );
    } catch (err) {
      await Dialog.alert({
        title: "删除失败",
        message: err instanceof Error ? err.message : String(err),
        buttonLabel: "好",
      });
      await reload();
    }
  }

  return (
    <List
      disabled={actionGate.busy}
      {...appListProps(uiTheme, "inline")}
    >
      {loadError ? (
        <AppSection theme={uiTheme} >
            <Text foregroundStyle="systemRed">{loadError}</Text>
            <Button title="重试读取" action={() => void reload()} />
        </AppSection>
      ) : null}
      <AppSection theme={uiTheme}

        header={<NativeSectionHeader title="新建标签" />}
      >
          <HStack
            spacing={12}
            alignment="center"
          >
            <VStack
              frame={{ width: 24, height: 24 }}
              background={newColor as Color}
              clipShape="circle"
            />
            <TextField
              title=" "
              value={newName}
              onChanged={setNewName}
              axis="horizontal"
              frame={{ maxWidth: "infinity" }}
            />
            <Button
              buttonStyle="plain"
              disabled={!newName.trim() || busy}
              action={() => void handleAdd()}
            >
              <Image
                systemName="plus.circle.fill"
                font={22}
                foregroundStyle={
                  !newName.trim() || busy ? "tertiaryLabel" : "accentColor"
                }
              />
            </Button>
          </HStack>
          <HStack spacing={10} frame={{ maxWidth: "infinity" }}>
            {TAG_COLORS.map((color) => (
              <ColorDot
                key={color}
                color={color}
                selected={newColor === color}
                onTap={() => setNewColor(color)}
              />
            ))}
          </HStack>
      </AppSection>

      <AppSection theme={uiTheme}

        header={
          <NativeSectionHeader title="已有标签" detail={`${tags.length} 个`} />
        }
      >
          {tags.length === 0 ? (
            <Text
              font="subheadline"
              foregroundStyle="secondaryLabel"
              padding={{ vertical: 16 }}
            >
              还没有标签
            </Text>
          ) : (
            tags.map((tag) => (
              <VStack key={tag.id} spacing={0} frame={{ maxWidth: "infinity" }}>
                <HStack
                  spacing={12}
                  alignment="center"
                  contentShape="rect"
                >
                  <Button
                    buttonStyle="plain"
                    action={() => void handleEdit(tag)}
                  >
                    <VStack
                      frame={{ width: 24, height: 24 }}
                      background={tag.color as Color}
                      clipShape="circle"
                    />
                  </Button>
                  <Button
                    buttonStyle="plain"
                    action={() => void handleEdit(tag)}
                  >
                    <Text font="body">{tag.name}</Text>
                  </Button>
                  <Spacer />
                  <Button
                    buttonStyle="plain"
                    action={() => void handleDelete(tag)}
                  >
                    <Image
                      systemName="trash"
                      font={14}
                      foregroundStyle="systemGray3"
                    />
                  </Button>
                </HStack>
              </VStack>
            ))
          )}
      </AppSection>
    </List>
  );
}
