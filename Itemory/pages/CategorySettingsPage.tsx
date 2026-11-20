import { useActionGate } from "../ui/action-gate";
import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  Spacer,
  Text,
  TextField,
  VStack,
  useEffect,
  useRef,
  useState,
} from "scripting";
import type { CategoryRecord } from "../models/types";
import {
  buildCategoryMutationPayload,
  newMutationContext,
} from "../services/mutation";
import { listCategories } from "../services/queries";
import {
  createCategory,
  deleteCategory,
  updateCategory,
} from "../services/commands";
import { subscribeDataChanges, notifyDataChanged } from "../services/change-store";
import { getHiddenCategoryIds, toggleCategoryHidden } from "../services/prefs";


import { IconPickerModal } from "./IconPickerModal";
import { NativeSectionHeader, NativeNoteRow } from "../ui/native-list";
import { appListProps, AppSection } from "../ui/theme-props";
import { useSettingsTheme } from "../ui/theme";

function CategoryIcon(props: { symbol: string }) {
  const symbol = props.symbol || "shippingbox.fill";
  return (
    <VStack
      frame={{ width: 24, height: 24 }}
      alignment="center"
      contentShape="rect"
    >
      <Image
        systemName={symbol}
        font={17}
        foregroundStyle="accentColor"
        frame={{ width: 24, height: 24 }}
      />
    </VStack>
  );
}

export function CategorySettingsPage() {
  const uiTheme = useSettingsTheme();
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [newCatName, setNewCatName] = useState("");
  const [selectedIcon, setSelectedIcon] = useState("shippingbox.fill");
  const [busy, setBusy] = useState(false);
  const actionGate = useActionGate();
  const [loadError, setLoadError] = useState<string | null>(null);
  const [hiddenIds, setHiddenIds] = useState<string[]>(() => {
    try {
      return getHiddenCategoryIds();
    } catch {
      return [];
    }
  });

  const systemCats = categories.filter((category) => category.isSystem);
  const customCats = categories.filter((category) => !category.isSystem);

  const reloadGeneration = useRef(0);
  const reloadAlive = useRef(true);
  async function reload() {
    if (!reloadAlive.current) return;
    const generation = ++reloadGeneration.current;
    try {
      try {
        setHiddenIds(getHiddenCategoryIds());
      } catch {
        // ignore in test mock
      }
      const list = await listCategories();
      if (!reloadAlive.current || generation !== reloadGeneration.current) return;
      setCategories(list);
      setLoadError(null);
    } catch (error) {
      if (!reloadAlive.current || generation !== reloadGeneration.current) return;
      setLoadError(error instanceof Error ? error.message : String(error));
    }
  }

  const handleToggleHidden = (catId: string) =>
    actionGate.run(() => handleToggleHiddenImpl(catId));
  async function handleToggleHiddenImpl(catId: string) {
    const { success, isHidden } = await toggleCategoryHidden(catId);
    if (!success) {
      await Dialog.alert({
        title: "设置保存失败",
        message: "未能写入设备偏好，请重试。",
        buttonLabel: "好",
      });
      return;
    }
    setHiddenIds((prev) =>
      isHidden ? [...prev, catId] : prev.filter((id) => id !== catId),
    );
    notifyDataChanged();
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

  async function openIconPicker() {
    await Navigation.present({
      element: (
        <IconPickerModal
          kind="category"
          selectedSymbol={selectedIcon}
          onSelect={(item) => setSelectedIcon(item.symbol)}
        />
      ),
      modalPresentationStyle: "pageSheet",
    });
  }

  const handleAdd = () => actionGate.run(() => handleAddImpl());
  async function handleAddImpl() {
    const trimmed = newCatName.trim();
    if (!trimmed) {
      await Dialog.alert({
        title: "无法添加",
        message: "请填写分类名称。",
        buttonLabel: "好",
      });
      return;
    }
    setBusy(true);
    try {
      await createCategory(
        trimmed,
        selectedIcon,
        newMutationContext(
          "category.create",
          buildCategoryMutationPayload({ name: trimmed, icon: selectedIcon }),
        ),
      );
      setNewCatName("");
      await reload();
    } catch (err) {
      await Dialog.alert({
        title: "无法添加分类",
        message: err instanceof Error ? err.message : String(err),
        buttonLabel: "好",
      });
    } finally {
      setBusy(false);
    }
  }

  const handleRename = (cat: CategoryRecord) =>
    actionGate.run(() => handleRenameImpl(cat));
  async function handleRenameImpl(cat: CategoryRecord) {
    const raw = await Dialog.prompt({
      title: "重命名分类",
      defaultValue: cat.name,
      confirmLabel: "保存",
      cancelLabel: "取消",
    });
    const trimmed = raw?.trim() ?? "";
    if (!trimmed || trimmed === cat.name) return;
    try {
      await updateCategory(
        cat.id,
        { name: trimmed },
        newMutationContext(
          "category.update",
          buildCategoryMutationPayload({ id: cat.id, name: trimmed }),
        ),
      );
      await reload();
    } catch (err) {
      await Dialog.alert({
        title: "重命名失败",
        message: err instanceof Error ? err.message : String(err),
        buttonLabel: "好",
      });
    }
  }

  const handleChangeIcon = (cat: CategoryRecord) =>
    actionGate.run(() => handleChangeIconImpl(cat));
  async function handleChangeIconImpl(cat: CategoryRecord) {
    await Navigation.present({
      element: (
        <IconPickerModal
          kind="category"
          selectedSymbol={cat.icon}
          onSelect={async (item) => {
            try {
              await updateCategory(
                cat.id,
                { icon: item.symbol },
                newMutationContext(
                  "category.update",
                  buildCategoryMutationPayload({
                    id: cat.id,
                    icon: item.symbol,
                  }),
                ),
              );
              await reload();
            } catch (err) {
              await Dialog.alert({
                title: "修改图标失败",
                message: err instanceof Error ? err.message : String(err),
                buttonLabel: "好",
              });
              throw err;
            }
          }}
        />
      ),
      modalPresentationStyle: "pageSheet",
    });
  }

  const handleDelete = (cat: CategoryRecord) =>
    actionGate.run(() => handleDeleteImpl(cat));
  async function handleDeleteImpl(cat: CategoryRecord) {
    if (cat.isSystem) return;
    const ok = await Dialog.confirm({
      title: "删除分类",
      message: `确定要删除「${cat.name}」吗？属于该分类的物品将保留并变为未分类。`,
      confirmLabel: "删除",
      cancelLabel: "取消",
    });
    if (!ok) return;
    try {
      await deleteCategory(
        cat.id,
        newMutationContext(
          "category.delete",
          buildCategoryMutationPayload({ id: cat.id }),
        ),
      );
      await reload();
    } catch (err) {
      await Dialog.alert({
        title: "删除分类失败",
        message: err instanceof Error ? err.message : String(err),
        buttonLabel: "好",
      });
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

        header={<NativeSectionHeader title="新建分类" />}
      >
          <HStack
            spacing={12}
            alignment="center"
          >
            <Button buttonStyle="plain" action={() => void openIconPicker()}>
              <CategoryIcon symbol={selectedIcon} />
            </Button>
            <TextField
              title=" "
              value={newCatName}
              onChanged={setNewCatName}
              axis="horizontal"
              frame={{ maxWidth: "infinity" }}
            />
            <Button
              buttonStyle="plain"
              disabled={!newCatName.trim() || busy}
              action={() => void handleAdd()}
            >
              <Image
                systemName="plus.circle.fill"
                font={22}
                foregroundStyle={
                  !newCatName.trim() || busy ? "tertiaryLabel" : "accentColor"
                }
              />
            </Button>
          </HStack>
      </AppSection>

      <AppSection theme={uiTheme}

        header={<NativeSectionHeader title="默认分类" />}
        footer={
          <NativeNoteRow text="默认分类不可修改或删除，但可点击右侧眼睛按钮在录入与筛选中隐藏不需要的分类。历史已归类物品不受影响。" />
        }
      >
          {systemCats.map((cat) => {
            const isHidden = hiddenIds.includes(cat.id);
            const isProtected = cat.id === "other";
            return (
              <VStack key={cat.id} spacing={0} frame={{ maxWidth: "infinity" }}>
                <HStack
                  spacing={12}
                  alignment="center"
                >
                  <CategoryIcon symbol={cat.icon} />
                  <Text
                    foregroundStyle={isHidden ? "secondaryLabel" : "label"}
                  >
                    {cat.name}
                  </Text>
                  {isHidden ? (
                    <Text font="caption2" foregroundStyle="tertiaryLabel">
                      (已隐藏)
                    </Text>
                  ) : null}
                  <Spacer />
                  {!isProtected ? (
                    <Button
                      buttonStyle="plain"
                      action={() => void handleToggleHidden(cat.id)}
                    >
                      <Image
                        systemName={isHidden ? "eye.slash.fill" : "eye"}
                        font={16}
                        foregroundStyle={
                          isHidden ? "systemGray3" : "secondaryLabel"
                        }
                      />
                    </Button>
                  ) : null}
                </HStack>
              </VStack>
            );
          })}
      </AppSection>

      {customCats.length > 0 ? (
        <AppSection theme={uiTheme}

          header={
            <NativeSectionHeader
              title="自定义分类"
              detail={`${customCats.length} 个`}
            />
          }
        >
            {customCats.map((cat) => (
              <VStack key={cat.id} spacing={0} frame={{ maxWidth: "infinity" }}>
                <HStack
                  spacing={12}
                  alignment="center"
                  contentShape="rect"
                >
                  <Button
                    buttonStyle="plain"
                    action={() => void handleChangeIcon(cat)}
                  >
                    <CategoryIcon symbol={cat.icon} />
                  </Button>
                  <Button
                    buttonStyle="plain"
                    action={() => void handleRename(cat)}
                  >
                    <Text>{cat.name}</Text>
                  </Button>
                  <Spacer />
                  <Button
                    buttonStyle="plain"
                    action={() => void handleDelete(cat)}
                  >
                    <Image
                      systemName="trash"
                      font={14}
                      foregroundStyle="systemGray3"
                    />
                  </Button>
                </HStack>
              </VStack>
            ))}
        </AppSection>
      ) : null}
    </List>
  );
}
