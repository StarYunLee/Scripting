import { useActionGate } from "../ui/action-gate";
import {
  Button,
  Circle,
  HStack,
  Image,
  List,
  Menu,
  Navigation,
  NavigationStack,
  Rectangle,
  Section,
  Spacer,
  Text,
  VStack,
  type Color,
  useRef,
  useEffect,
  useState,
} from "scripting";
import type {
  CategoryRecord,
  CostSummary,
  ItemCondition,
  ItemExitRecord,
  ItemRecord,
  TagRecord,
  TimelineDisplayItem,
} from "../models/types";
import {
  EXPENSE_KIND_ICONS,
  itemStatusBadge,
  TIMELINE_TYPE_LABELS,
} from "../models/types";
import { formatMinorMoney, formatYmdZh, todayYmd } from "../services/format";
import { getItemDetail, listCategories, listTags } from "../services/queries";
import { deleteItem, deleteMoneyEntry, updateItem } from "../services/commands";
import { filterSelectableCategories } from "../services/prefs";
import { subscribeDataChanges } from "../services/change-store";
import {
  buildDeleteItemMutationPayload,
  buildItemMutationPayload,
  buildMoneyMutationPayload,
  newMutationContext,
} from "../services/mutation";


import { EntryModal } from "./EntryModal";
import { ExitModal } from "./ExitModal";
import { ItemEditorPage } from "./ItemEditorPage";
import { TagCreateSheet } from "./TagSettingsPage";
import { isEmojiSymbol } from "../ui/UniversalIcon";
import { nativeListPageProps, NativeSectionHeader, NativeActionRow } from "../ui/native-list";
import { tintedFill } from "../ui/tint";
import {
  GlassActionRow,
  GlassDivider,
  GlassGroup,
  GlassSectionHeader,
  glassRowBackground,
  glassSettingsListProps,
} from "../ui/glass-settings";
import { useUiTheme } from "../ui/theme";

function FactRow(props: {
  title: string;
  value: string;
  valueColor?: Color;
  systemImage?: string;
}) {
  return (
    <HStack spacing={12} alignment="center" frame={{ maxWidth: "infinity" }}>
      {props.systemImage ? (
        <Image
          systemName={props.systemImage}
          font={16}
          foregroundStyle="accentColor"
          frame={{ width: 22, alignment: "center" }}
        />
      ) : null}
      <Text foregroundStyle="secondaryLabel">{props.title}</Text>
      <Spacer />
      {props.valueColor ? (
        <Text
          multilineTextAlignment="trailing"
          foregroundStyle={props.valueColor}
        >
          {props.value}
        </Text>
      ) : (
        <Text multilineTextAlignment="trailing">{props.value}</Text>
      )}
    </HStack>
  );
}

function GlassFactRow(props: {
  title: string;
  value: string;
  valueColor?: Color;
  systemImage?: string;
}) {
  return (
    <HStack
      spacing={12}
      padding={{ vertical: true }}
      frame={{ minHeight: 44, maxWidth: "infinity" }}
      alignment="center"
    >
      {props.systemImage ? (
        <Image
          systemName={props.systemImage}
          font={16}
          foregroundStyle="accentColor"
          frame={{ width: 22, alignment: "center" }}
        />
      ) : null}
      <Text foregroundStyle="secondaryLabel">{props.title}</Text>
      <Spacer />
      {props.valueColor ? (
        <Text
          multilineTextAlignment="trailing"
          foregroundStyle={props.valueColor}
        >
          {props.value}
        </Text>
      ) : (
        <Text multilineTextAlignment="trailing">{props.value}</Text>
      )}
    </HStack>
  );
}

function InteractiveChip(props: {
  icon?: string;
  dotColor?: Color;
  title: string;
  color: Color;
  showChevron?: boolean;
}) {
  return (
    <HStack
      spacing={5}
      padding={{ horizontal: 9, vertical: 5 }}
      background={tintedFill(String(props.color), 0.14)}
      clipShape="capsule"
      alignment="center"
    >
      {props.dotColor ? (
        <Circle fill={props.dotColor} frame={{ width: 6, height: 6 }} />
      ) : null}
      {props.icon ? (
        <Image
          systemName={props.icon}
          font={11}
          foregroundStyle={props.color}
        />
      ) : null}
      <Text font="caption" fontWeight="medium" lineLimit={1}>
        {props.title}
      </Text>
      {props.showChevron ? (
        <Image
          systemName="chevron.down"
          font={8}
          foregroundStyle="secondaryLabel"
          opacity={0.8}
        />
      ) : null}
    </HStack>
  );
}

function CategoryMenuLabel(props: {
  selected: boolean;
  icon: string;
  title: string;
}) {
  return (
    <HStack spacing={8} frame={{ minWidth: 220, alignment: "leading" }}>
      {props.selected ? (
        <Image systemName="checkmark" font={13} frame={{ width: 16 }} />
      ) : (
        <VStack frame={{ width: 16 }} />
      )}
      <Image systemName={props.icon} font={16} frame={{ width: 20 }} />
      <Text>{props.title}</Text>
    </HStack>
  );
}

export function ItemPage(props: { itemId: string; onUpdate?: () => void }) {
  const { itemId, onUpdate } = props;
  const dismiss = Navigation.useDismiss();

  const [ready, setReady] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [item, setItem] = useState<ItemRecord | null>(null);
  const [category, setCategory] = useState<CategoryRecord | null>(null);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [timeline, setTimeline] = useState<TimelineDisplayItem[]>([]);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [exit, setExit] = useState<ItemExitRecord | null>(null);
  const [itemTags, setItemTags] = useState<TagRecord[]>([]);
  const [allTags, setAllTags] = useState<TagRecord[]>([]);
  const [coverPath, setCoverPath] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const itemRef = useRef<ItemRecord | null>(null);
  const itemTagsRef = useRef<TagRecord[]>([]);
  const quickBusy = useRef(false);
  const actionGate = useActionGate();
  const theme = useUiTheme();
  const detailRequest = useRef({ generation: 0, alive: true });

  useEffect(() => {
    detailRequest.current.alive = true;
    return () => {
      detailRequest.current.alive = false;
      detailRequest.current.generation += 1;
    };
  }, []);

  function applyDetail(detail: NonNullable<Awaited<ReturnType<typeof getItemDetail>>>) {
    itemRef.current = detail.item;
    itemTagsRef.current = detail.tags;
    setItem(detail.item);
    setCategory(detail.category);
    setTimeline(detail.timeline);
    setSummary(detail.summary);
    setExit(detail.exit);
    setItemTags(detail.tags);
    setCoverPath(detail.coverPath);
  }

  useEffect(() => {
    let cancelled = false;
    const generation = ++detailRequest.current.generation;
    const isCurrent = () =>
      !cancelled && detailRequest.current.alive &&
      generation === detailRequest.current.generation;
    void (async () => {
      try {
        const [detail, tagList, catList] = await Promise.all([
          getItemDetail(itemId),
          listTags(),
          listCategories(),
        ]);
        if (!isCurrent()) return;
        if (!detail) throw new Error("找不到该物品档案");

        applyDetail(detail);
        setCategories(catList);
        setAllTags(tagList);
        setLoadError(null);
        setReady(true);
      } catch (err) {
        if (isCurrent()) {
          setLoadError(err instanceof Error ? err.message : String(err));
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, tick]);

  useEffect(() => subscribeDataChanges(() => setTick((v) => v + 1)), []);

  function refresh() {
    setTick((v) => v + 1);
    if (onUpdate) onUpdate();
  }

  function buildCurrentItemMutation(
    overrides: Partial<{
      categoryId: string | null;
      holdingCondition: ItemCondition;
      tagIds: string[];
    }>,
    sourceItem: ItemRecord | null = itemRef.current,
    sourceTags: TagRecord[] = itemTagsRef.current,
  ) {
    if (!sourceItem) throw new Error("物品尚未载入");
    return buildItemMutationPayload({
      id: sourceItem.id,
      name: sourceItem.name,
      categoryId:
        overrides.categoryId !== undefined
          ? overrides.categoryId
          : sourceItem.categoryId,
      acquiredOn: sourceItem.acquiredOn,
      acquisitionAmountMinor: sourceItem.acquisitionAmountMinor,
      holdingCondition:
        overrides.holdingCondition ?? sourceItem.holdingCondition,
      iconSymbol: sourceItem.iconSymbol,
      coverAssetId: sourceItem.coverAssetId,
      channel: sourceItem.channel,
      warrantyUntil: sourceItem.warrantyUntil,
      valuationMinor: sourceItem.valuationMinor,
      notes: sourceItem.notes,
      tagIds: overrides.tagIds ?? sourceTags.map((tag) => tag.id),
      expectedRevision: sourceItem.revision,
    });
  }

  async function applyQuickItemUpdate(
    commandPayload: ReturnType<typeof buildItemMutationPayload>,
  ): Promise<"saved" | "saved_refresh_failed"> {
    const targetId = commandPayload.id;
    if (!targetId || !detailRequest.current.alive) return "saved";
    if (quickBusy.current) throw new Error("正在保存并刷新，请稍后再操作。");
    quickBusy.current = true;
    let committed = false;
    let generation: number | null = null;
    try {
      await updateItem({
        ...commandPayload,
        id: targetId,
        expectedRevision: commandPayload.expectedRevision ?? 0,
        command: newMutationContext("item.update", commandPayload),
      });
      committed = true;
      if (!detailRequest.current.alive) return "saved";
      generation = ++detailRequest.current.generation;
      const next = await getItemDetail(targetId);
      if (!detailRequest.current.alive || generation !== detailRequest.current.generation)
        return "saved";
      if (!next) throw new Error("物品已不存在");
      applyDetail(next);
      setLoadError(null);
      return "saved";
    } catch (error) {
      if (!detailRequest.current.alive ||
          (generation !== null && generation !== detailRequest.current.generation))
        return "saved";
      if (committed) return "saved_refresh_failed";
      throw error;
    } finally {
      quickBusy.current = false;
    }
  }

  function requireQuickRefresh(
    result: "saved" | "saved_refresh_failed",
  ): void {
    if (result === "saved_refresh_failed")
      throw new Error("已保存，但刷新失败；请重新打开详情，不要重复保存。");
  }

  const handleQuickCategoryChange = (nextCatId: string | null) =>
    actionGate.run(() => handleQuickCategoryChangeImpl(nextCatId));
  async function handleQuickCategoryChangeImpl(nextCatId: string | null) {
    if (!item) return;
    try {
      requireQuickRefresh(
        await applyQuickItemUpdate(
          buildCurrentItemMutation({ categoryId: nextCatId }),
        ),
      );
    } catch (err) {
      await Dialog.alert({
        title: "无法更改分类",
        message: err instanceof Error ? err.message : String(err),
        buttonLabel: "好",
      });
    }
  }

  const handleQuickStatusChange = (nextMarker: ItemCondition) =>
    actionGate.run(() => handleQuickStatusChangeImpl(nextMarker));
  async function handleQuickStatusChangeImpl(nextMarker: ItemCondition) {
    if (!item) return;
    try {
      requireQuickRefresh(
        await applyQuickItemUpdate(
          buildCurrentItemMutation({ holdingCondition: nextMarker }),
        ),
      );
    } catch (err) {
      await Dialog.alert({
        title: "无法更改状态",
        message: err instanceof Error ? err.message : String(err),
        buttonLabel: "好",
      });
    }
  }

  const handleQuickToggleTag = (tagId: string) =>
    actionGate.run(() => handleQuickToggleTagImpl(tagId));
  async function handleQuickToggleTagImpl(tagId: string) {
    if (!itemRef.current) return;
    try {
      const currentIds = itemTagsRef.current.map((tag) => tag.id);
      const nextIds = currentIds.includes(tagId)
        ? currentIds.filter((id) => id !== tagId)
        : [...currentIds, tagId];
      requireQuickRefresh(
        await applyQuickItemUpdate(
          buildCurrentItemMutation({ tagIds: nextIds }),
        ),
      );
    } catch (err) {
      await Dialog.alert({
        title: "无法更改标签",
        message: err instanceof Error ? err.message : String(err),
        buttonLabel: "好",
      });
    }
  }

  const handleQuickAddTag = () => actionGate.runQuiet(() => handleQuickAddTagImpl());
  async function handleQuickAddTagImpl() {
    if (!itemRef.current) return;
    await Navigation.present({
      element: (
        <TagCreateSheet
          onSaved={async (createdTag) => {
            if (!detailRequest.current.alive) return;
            setAllTags((previous) =>
              previous.some((tag) => tag.id === createdTag.id)
                ? previous
                : [...previous, createdTag],
            );
            try {
              const latest = await getItemDetail(itemId);
              if (!detailRequest.current.alive) return;
              if (!latest) throw new Error("物品已不存在");
              const currentIds = latest.tags.map((tag) => tag.id);
              const nextIds = currentIds.includes(createdTag.id)
                ? currentIds
                : [...currentIds, createdTag.id];
              const result = await applyQuickItemUpdate(
                buildCurrentItemMutation(
                  { tagIds: nextIds },
                  latest.item,
                  latest.tags,
                ),
              );
              if (
                result === "saved_refresh_failed" &&
                detailRequest.current.alive
              ) {
                refresh();
                await Dialog.alert({
                  title: "标签已关联，刷新失败",
                  message:
                    "标签关联已经保存。请重新打开详情查看，不要再次切换该标签。",
                  buttonLabel: "知道了",
                });
              }
            } catch (err) {
              if (!detailRequest.current.alive) return;
              refresh();
              await Dialog.alert({
                title: "标签已创建，但未关联",
                message: `${err instanceof Error ? err.message : String(err)}\n\n标签已经保留，可在标签菜单中重新勾选，无需再次创建。`,
                buttonLabel: "知道了",
              });
            }
          }}
        />
      ),
      modalPresentationStyle: "pageSheet",
    });
  }

  const openEdit = () => actionGate.runQuiet(() => openEditImpl());
  async function openEditImpl() {
    await Navigation.present({
      element: (
        <NavigationStack>
          <ItemEditorPage itemId={itemId} onSaved={() => refresh()} />
        </NavigationStack>
      ),
      modalPresentationStyle: "pageSheet",
    });
  }

  const openAddEntry = () => actionGate.runQuiet(() => openAddEntryImpl());
  async function openAddEntryImpl() {
    if (!item) return;
    const actions =
      exit === null
        ? [{ label: "记录支出" }, { label: "记录收入" }, { label: "结束持有" }]
        : [{ label: "记录支出" }, { label: "记录收入" }];
    const selected = await Dialog.actionSheet({
      title: "选择记录类型",
      message:
        exit === null
          ? "支出：配件、维修、保养等花费\n收入：退款、理赔、补偿等日常回款\n结束持有：出售、赠送、丢弃或遗失，出售回收款也在这里填写"
          : "支出：记录结束持有后的额外花费\n收入：记录退款、理赔、补偿等后续回款",
      actions,
    });
    if (selected !== 0 && selected !== 1 && selected !== 2) return;
    if (selected === 2 && actions.length < 3) return;

    const recordType: "expense" | "income" | "end_holding" =
      selected === 0 ? "expense" : selected === 1 ? "income" : "end_holding";

    if (recordType === "end_holding") {
      await Navigation.present({
        element: (
          <ExitModal
            itemId={itemId}
            expectedRevision={item.revision}
            onSuccess={() => refresh()}
          />
        ),
        modalPresentationStyle: "pageSheet",
      });
      return;
    }

    await Navigation.present({
      element: (
        <EntryModal
          itemId={itemId}
          defaultNature={recordType}
          expectedRevision={item.revision}
          onSaved={() => refresh()}
        />
      ),
      modalPresentationStyle: "pageSheet",
    });
  }

  const openEditEntry = (entry: TimelineDisplayItem) =>
    actionGate.runQuiet(() => openEditEntryImpl(entry));
  async function openEditEntryImpl(entry: TimelineDisplayItem) {
    if (!entry.canEdit) return;
    if (entry.type === "exit") {
      await openExitImpl();
      return;
    }
    await Navigation.present({
      element: (
        <EntryModal
          itemId={itemId}
          entry={entry}
          expectedRevision={item?.revision ?? 0}
          onSaved={() => refresh()}
        />
      ),
      modalPresentationStyle: "pageSheet",
    });
  }

  async function openExitImpl() {
    await Navigation.present({
      element: (
        <ExitModal
          itemId={itemId}
          expectedRevision={item?.revision ?? 0}
          exitRecord={exit}
          item={item}
          onSuccess={() => refresh()}
        />
      ),
      modalPresentationStyle: "pageSheet",
    });
  }

  const handleDelete = () => actionGate.runQuiet(() => handleDeleteImpl());
  async function handleDeleteImpl() {
    const ok = await Dialog.confirm({
      title: "删除物品",
      message: "将永久删除该物品的所有陪伴记录、花费流水与照片，不可撤销。",
      confirmLabel: "删除",
      cancelLabel: "取消",
    });
    if (!ok || !item) return;
    try {
      const payload = buildDeleteItemMutationPayload(itemId, item.revision);
      const result = await deleteItem({
        itemId,
        expectedRevision: item.revision,
        command: newMutationContext("item.delete", payload),
      });
      if (result.coverCleanup?.status === "failed") {
        await Dialog.alert({
          title: "物品已删除",
          message:
            "物品数据已提交，但正式封面清理失败。请稍后重试清理，不要重复删除物品。",
          buttonLabel: "知道了",
        });
      }
      if (onUpdate) onUpdate();
      dismiss();
    } catch (error) {
      await Dialog.alert({
        title: "无法删除物品",
        message: error instanceof Error ? error.message : String(error),
        buttonLabel: "好",
      });
    }
  }

  const handleDeleteEntry = (entry: TimelineDisplayItem) =>
    actionGate.runQuiet(() => handleDeleteEntryImpl(entry));
  async function handleDeleteEntryImpl(entry: TimelineDisplayItem) {
    if (!entry.canDelete) return;
    const ok = await Dialog.confirm({
      title: "删除记录",
      message: `确定要删除「${entry.title}」吗？`,
      confirmLabel: "删除",
      cancelLabel: "取消",
    });
    if (!ok || !item) return;

    try {
      const payload = buildMoneyMutationPayload({
        id: entry.id,
        itemId,
        expectedRevision: item.revision,
      });
      await deleteMoneyEntry({
        id: entry.id,
        itemId,
        expectedRevision: item.revision,
        command: newMutationContext("money.delete", payload),
      });
      refresh();
    } catch (error) {
      await Dialog.alert({
        title: "无法删除记录",
        message: error instanceof Error ? error.message : String(error),
        buttonLabel: "好",
      });
    }
  }

  const isExited = exit !== null;
  const amountSummaryComplete = summary
    ? summary.available &&
      summary.isAcquisitionPriceKnown &&
      summary.isExitPriceKnown
    : false;
  const badge = item
    ? itemStatusBadge(item, exit)
    : { label: "在用", color: "#34C759" as Color };
  const displayIcon = item?.iconSymbol || category?.icon || "shippingbox.fill";

  const warranty =
    item?.warrantyUntil != null
      ? item.warrantyUntil < todayYmd()
        ? { label: "已过保", color: "#FF3B30" as Color }
        : { label: "保修中", color: "#34C759" as Color }
      : null;

  const glass = theme === "glass";

  return (
    <List
      disabled={actionGate.busy}
      navigationTitle=""
      {...(glass ? glassSettingsListProps("inline") : nativeListPageProps("inline"))}
      toolbar={{
        topBarTrailing: [
          <Button key="edit" title="编辑" action={() => void openEdit()} />,
        ],
      }}
    >
      {!ready ? (
        glass ? (
        <Section listRowBackground={glassRowBackground}>
          <GlassGroup>
            <Text foregroundStyle="secondaryLabel">载入档案中…</Text>
          </GlassGroup>
        </Section>
        ) : (
          <Section>
              <Text foregroundStyle="secondaryLabel">载入档案中…</Text>
          </Section>
        )
      ) : loadError ? (
        glass ? (
        <Section listRowBackground={glassRowBackground}>
          <GlassGroup>
            <VStack alignment="leading" spacing={8} padding={{ vertical: 8 }}>
              <Text>档案读取失败</Text>
              <Text foregroundStyle="secondaryLabel">{loadError}</Text>
              <Button title="重试读取" action={() => setTick((v) => v + 1)} />
            </VStack>
          </GlassGroup>
        </Section>
        ) : (
          <Section>
              <VStack alignment="leading" spacing={8} padding={{ vertical: 8 }}>
                <Text>档案读取失败</Text>
                <Text foregroundStyle="secondaryLabel">{loadError}</Text>
                <Button title="重试读取" action={() => setTick((v) => v + 1)} />
              </VStack>
          </Section>
        )
      ) : item && summary ? (
        <>
          {/* 1. 独立大图展示区 (无任何白色卡片背景束缚，原生浮在背景上) */}
          <Section
            listRowBackground={
              glass ? (
                <VStack listRowSeparator="hidden" />
              ) : (
                <Rectangle fill="clear" />
              )
            }
            listRowSeparator="hidden"
          >
            <VStack
              alignment="center"
              spacing={12}
              padding={{ top: 8, bottom: 8 }}
              frame={{ maxWidth: "infinity", alignment: "center" }}
              listRowSeparator="hidden"
            >
              {coverPath && FileManager.existsSync(coverPath) ? (
                <Image
                  filePath={coverPath}
                  resizable
                  renderingMode="original"
                  interpolation="high"
                  frame={{ width: 220, height: 220 }}
                  clipShape={{ type: "rect", cornerRadius: 28 }}
                  shadow={{ color: "rgba(0,0,0,0.18)", radius: 14, x: 0, y: 8 }}
                />
              ) : (
                <VStack
                  frame={{ width: 170, height: 170 }}
                  background="secondarySystemGroupedBackground"
                  clipShape={{ type: "rect", cornerRadius: 28, style: "continuous" }}
                  alignment="center"
                >
                  {isEmojiSymbol(displayIcon) ? (
                    <Text
                      font={84}
                      multilineTextAlignment="center"
                      frame={{ width: 150, height: 150, alignment: "center" }}
                    >
                      {displayIcon}
                    </Text>
                  ) : (
                    <Image
                      systemName={displayIcon}
                      font={96}
                      foregroundStyle="accentColor"
                    />
                  )}
                </VStack>
              )}

              {/* 物品标题与快捷状态微标 */}
              <VStack
                alignment="center"
                spacing={8}
                frame={{ maxWidth: "infinity", alignment: "center" }}
              >
                <Text
                  font={22}
                  fontWeight="bold"
                  lineLimit={2}
                  multilineTextAlignment="center"
                  frame={{ maxWidth: "infinity", alignment: "center" }}
                >
                  {item.name}
                </Text>

                <HStack
                  spacing={8}
                  alignment="center"
                  frame={{ maxWidth: "infinity", alignment: "center" }}
                >
                  {isExited ? (
                    <InteractiveChip
                      dotColor={badge.color}
                      title={badge.label}
                      color={badge.color}
                    />
                  ) : (
                    <Menu
                      label={
                        <InteractiveChip
                          dotColor={badge.color}
                          title={badge.label}
                          color={badge.color}
                          showChevron
                        />
                      }
                    >
                      <Button
                        title={
                          item.holdingCondition === "in_use" ? "✓ 在用" : "在用"
                        }
                        action={() => void handleQuickStatusChange("in_use")}
                      />
                      <Button
                        title={
                          item.holdingCondition === "idle" ? "✓ 闲置" : "闲置"
                        }
                        action={() => void handleQuickStatusChange("idle")}
                      />
                      <Button
                        title={
                          item.holdingCondition === "damaged"
                            ? "✓ 损坏"
                            : "损坏"
                        }
                        action={() => void handleQuickStatusChange("damaged")}
                      />
                    </Menu>
                  )}

                  <Menu
                    label={
                      <InteractiveChip
                        icon={category?.icon ?? "shippingbox.fill"}
                        title={category?.name ?? "未分类"}
                        color="accentColor"
                        showChevron
                      />
                    }
                  >
                    <Button
                      buttonStyle="plain"
                      action={() => void handleQuickCategoryChange(null)}
                    >
                      <CategoryMenuLabel
                        selected={item.categoryId === null}
                        icon="questionmark.folder"
                        title="未分类"
                      />
                    </Button>
                    {filterSelectableCategories(categories, item.categoryId).map(
                      (categoryOption) => (
                        <Button
                          key={categoryOption.id}
                          buttonStyle="plain"
                          action={() =>
                            void handleQuickCategoryChange(categoryOption.id)
                          }
                        >
                          <CategoryMenuLabel
                            selected={item.categoryId === categoryOption.id}
                            icon={categoryOption.icon}
                            title={categoryOption.name}
                          />
                        </Button>
                      ),
                    )}
                  </Menu>

                  <Menu
                    label={
                      itemTags.length > 0 ? (
                        <InteractiveChip
                          icon="tag.fill"
                          title={itemTags[0].name}
                          color={itemTags[0].color as Color}
                          showChevron
                        />
                      ) : (
                        <InteractiveChip
                          icon="tag"
                          title="标签"
                          color="#8E8E93"
                          showChevron
                        />
                      )
                    }
                  >
                    {allTags.map((tag) => {
                      const selected = itemTags.some((t) => t.id === tag.id);
                      return (
                        <Button
                          key={tag.id}
                          title={selected ? `✓ ${tag.name}` : tag.name}
                          action={() => void handleQuickToggleTag(tag.id)}
                        />
                      );
                    })}
                    <Button
                      title="＋ 新建标签…"
                      action={() => void handleQuickAddTag()}
                    />
                  </Menu>

                  {/* 状态、分类、标签 3 颗高频交互微标（删去冗余的保修微标，避免横向挤断省略） */}
                </HStack>
              </VStack>
            </VStack>
          </Section>

          {/* 2. 第一核心卡片：持有成本 (三列指标大字全部统一为主标题色，沉稳协调无突兀断层) */}
          {glass ? (
          <Section
            header={<GlassSectionHeader title="持有成本" />}
            listRowBackground={glassRowBackground}
          >
            <GlassGroup>
              {summary.available ? (
                <VStack
                  spacing={8}
                  padding={{ vertical: 14, horizontal: 4 }}
                  frame={{ maxWidth: "infinity" }}
                >
                  <HStack
                    alignment="center"
                    spacing={0}
                    frame={{ maxWidth: "infinity" }}
                  >
                    {/* 第一列：每日成本 */}
                    <VStack
                      alignment="center"
                      spacing={3}
                      frame={{ maxWidth: "infinity", alignment: "center" }}
                    >
                      <Text
                        font="footnote"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                      >
                        {amountSummaryComplete ? "每日成本" : "已知每日成本"}
                      </Text>
                      <Text
                        font={22}
                        fontWeight="bold"
                        foregroundStyle="label"
                        lineLimit={1}
                        minScaleFactor={0.7}
                      >
                        {formatMinorMoney(summary.dailyCostMinor, true)}
                      </Text>
                      <Text
                        font="caption"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                      >
                        / 天
                      </Text>
                    </VStack>

                    {/* 半高极细短线 1 */}
                    <VStack
                      frame={{ width: 0.5, height: 32 }}
                      background="rgba(142, 142, 147, 0.28)"
                    />

                    {/* 第二列：陪伴时间 */}
                    <VStack
                      alignment="center"
                      spacing={3}
                      frame={{ maxWidth: "infinity", alignment: "center" }}
                    >
                      <Text
                        font="footnote"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                      >
                        陪伴时间
                      </Text>
                      <HStack spacing={2} alignment="firstTextBaseline">
                        <Text
                          font={22}
                          fontWeight="bold"
                          foregroundStyle="label"
                          lineLimit={1}
                        >
                          {summary.holdingDays === null ? "不可用" : summary.holdingDays}
                        </Text>
                        {summary.holdingDays !== null ? (
                          <Text font="caption" foregroundStyle="secondaryLabel">
                            天
                          </Text>
                        ) : null}
                      </HStack>
                      <Text
                        font="caption"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                      >
                        {isExited
                          ? "已结束持有"
                          : `自 ${formatYmdZh(item.acquiredOn)}`}
                      </Text>
                    </VStack>

                    {/* 半高极细短线 2 */}
                    <VStack
                      frame={{ width: 0.5, height: 32 }}
                      background="rgba(142, 142, 147, 0.28)"
                    />

                    {/* 第三列：累计投入 / 回血 */}
                    <VStack
                      alignment="center"
                      spacing={3}
                      frame={{ maxWidth: "infinity", alignment: "center" }}
                    >
                      <Text
                        font="footnote"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                      >
                        {summary.isAcquisitionPriceKnown
                          ? "累计投入"
                          : "已知投入"}
                      </Text>
                      <Text
                        font={22}
                        fontWeight="bold"
                        foregroundStyle="label"
                        lineLimit={1}
                        minScaleFactor={0.7}
                      >
                        {formatMinorMoney(summary.totalExpenseMinor, true)}
                      </Text>
                      {summary.totalIncomeMinor > 0 ? (
                        <Text
                          font="caption"
                          fontWeight="medium"
                          foregroundStyle="#34C759"
                          lineLimit={1}
                        >
                          回血 +
                          {formatMinorMoney(summary.totalIncomeMinor, true)}
                        </Text>
                      ) : (
                        <Text
                          font="caption"
                          foregroundStyle="secondaryLabel"
                          lineLimit={1}
                        >
                          {timeline.filter((e) => e.direction === "expense")
                            .length > 0
                            ? `${timeline.filter((e) => e.direction === "expense").length} 笔支出`
                            : "全额在用"}
                        </Text>
                      )}
                    </VStack>
                  </HStack>

                  {!amountSummaryComplete ? (
                    <Text
                      font="caption"
                      foregroundStyle="secondaryLabel"
                      multilineTextAlignment="center"
                      frame={{ maxWidth: "infinity", alignment: "center" }}
                      padding={{ top: 4 }}
                    >
                      金额尚不完整，以上仅按已知金额计算。
                    </Text>
                  ) : null}
                </VStack>
              ) : (
                <VStack
                  alignment="leading"
                  spacing={8}
                  padding={{ vertical: 12 }}
                >
                  <Text font="headline" foregroundStyle="systemOrange">
                    财务摘要暂不可计算
                  </Text>
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    原始日期、价格和流水仍保留。请检查购入或结束日期、价格及相关资金记录，修正异常后重新计算。
                  </Text>
                </VStack>
              )}
            </GlassGroup>
          </Section>
          ) : (
          <Section
            header={<NativeSectionHeader title="持有成本" />}
          >
              {summary.available ? (
                <VStack
                  spacing={8}
                  padding={{ vertical: 12, horizontal: 4 }}
                  frame={{ maxWidth: "infinity" }}
                  listRowInsets={{
                    top: 0,
                    bottom: 0,
                    leading: 16,
                    trailing: 16,
                  }}
                >
                  <HStack
                    alignment="center"
                    spacing={0}
                    frame={{ maxWidth: "infinity" }}
                  >
                    {/* 第一列：每日成本 */}
                    <VStack
                      alignment="center"
                      spacing={3}
                      frame={{ maxWidth: "infinity", alignment: "center" }}
                    >
                      <Text
                        font="footnote"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                        minScaleFactor={0.8}
                      >
                        {amountSummaryComplete ? "每日成本" : "已知每日成本"}
                      </Text>
                      <Text
                        font={22}
                        fontWeight="bold"
                        foregroundStyle="label"
                        lineLimit={1}
                        minScaleFactor={0.7}
                      >
                        {formatMinorMoney(summary.dailyCostMinor, true)}
                      </Text>
                      <Text
                        font="caption"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                      >
                        / 天
                      </Text>
                    </VStack>

                    {/* 半高极细短线 1 */}
                    <VStack
                      frame={{ width: 0.5, height: 36 }}
                      background="separator"
                    />

                    {/* 第二列：陪伴时间 */}
                    <VStack
                      alignment="center"
                      spacing={3}
                      frame={{ maxWidth: "infinity", alignment: "center" }}
                    >
                      <Text
                        font="footnote"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                      >
                        陪伴时间
                      </Text>
                      <HStack spacing={2} alignment="firstTextBaseline">
                        <Text
                          font={22}
                          fontWeight="bold"
                          foregroundStyle="label"
                          lineLimit={1}
                        >
                          {summary.holdingDays === null ? "不可用" : summary.holdingDays}
                        </Text>
                        {summary.holdingDays !== null ? (
                          <Text font="caption" foregroundStyle="secondaryLabel">
                            天
                          </Text>
                        ) : null}
                      </HStack>
                      <Text
                        font="caption"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                      >
                        {isExited
                          ? "已结束持有"
                          : `自 ${formatYmdZh(item.acquiredOn)}`}
                      </Text>
                    </VStack>

                    {/* 半高极细短线 2 */}
                    <VStack
                      frame={{ width: 0.5, height: 36 }}
                      background="separator"
                    />

                    {/* 第三列：累计投入 / 回血 */}
                    <VStack
                      alignment="center"
                      spacing={3}
                      frame={{ maxWidth: "infinity", alignment: "center" }}
                    >
                      <Text
                        font="footnote"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                        minScaleFactor={0.8}
                      >
                        {summary.isAcquisitionPriceKnown
                          ? "累计投入"
                          : "已知投入"}
                      </Text>
                      <Text
                        font={22}
                        fontWeight="bold"
                        foregroundStyle="label"
                        lineLimit={1}
                        minScaleFactor={0.7}
                      >
                        {formatMinorMoney(summary.totalExpenseMinor, true)}
                      </Text>
                      {summary.totalIncomeMinor > 0 ? (
                        <Text
                          font="caption"
                          fontWeight="medium"
                          foregroundStyle="#34C759"
                          lineLimit={1}
                        >
                          回血 +
                          {formatMinorMoney(summary.totalIncomeMinor, true)}
                        </Text>
                      ) : (
                        <Text
                          font="caption"
                          foregroundStyle="secondaryLabel"
                          lineLimit={1}
                        >
                          {timeline.filter((e) => e.direction === "expense")
                            .length > 0
                            ? `${timeline.filter((e) => e.direction === "expense").length} 笔支出`
                            : "全额在用"}
                        </Text>
                      )}
                    </VStack>
                  </HStack>

                  {!amountSummaryComplete ? (
                    <Text
                      font="caption"
                      foregroundStyle="secondaryLabel"
                      multilineTextAlignment="center"
                      frame={{ maxWidth: "infinity", alignment: "center" }}
                      padding={{ top: 4 }}
                    >
                      金额尚不完整，以上仅按已知金额计算。
                    </Text>
                  ) : null}
                </VStack>
              ) : (
                <VStack
                  alignment="leading"
                  spacing={8}
                  padding={{ vertical: 12 }}
                >
                  <Text font="headline" foregroundStyle="systemOrange">
                    财务摘要暂不可计算
                  </Text>
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    原始日期、价格和流水仍保留。请检查购入或结束日期、价格及相关资金记录，修正异常后重新计算。
                  </Text>
                </VStack>
              )}
          </Section>
          )}

          {/* 3. 第二核心卡片：物品档案 (优化备注标题为“备注”) */}
          {glass ? (
          <Section
            header={<GlassSectionHeader title="物品档案" />}
            listRowBackground={glassRowBackground}
          >
            <GlassGroup>
              <GlassFactRow
                title="购入时间"
                systemImage="calendar"
                value={formatYmdZh(item.acquiredOn)}
              />
              <GlassDivider />
              <GlassFactRow
                title="购入平台"
                systemImage="storefront"
                value={item.channel?.trim() || "未填写"}
              />
              <GlassDivider />
              <GlassFactRow
                title="购入原价"
                systemImage="yensign.circle"
                value={
                  item.acquisitionAmountMinor !== null
                    ? formatMinorMoney(item.acquisitionAmountMinor)
                    : "价格未知"
                }
              />
              {item.warrantyUntil && warranty ? (
                <>
                  <GlassDivider />
                  <GlassFactRow
                    title="保修期限"
                    systemImage="checkmark.shield"
                    value={`${formatYmdZh(item.warrantyUntil)} (${warranty.label})`}
                    valueColor={warranty.color}
                  />
                </>
              ) : null}
              {item.valuationMinor !== null ? (
                <>
                  <GlassDivider />
                  <GlassFactRow
                    title="当前估值"
                    systemImage="chart.line.uptrend.xyaxis"
                    value={formatMinorMoney(item.valuationMinor, true)}
                  />
                </>
              ) : null}
              {item.notes ? (
                <>
                  <GlassDivider />
                  <GlassFactRow
                    title="备注"
                    systemImage="note.text"
                    value={item.notes}
                  />
                </>
              ) : null}
            </GlassGroup>
          </Section>
          ) : (
          <Section
            header={<NativeSectionHeader title="物品档案" />}
          >
              <FactRow
                title="购入时间"
                systemImage="calendar"
                value={formatYmdZh(item.acquiredOn)}
              />
              <FactRow
                title="购入平台"
                systemImage="storefront"
                value={item.channel?.trim() || "未填写"}
              />
              <FactRow
                title="购入原价"
                systemImage="yensign.circle"
                value={
                  item.acquisitionAmountMinor !== null
                    ? formatMinorMoney(item.acquisitionAmountMinor)
                    : "价格未知"
                }
              />
              {item.warrantyUntil && warranty ? (
                <>
                  <FactRow
                    title="保修期限"
                    systemImage="checkmark.shield"
                    value={`${formatYmdZh(item.warrantyUntil)} (${warranty.label})`}
                    valueColor={warranty.color}
                  />
                </>
              ) : null}
              {item.valuationMinor !== null ? (
                <>
                  <FactRow
                    title="当前估值"
                    systemImage="chart.line.uptrend.xyaxis"
                    value={formatMinorMoney(item.valuationMinor, true)}
                  />
                </>
              ) : null}
              {item.notes ? (
                <>
                  <FactRow
                    title="备注"
                    value={item.notes}
                    systemImage="note.text"
                  />
                </>
              ) : null}
          </Section>
          )}

          {/* 4. 物品动态 (生活化自然命名，右侧附随条数) */}
          {glass ? (
          <Section
            header={
              <GlassSectionHeader
                title="物品记录"
                detail={`${timeline.length} 条`}
              />
            }
            listRowBackground={glassRowBackground}
          >
            <GlassGroup>
              <GlassActionRow
                title="添加记录"
                systemImage="plus.circle.fill"
                action={() => void openAddEntry()}
              />
              {timeline.length === 0 ? (
                <Text
                  font="subheadline"
                  foregroundStyle="secondaryLabel"
                  padding={{ vertical: 12 }}
                >
                  还没有其他记录
                </Text>
              ) : (
                timeline.map((entry) => {
                  const baseMeta = TIMELINE_TYPE_LABELS[entry.type] ?? {
                    label: "记录",
                    icon: "circle.fill",
                    color: "#007AFF" as Color,
                  };
                  const meta =
                    entry.type === "money_expense" && entry.kind
                      ? { ...baseMeta, icon: EXPENSE_KIND_ICONS[entry.kind] }
                      : entry.type === "exit" && entry.reason
                        ? {
                            ...baseMeta,
                            color: itemStatusBadge(item, exit).color,
                          }
                        : baseMeta;

                  const isIncome =
                    entry.direction === "income" || entry.type === "exit";

                  return (
                    <VStack
                      key={entry.id}
                      spacing={0}
                      frame={{ maxWidth: "infinity" }}
                    >
                      <GlassDivider />
                      <HStack
                        spacing={12}
                        padding={{ vertical: 10 }}
                        alignment="center"
                        contentShape="rect"
                        onTapGesture={
                          entry.canEdit
                            ? () => void openEditEntry(entry)
                            : undefined
                        }
                      >
                        <VStack
                          frame={{ width: 34, height: 34 }}
                          background={tintedFill(String(meta.color), 0.14)}
                          clipShape={{ type: "rect", cornerRadius: 9 }}
                          alignment="center"
                        >
                          <Image
                            systemName={meta.icon}
                            font={17}
                            foregroundStyle={meta.color}
                          />
                        </VStack>

                        <VStack
                          alignment="leading"
                          spacing={2}
                          frame={{ maxWidth: "infinity", alignment: "leading" }}
                        >
                          <HStack spacing={6} alignment="center">
                            <Text font="body" fontWeight="medium">
                              {entry.title}
                            </Text>
                            {entry.canEdit ? (
                              <Image
                                systemName="square.and.pencil"
                                font={11}
                                foregroundStyle="tertiaryLabel"
                              />
                            ) : null}
                          </HStack>
                          <HStack spacing={6} alignment="center">
                            <Text
                              font="footnote"
                              foregroundStyle="secondaryLabel"
                            >
                              {entry.date}
                            </Text>
                            {entry.isPostExitSettlement ? (
                              <Text
                                font="footnote"
                                foregroundStyle="systemOrange"
                                padding={{ horizontal: 5, vertical: 1 }}
                                background="rgba(255,149,0,0.12)"
                                clipShape={{
                                  type: "capsule",
                                  style: "continuous",
                                }}
                              >
                                后续结算
                              </Text>
                            ) : null}
                          </HStack>
                          {entry.subtitle ? (
                            <Text
                              font="footnote"
                              foregroundStyle="secondaryLabel"
                            >
                              {entry.subtitle}
                            </Text>
                          ) : null}
                        </VStack>

                        <Spacer />

                        {entry.amountMinor !== null &&
                        entry.amountMinor !== undefined ? (
                          <VStack alignment="trailing" spacing={2}>
                            <Text
                              font="body"
                              fontWeight="semibold"
                              foregroundStyle={
                                entry.amountMinor > 0 && isIncome
                                  ? "#34C759"
                                  : "label"
                              }
                            >
                              {entry.amountMinor > 0
                                ? isIncome
                                  ? "+"
                                  : "-"
                                : ""}
                              {formatMinorMoney(entry.amountMinor, true)}
                            </Text>
                          </VStack>
                        ) : entry.type === "purchase" ||
                          (entry.type === "exit" && entry.reason === "sold") ? (
                          <Text font="footnote" foregroundStyle="secondaryLabel">
                            金额未知
                          </Text>
                        ) : null}

                        {entry.canDelete ? (
                          <Button
                            buttonStyle="plain"
                            action={() => void handleDeleteEntry(entry)}
                          >
                            <Image
                              systemName="trash"
                              font={13}
                              foregroundStyle="secondaryLabel"
                            />
                          </Button>
                        ) : null}
                      </HStack>
                    </VStack>
                  );
                })
              )}
            </GlassGroup>
          </Section>
          ) : (
          <Section
            header={
              <NativeSectionHeader
                title="物品记录"
                detail={`${timeline.length} 条`}
              />
            }
          >
              <NativeActionRow
                title="添加记录"
                systemImage="plus.circle.fill"
                action={() => void openAddEntry()}
              />
              {timeline.length === 0 ? (
                <Text
                  font="subheadline"
                  foregroundStyle="secondaryLabel"
                  padding={{ vertical: 12 }}
                >
                  还没有其他记录
                </Text>
              ) : (
                timeline.map((entry) => {
                  const baseMeta = TIMELINE_TYPE_LABELS[entry.type] ?? {
                    label: "记录",
                    icon: "circle.fill",
                    color: "accentColor" as Color,
                  };
                  const meta =
                    entry.type === "money_expense" && entry.kind
                      ? { ...baseMeta, icon: EXPENSE_KIND_ICONS[entry.kind] }
                      : entry.type === "exit" && entry.reason
                        ? {
                            ...baseMeta,
                            color: itemStatusBadge(item, exit).color,
                          }
                        : baseMeta;

                  const isIncome =
                    entry.direction === "income" || entry.type === "exit";

                  return (
                    <VStack
                      key={entry.id}
                      spacing={0}
                      frame={{ maxWidth: "infinity" }}
                    >
                      <HStack
                        spacing={12}
                        alignment="center"
                        contentShape="rect"
                        onTapGesture={
                          entry.canEdit
                            ? () => void openEditEntry(entry)
                            : undefined
                        }
                      >
                        <Image
                          systemName={meta.icon}
                          font={17}
                          foregroundStyle={meta.color}
                          frame={{ width: 26, alignment: "center" }}
                        />

                        <VStack
                          alignment="leading"
                          spacing={2}
                          frame={{ maxWidth: "infinity", alignment: "leading" }}
                        >
                          <HStack spacing={6} alignment="center">
                            <Text font="body" fontWeight="medium">
                              {entry.title}
                            </Text>
                            {entry.canEdit ? (
                              <Image
                                systemName="square.and.pencil"
                                font={11}
                                foregroundStyle="tertiaryLabel"
                              />
                            ) : null}
                          </HStack>
                          <HStack spacing={6} alignment="center">
                            <Text
                              font="footnote"
                              foregroundStyle="secondaryLabel"
                            >
                              {entry.date}
                            </Text>
                            {entry.isPostExitSettlement ? (
                              <Text
                                font="footnote"
                                foregroundStyle="systemOrange"
                              >
                                后续结算
                              </Text>
                            ) : null}
                          </HStack>
                          {entry.subtitle ? (
                            <Text
                              font="footnote"
                              foregroundStyle="secondaryLabel"
                            >
                              {entry.subtitle}
                            </Text>
                          ) : null}
                        </VStack>

                        <Spacer />

                        {entry.amountMinor !== null &&
                        entry.amountMinor !== undefined ? (
                          <VStack alignment="trailing" spacing={2}>
                            <Text
                              font="body"
                              fontWeight="semibold"
                              foregroundStyle={
                                entry.amountMinor > 0 && isIncome
                                  ? "#34C759"
                                  : "label"
                              }
                            >
                              {entry.amountMinor > 0
                                ? isIncome
                                  ? "+"
                                  : "-"
                                : ""}
                              {formatMinorMoney(entry.amountMinor, true)}
                            </Text>
                          </VStack>
                        ) : entry.type === "purchase" ||
                          (entry.type === "exit" && entry.reason === "sold") ? (
                          <Text font="footnote" foregroundStyle="secondaryLabel">
                            金额未知
                          </Text>
                        ) : null}

                        {entry.canDelete ? (
                          <Button
                            buttonStyle="plain"
                            action={() => void handleDeleteEntry(entry)}
                          >
                            <Image
                              systemName="trash"
                              font={13}
                              foregroundStyle="secondaryLabel"
                            />
                          </Button>
                        ) : null}
                      </HStack>
                    </VStack>
                  );
                })
              )}
          </Section>
          )}

          {/* 5. 管理 */}
          {glass ? (
          <Section
            header={<GlassSectionHeader title="管理" />}
            listRowBackground={glassRowBackground}
          >
            <GlassGroup>
              <GlassActionRow
                title="删除物品"
                systemImage="trash.fill"
                destructive
                action={() => void handleDelete()}
              />
            </GlassGroup>
          </Section>
          ) : (
          <Section
            header={<NativeSectionHeader title="管理" />}
          >
              <NativeActionRow
                title="删除物品"
                systemImage="trash.fill"
                destructive
                action={() => void handleDelete()}
              />
          </Section>
          )}
        </>
      ) : null}
    </List>
  );
}
