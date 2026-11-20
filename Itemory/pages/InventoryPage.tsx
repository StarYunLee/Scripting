import {
  Button,
  ContentUnavailableView,
  GeometryReader,
  LazyVGrid,
  HStack,
  Image,
  List,
  Menu,
  Navigation,
  NavigationStack,
  Rectangle,
  ScrollView,
  useRef,
  Section,
  Spacer,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
  ZStack,
  useEffect,
  useState,
} from "scripting";
import { DelayedSpinner } from "../ui/delayed-spinner";
import type { InventoryStatusFilter, ItemCardViewData } from "../models/types";
import {
  EFFECTIVE_ITEM_STATUSES,
  ITEM_STATUS_META,
  itemStatusBadge,
} from "../models/types";
import { formatMinorMoney } from "../services/format";
import {
  filterSelectableCategories,
  getInventoryLayout,
  subscribeInventoryLayout,
  toggleInventoryLayout,
} from "../services/prefs";
import { getInventoryPage } from "../services/queries";
import { InventoryController } from "../services/inventory-controller";
import { subscribeDataChanges } from "../services/change-store";


import { ItemEditorPage, type ItemEditorDraft } from "./ItemEditorPage";
import { ItemPage } from "./ItemPage";
import { isEmojiSymbol } from "../ui/UniversalIcon";
import { AiVisionSettingsModal } from "./AiVisionSettingsPage";
import {
  createAiEntrySession,
  type AiEntrySession,
  type AiEntrySnapshot,
} from "../services/ai-entry-session";
import { readAiEntryPolicy } from "../services/ai-entry-policy";
import {
  readAiVisionProfile,
  readAiVisionApiKey,
  resolveOpenAICompatibleRoot,
} from "../services/ai-vision";
import {
  readAiCutoutModel,
  readAiCutoutPrompt,
  resolveAiCutoutPrompt,
  isSupportedAiCutoutModel,
} from "../services/ai-cutout-config";
import { AI_CUTOUT_DEFAULT_PROMPT } from "../services/ai-cutout";
import { makeAiItemEditorDraft } from "../services/ai-item-draft";
import { pickCoverImage } from "../services/covers";
import { AiVisionHud } from "../ui/ai-vision-hud";
import { useAiVisionTasks } from "../services/ai-vision-task-hook";
import { safeAiVisionError } from "../services/ai-vision-diagnostics";
import { appListProps, AppSection } from "../ui/theme-props";

// Fixed 16pt title font: reserve two lines without asynchronous measurement.
const GRID_TITLE_TWO_LINE_HEIGHT = 44;

function ItemThumb(props: { card: ItemCardViewData; size: number }) {
  const { card, size } = props;
  const path = card.coverPath;

  if (path && FileManager.existsSync(path)) {
    return (
      <Image
        filePath={path}
        resizable
        renderingMode="original"
        frame={{ width: size, height: size }}
        clipShape={{ type: "rect", cornerRadius: 14 }}
      />
    );
  }

  const icon =
    card.item.iconSymbol || card.category?.icon || "shippingbox.fill";

  return (
    <VStack
      frame={{ width: size, height: size }}
      background="clear"
      clipShape={{ type: "rect", cornerRadius: 14 }}
      alignment="center"
    >
      {isEmojiSymbol(icon) ? (
        <Text
          font={Math.round(size * 0.65)}
          multilineTextAlignment="center"
          frame={{ width: size, height: size, alignment: "center" }}
        >
          {icon}
        </Text>
      ) : (
        <Image
          systemName={icon}
          font={Math.round(size * 0.6)}
          foregroundStyle="accentColor"
        />
      )}
    </VStack>
  );
}

function compactHoldingDuration(days: number | null): string {
  if (days === null) return "天数不可用";
  return days < 365 ? `${days}天` : `${(days / 365).toFixed(1)}年`;
}

function expenseLabel(card: ItemCardViewData, compact = true): string {
  return card.summary.available && card.summary.isAcquisitionPriceKnown
    ? formatMinorMoney(card.summary.totalExpenseMinor, compact)
    : card.summary.available
      ? "金额未知"
      : "金额异常";
}

function dailyCostLabel(card: ItemCardViewData): string {
  return card.summary.available && card.summary.isAcquisitionPriceKnown
    ? `${formatMinorMoney(card.summary.dailyCostMinor, true)}/天`
    : card.summary.available
      ? "日成本未完整"
      : "日成本异常";
}

function gridExpenseLabel(card: ItemCardViewData): string {
  return card.summary.available && card.summary.isAcquisitionPriceKnown
    ? formatMinorMoney(card.summary.totalExpenseMinor, true)
    : card.summary.available
      ? "未知"
      : "异常";
}

function gridDailyCostLabel(card: ItemCardViewData): string {
  return card.summary.available && card.summary.isAcquisitionPriceKnown
    ? formatMinorMoney(card.summary.dailyCostMinor, true)
    : card.summary.available
      ? "未完整"
      : "异常";
}

const STATUS_SEGMENT_WIDTH = 58;
const STATUS_SEGMENT_SPACING = 2;
const STATUS_BAR_PADDING = 4;

function InventoryStatusBar(props: {
  selected: InventoryStatusFilter;
  onSelect: (status: InventoryStatusFilter) => void;
}) {
  const statuses = ["all", ...EFFECTIVE_ITEM_STATUSES] as const;
  const contentWidth =
    statuses.length * STATUS_SEGMENT_WIDTH +
    (statuses.length - 1) * STATUS_SEGMENT_SPACING +
    STATUS_BAR_PADDING * 2;

  return (
    <GeometryReader frame={{ maxWidth: "infinity", height: 56 }}>
      {(proxy) => {
        const available = Math.max(0, proxy.size.width - 32);
        const barWidth = Math.min(available, contentWidth);
        return (
          <HStack
            spacing={0}
            frame={{ width: proxy.size.width, height: 56 }}
          >
            <Spacer />
            <HStack
              spacing={0}
              padding={STATUS_BAR_PADDING}
              frame={{ width: barWidth, height: 40 }}
              glassEffect={{
                glass: UIGlass.regular(),
                shape: {
                  type: "rect",
                  cornerRadius: 20,
                  style: "continuous",
                },
              }}
            >
              <ScrollView
                axes="horizontal"
                frame={{
                  width: Math.max(0, barWidth - STATUS_BAR_PADDING * 2),
                  height: 32,
                }}
                scrollIndicator="never"
              >
                <HStack
                  spacing={STATUS_SEGMENT_SPACING}
                  alignment="center"
                  fixedSize={{ horizontal: true, vertical: false }}
                >
                  {statuses.map((status) => {
                    const selected = props.selected === status;
                    const color =
                      status === "all"
                        ? "accentColor"
                        : ITEM_STATUS_META[status].color;
                    const label =
                      status === "all"
                        ? "全部"
                        : ITEM_STATUS_META[status].label;
                    return (
                      <Button
                        key={status}
                        buttonStyle="plain"
                        action={() => props.onSelect(status)}
                      >
                        <Text
                          font="subheadline"
                          fontWeight={selected ? "semibold" : "regular"}
                          foregroundStyle={selected ? color : "label"}
                          padding={{ vertical: 6 }}
                          frame={{ width: STATUS_SEGMENT_WIDTH }}
                          multilineTextAlignment="center"
                          background={selected ? "secondarySystemFill" : "clear"}
                          clipShape="capsule"
                          lineLimit={1}
                        >
                          {label}
                        </Text>
                      </Button>
                    );
                  })}
                </HStack>
              </ScrollView>
            </HStack>
            <Spacer />
          </HStack>
        );
      }}
    </GeometryReader>
  );
}

function StatusInline(props: { card: ItemCardViewData }) {
  const badge = itemStatusBadge(props.card.item, props.card.exit);
  const category = props.card.category;
  return (
    <HStack spacing={6} alignment="center">
      <Text
        font="caption2"
        foregroundStyle="white"
        padding={{ horizontal: 6, vertical: 2 }}
        background={badge.color}
        clipShape={{ type: "rect", cornerRadius: 4 }}
        lineLimit={1}
      >
        {badge.label}
      </Text>
      <HStack
        spacing={4}
        alignment="center"
        padding={{ horizontal: 6, vertical: 2 }}
        background="secondarySystemFill"
        clipShape={{ type: "rect", cornerRadius: 4 }}
      >
        <Image
          systemName={category?.icon ?? "questionmark.folder"}
          font={10}
          foregroundStyle="secondaryLabel"
        />
        <Text font="caption2" foregroundStyle="secondaryLabel" lineLimit={1}>
          {category?.name ?? "未分类"}
        </Text>
      </HStack>
      {props.card.tags.length > 0 ? (
        <HStack spacing={3} alignment="center">
          <Image
            systemName="tag.fill"
            font={9}
            foregroundStyle="secondaryLabel"
          />
          <Text font="caption2" foregroundStyle="secondaryLabel" lineLimit={1}>
            {props.card.tags[0].name}
            {props.card.tags.length > 1
              ? ` +${props.card.tags.length - 1}`
              : ""}
          </Text>
        </HStack>
      ) : null}
    </HStack>
  );
}

function InventoryRow(props: { card: ItemCardViewData; onTap: () => void }) {
  const { card } = props;
  return (
    <Button
      buttonStyle="plain"
      frame={{ maxWidth: "infinity" }}
      action={props.onTap}
    >
      <HStack
        spacing={12}
        alignment="center"
        frame={{ maxWidth: "infinity" }}
        contentShape="rect"
      >
        <ItemThumb card={card} size={72} />
        <VStack
          alignment="leading"
          spacing={5}
          frame={{
            minWidth: 0,
            maxWidth: "infinity",
            alignment: "leading",
          }}
        >
          <Text
            font="headline"
            lineLimit={1}
            truncationMode="tail"
            frame={{
              minWidth: 0,
              maxWidth: "infinity",
              alignment: "leading",
            }}
          >
            {card.item.name}
          </Text>
          <StatusInline card={card} />
          <HStack
            spacing={8}
            alignment="firstTextBaseline"
            frame={{ maxWidth: "infinity" }}
          >
            <Text
              font="caption"
              foregroundStyle="secondaryLabel"
              lineLimit={1}
              minScaleFactor={0.8}
            >
              {dailyCostLabel(card)} · 陪伴{" "}
              {compactHoldingDuration(card.summary.holdingDays)}
            </Text>
            <Spacer />
            <Text
              font="headline"
              lineLimit={1}
              minScaleFactor={0.8}
              multilineTextAlignment="trailing"
            >
              {expenseLabel(card)}
            </Text>
          </HStack>
        </VStack>
      </HStack>
    </Button>
  );
}

function GridItemCard(props: {
  card: ItemCardViewData;
  onTap: () => void;
}) {
  const { card } = props;
  const badge = itemStatusBadge(card.item, card.exit);

  return (
    <VStack
      alignment="center"
      spacing={6}
      padding={14}
      frame={{ minWidth: 0, maxWidth: "infinity" }}
      glassEffect={{
        glass: UIGlass.regular().interactive(true),
        shape: { type: "rect", cornerRadius: 20, style: "continuous" },
      }}
      onTapGesture={props.onTap}
    >
      <ItemThumb card={card} size={80} />

      <VStack spacing={5} frame={{ maxWidth: "infinity" }}>
        <Text
          font={16}
          fontWeight="semibold"
          lineLimit={2}
          multilineTextAlignment="center"
          frame={{
            minWidth: 0,
            maxWidth: "infinity",
            height: GRID_TITLE_TWO_LINE_HEIGHT,
            alignment: "center",
          }}
        >
          {card.item.name}
        </Text>

        <HStack
          spacing={6}
          frame={{ maxWidth: "infinity", alignment: "center" }}
        >
          <Text
            font="caption2"
            foregroundStyle="white"
            padding={{ horizontal: 6, vertical: 2 }}
            background={badge.color}
            clipShape={{ type: "rect", cornerRadius: 4 }}
            lineLimit={1}
          >
            {badge.label}
          </Text>
          <HStack
            spacing={4}
            alignment="center"
            padding={{ horizontal: 6, vertical: 2 }}
            background="secondarySystemFill"
            clipShape={{ type: "rect", cornerRadius: 4 }}
          >
            <Image
              systemName={card.category?.icon ?? "questionmark.folder"}
              font={10}
              foregroundStyle="secondaryLabel"
            />
            <Text
              font="caption2"
              foregroundStyle="secondaryLabel"
              lineLimit={1}
            >
              {card.category?.name ?? "未分类"}
            </Text>
          </HStack>
        </HStack>

        <HStack spacing={5} alignment="firstTextBaseline">
          <Text font="caption" foregroundStyle="secondaryLabel">
            投入
          </Text>
          <Text
            font={17}
            fontWeight="semibold"
            lineLimit={1}
            minScaleFactor={0.72}
          >
            {gridExpenseLabel(card)}
          </Text>
        </HStack>

        <Text
          font="caption2"
          foregroundStyle="secondaryLabel"
          lineLimit={1}
          minScaleFactor={0.76}
        >
          日均 {gridDailyCostLabel(card)} · 陪伴
          {compactHoldingDuration(card.summary.holdingDays)}
        </Text>
      </VStack>
    </VStack>
  );
}

export function InventoryPage(props: { active?: boolean } = {}) {
  const dismiss = Navigation.useDismiss();
  const [layout, setLayout] = useState(getInventoryLayout);
  const [query, setQuery] = useState("");
  const [controller] = useState(
    () => new InventoryController(getInventoryPage),
  );
  const [inventory, setInventory] = useState(controller.state);
  const { desired, snapshot, operation, error, showProgress } = inventory;
  const {
    categoryId: selectedCatId,
    statusFilter,
    sortField,
    sortDirection,
  } = desired;
  const categories = snapshot?.categories ?? [];
  const sortedCards = snapshot?.cards ?? [];
  const displayedQuery = snapshot?.query ?? desired;
  const searchDraft = useRef(query);
  searchDraft.current = query;
  const submittedSearch = useRef("");

  async function toggleLayout() {
    const { success } = await toggleInventoryLayout();
    if (!success) {
      await Dialog.alert({
        title: "布局保存失败",
        message: "未能写入设备偏好，布局保持不变，请重试。",
        buttonLabel: "好",
      });
    }
  }

  function openItem(itemId: string) {
    if (controller.canOpen()) setOpenedItemId(itemId);
  }

  // 页面导航受控状态，避免 Navigation.present 二级模态无法关闭
  const [openedItemId, setOpenedItemId] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<ItemEditorDraft | null>(null);
  const [draftKey, setDraftKey] = useState(0);
  const [createAiSession, setCreateAiSession] = useState<AiEntrySession | null>(
    null,
  );
  const ownedAiSession = useRef<AiEntrySession | null>(null);
  const [aiHudPhase, setAiHudPhase] = useState<string | null>(null);
  const aiWaitStop = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const navigationValid = useRef(true);
  navigationValid.current =
    props.active !== false && !isCreating && openedItemId == null;
  const openingAi = useRef(false);
  const tasks = useAiVisionTasks();

  function closeAiSession() {
    aiWaitStop.current?.();
    aiWaitStop.current = null;
    ownedAiSession.current?.close();
    ownedAiSession.current = null;
    setCreateAiSession(null);
  }

  function waitForInformation(
    session: AiEntrySession,
  ): Promise<AiEntrySnapshot | null> {
    return new Promise((resolve) => {
      let done = false;
      let unsubscribe: (() => void) | null = null;
      const finish = (value: AiEntrySnapshot | null) => {
        if (done) return;
        done = true;
        unsubscribe?.();
        if (aiWaitStop.current === stop) aiWaitStop.current = null;
        resolve(value);
      };
      const stop = () => finish(null);
      aiWaitStop.current = stop;
      unsubscribe = session.subscribe((value) => {
        if (done) return;
        if (value.closed) {
          finish(null);
          return;
        }
        if (
          ["success", "failed", "cancelled"].includes(value.informationStatus)
        )
          finish(value);
        else if (alive.current) setAiHudPhase("正在解析订单信息…");
      });
      if (done) unsubscribe();
    });
  }

  async function handleVisionCreate() {
    if (openingAi.current || !alive.current || !navigationValid.current) return;
    const task = tasks.begin();
    if (!task) return;
    openingAi.current = true;
    const valid = () =>
      alive.current && navigationValid.current && tasks.current(task);
    let session: AiEntrySession | null = null;
    let handedOff = false;
    try {
      const policy = readAiEntryPolicy();
      if (!policy.mode) {
        const go = await Dialog.confirm({
          title: "启用 AI 识图录入",
          message: "请在「AI 识图录入」中启用物品信息解析。",
          confirmLabel: "去设置",
          cancelLabel: "取消",
        });
        if (go && valid())
          await Navigation.present({ element: <AiVisionSettingsModal /> });
        return;
      }
      const profile = readAiVisionProfile();
      const apiKey = readAiVisionApiKey() ?? "";
      let cutoutModel = "",
        cutoutPrompt: string | undefined;
      let configured =
        !!apiKey.trim() &&
        !!profile.model.trim() &&
        profile.model.trim().length <= 200;
      try {
        resolveOpenAICompatibleRoot(profile.baseURL);
      } catch {
        configured = false;
      }
      if (policy.mode === "combined" && configured) {
        cutoutModel = readAiCutoutModel(profile.baseURL);
        cutoutPrompt = resolveAiCutoutPrompt(
          readAiCutoutPrompt(),
          AI_CUTOUT_DEFAULT_PROMPT,
        );
        configured =
          isSupportedAiCutoutModel(cutoutModel) && cutoutPrompt.length <= 6000;
      }
      if (!configured) {
        const go = await Dialog.confirm({
          title: "配置 AI 识图录入",
          message: "请补全当前录入能力所需的接口、密钥和模型配置。",
          confirmLabel: "去设置",
          cancelLabel: "取消",
        });
        if (go && valid())
          await Navigation.present({ element: <AiVisionSettingsModal /> });
        return;
      }
      const image = await pickCoverImage();
      if (!image || !valid()) return;
      session = createAiEntrySession({
        mode: policy.mode,
        profile,
        cutoutModel,
        cutoutPrompt,
        apiKey,
        image,
      });
      ownedAiSession.current = session;
      setAiHudPhase("正在解析订单信息…");
      let waiting = waitForInformation(session);
      void session.start().catch(() => {
        session?.cancel("information");
      });
      let manual = false;
      while (valid()) {
        const result = await waiting;
        if (!valid() || !result || session.getSnapshot().closed) return;
        setAiHudPhase(null);
        if (
          result.informationStatus === "success" &&
          result.result.information?.editorDraft
        )
          break;
        const choice = await Dialog.actionSheet({
          title: "信息解析未完成",
          message:
            result.result.informationError ||
            "可重新解析，或手动填写并保留物品图处理。",
          actions: [
            { label: "重试信息（可能再次计费）" },
            { label: "手动填写" },
            { label: "放弃录入", destructive: true },
          ],
        });
        if (!valid() || session.getSnapshot().closed) return;
        if (choice === 1) {
          manual = true;
          session.cancel("information");
          break;
        }
        if (choice !== 0) return;
        const retry = session.retry("information");
        setAiHudPhase("正在解析订单信息…");
        waiting = waitForInformation(session);
        void retry.catch(() => {
          session?.cancel("information");
        });
      }
      if (!valid() || session.getSnapshot().closed) return;
      const result = session.getSnapshot().result;
      const draft = makeAiItemEditorDraft(
        manual ? { ...result, information: null } : result,
      );
      if (manual) draft.dateNeedsConfirmation = true;
      if (!session.handoff()) return;
      handedOff = true;
      // The editor now owns the session. Tab inactivity or this page's teardown
      // must not close it or blank the session prop while the editor is mounted;
      // the editor closes it exactly once on real exit (save/cancel/unmount).
      if (ownedAiSession.current === session) ownedAiSession.current = null;
      setAiHudPhase(null);
      setDraftKey((prev) => prev + 1);
      setCreateDraft(draft);
      setCreateAiSession(session);
      setIsCreating(true);
    } catch (error) {
      if (valid()) {
        setAiHudPhase(null);
        await Dialog.alert({
          title: "智能录入暂不可用",
          message: safeAiVisionError(error),
        });
      }
    } finally {
      aiWaitStop.current?.();
      aiWaitStop.current = null;
      if (!handedOff) {
        session?.close();
        if (ownedAiSession.current === session) ownedAiSession.current = null;
      }
      if (alive.current) setAiHudPhase(null);
      openingAi.current = false;
      tasks.finish(task);
    }
  }

  useEffect(() => {
    const unsubscribe = controller.subscribe(setInventory);
    const unsubscribeData = subscribeDataChanges(() =>
      controller.dataChanged(),
    );
    controller.start();
    return () => {
      unsubscribeData();
      unsubscribe();
      controller.dispose();
      alive.current = false;
      aiWaitStop.current?.();
      aiWaitStop.current = null;
      ownedAiSession.current?.close();
      ownedAiSession.current = null;
      tasks.cancel();
    };
  }, []);

  useEffect(() => {
    if (props.active === false) {
      tasks.suspend();
      // Leaving the tab cancels only a creator-owned task that has not been
      // handed off yet. Once the editor owns the session, the tab switch must
      // not close it, blank its prop or restart any request.
      if (ownedAiSession.current) closeAiSession();
      else {
        aiWaitStop.current?.();
        aiWaitStop.current = null;
        setAiHudPhase(null);
      }
    } else {
      tasks.resume();
    }
  }, [props.active]);

  useEffect(() => {
    const timer = setTimeout(() => {
      submittedSearch.current = query;
      controller.select({ keyword: query });
    }, 250);
    return () => clearTimeout(timer);
  }, [query]);

  // Roll back only the submitted text, never overwrite a newer draft.
  useEffect(() => {
    if (
      error &&
      searchDraft.current === submittedSearch.current &&
      searchDraft.current.trim() !== desired.keyword
    ) {
      setQuery(desired.keyword);
    }
  }, [error, desired.keyword]);

  // The status filter sits above the List in a fixed VStack row, so it stays
  // visible while the inventory content scrolls.
  useEffect(() => subscribeInventoryLayout(setLayout), []);

  const sortLabels = {
    created: "最新添加",
    expense: "累计投入",
    days: "陪伴时间",
    daily: "每日成本",
  } as const;
  const allItemCount = snapshot?.allItemCount ?? snapshot?.totalCount ?? 0;
  const filtersActive =
    selectedCatId !== "all" ||
    sortField !== "created" ||
    sortDirection !== "desc";

  return (
    <NavigationStack>
      <ZStack
        alignment="top"
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      >
        <List
          navigationTitle="物品"
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
          {...appListProps("glass", "inline")}
          listRowSpacing={12}
          contentMargins={{
            edges: "all",
            insets: { top: 64, bottom: 16, leading: 16, trailing: 16 },
            placement: "scrollContent",
          }}
          overlay={
            !snapshot && !error
              ? {
                  // First read: a native centered spinner instead of a text row.
                  alignment: "center",
                  content: <DelayedSpinner />,
                }
              : snapshot && allItemCount === 0
              ? {
                  alignment: "center",
                  content: (
                    <ContentUnavailableView
                      title="还没有任何物品"
                      systemImage="shippingbox"
                      description="添加第一件物品后，这里会显示状态、分类和花费信息。"
                    />
                  ),
                }
              : {
            alignment: "bottom",
            content: (
              <VStack
                spacing={6}
                padding={12}
                allowsHitTesting={
                  !!snapshot && !!error && error.kind !== "append"
                }
              >
                {showProgress ? (
                  <Text
                    font="caption"
                    padding={8}
                    background="regularMaterial"
                    clipShape="capsule"
                    allowsHitTesting={false}
                  >
                    {operation === "replace" ? "正在筛选…" : "正在更新…"}
                  </Text>
                ) : null}
                {snapshot && error && error.kind !== "append" ? (
                  <VStack
                    spacing={6}
                    padding={12}
                    background="regularMaterial"
                    clipShape={{ type: "rect", cornerRadius: 12 }}
                  >
                    <Text font="caption">
                      {inventory.stale || error.kind === "refresh"
                        ? "更新失败，当前显示上次结果"
                        : "筛选失败，已恢复上次条件"}
                    </Text>
                    <Text
                      font="caption2"
                      foregroundStyle="secondaryLabel"
                      lineLimit={2}
                    >
                      {error.message}
                    </Text>
                    <Button
                      title="重新读取"
                      action={() => controller.retry()}
                    />
                  </VStack>
                ) : null}
              </VStack>
            ),
          }}
          searchable={{
            value: query,
            onChanged: setQuery,
            prompt: "搜索物品、分类或标签",
          }}
          navigationDestination={{
            isPresented: openedItemId != null || isCreating,
            onChanged: (val) => {
              if (!val) {
                setOpenedItemId(null);
                setIsCreating(false);
                setCreateDraft(null);
                closeAiSession();
              }
            },
            content: isCreating ? (
              <ItemEditorPage
                key={`create-${draftKey}`}
                initialDraft={createDraft}
                aiEntrySession={createAiSession}
                onSaved={(id) => {
                  // Keep the current filters and open the committed item directly,
                  // even when it is not visible in the current inventory result.
                  setIsCreating(false);
                  setCreateDraft(null);
                  closeAiSession();
                  setOpenedItemId(id);
                }}
                onCancel={() => {
                  setIsCreating(false);
                  setCreateDraft(null);
                  closeAiSession();
                }}
              />
            ) : openedItemId ? (
              <ItemPage itemId={openedItemId} />
            ) : (
              <Text>物品</Text>
            ),
          }}
          toolbar={
            <Toolbar>
              <ToolbarItem placement="topBarLeading">
                <Button
                  title="返回"
                  systemImage="chevron.left"
                  labelStyle="iconOnly"
                  action={() => {
                    navigationValid.current = false;
                    tasks.cancel();
                    closeAiSession();
                    setIsCreating(false);
                    setCreateDraft(null);
                    setOpenedItemId(null);
                    dismiss();
                  }}
                />
              </ToolbarItem>

              <ToolbarItem placement="topBarTrailing">
                <Menu
                  title="筛选、排序与显示"
                  systemImage="slider.horizontal.3"
                  labelStyle="iconOnly"
                  foregroundStyle={filtersActive ? "accentColor" : "label"}
                >
                  <Button
                    title="列表"
                    systemImage={
                      layout === "list" ? "checkmark" : "list.bullet"
                    }
                    action={() => {
                      if (layout !== "list") void toggleLayout();
                    }}
                  />
                  <Button
                    title="网格"
                    systemImage={
                      layout === "card" ? "checkmark" : "square.grid.2x2"
                    }
                    action={() => {
                      if (layout !== "card") void toggleLayout();
                    }}
                  />

                  <Menu title="分类" systemImage="square.grid.2x2">
                    <Button
                      title="全部分类"
                      systemImage={
                        selectedCatId === "all"
                          ? "checkmark"
                          : "square.grid.2x2"
                      }
                      action={() =>
                        controller.select({ categoryId: "all" })
                      }
                    />
                    <Button
                      title="未分类"
                      systemImage={
                        selectedCatId === "uncategorized"
                          ? "checkmark"
                          : "questionmark.folder"
                      }
                      action={() =>
                        controller.select({ categoryId: "uncategorized" })
                      }
                    />
                    {filterSelectableCategories(
                      categories,
                      selectedCatId,
                    ).map((category) => (
                      <Button
                        key={category.id}
                        title={category.name}
                        systemImage={
                          selectedCatId === category.id
                            ? "checkmark"
                            : isEmojiSymbol(category.icon)
                              ? "folder"
                              : category.icon
                        }
                        action={() =>
                          controller.select({ categoryId: category.id })
                        }
                      />
                    ))}
                  </Menu>

                  <Menu title="排序" systemImage="arrow.up.arrow.down">
                    {(["created", "expense", "days", "daily"] as const).map(
                      (field) => (
                        <Button
                          key={field}
                          title={`${
                            sortField === field ? "✓ " : ""
                          }${sortLabels[field]}${
                            sortField === field
                              ? sortDirection === "desc"
                                ? " ↓"
                                : " ↑"
                              : ""
                          }`}
                          action={() => {
                            if (sortField === field) {
                              controller.select({
                                sortDirection:
                                  sortDirection === "desc" ? "asc" : "desc",
                              });
                            } else {
                              controller.select({
                                sortField: field,
                                sortDirection: "desc",
                              });
                            }
                          }}
                        />
                      ),
                    )}
                  </Menu>
                </Menu>
              </ToolbarItem>

              <ToolbarItem placement="topBarTrailing">
                <Menu title="添加" systemImage="plus" labelStyle="iconOnly">
                  <Button
                    title="AI 识图录入"
                    systemImage="sparkles"
                    action={() => void handleVisionCreate()}
                  />
                  <Button
                    title="手动新建"
                    systemImage="square.and.pencil"
                    action={() => {
                      tasks.cancel();
                      setCreateDraft(null);
                      closeAiSession();
                      setDraftKey((prev) => prev + 1);
                      setIsCreating(true);
                    }}
                  />
                </Menu>
              </ToolbarItem>
            </Toolbar>
          }
        >

          {/* 物品展示区：旧结果不冒充当前筛选结果；失败不显示为空。 */}
          {!snapshot ? (
            !error ? null : (
            <Section>
                <Text>物品读取失败</Text>
                {error ? (
                  <VStack alignment="leading" spacing={8}>
                    <Text foregroundStyle="systemRed">{error.message}</Text>
                    <Text foregroundStyle="secondaryLabel">
                      读取失败不代表保存失败，请重试读取，不要重复添加物品。
                    </Text>
                    <Button
                      title="重试读取"
                      action={() => controller.retry()}
                    />
                  </VStack>
                ) : null}
            </Section>
            )
          ) : sortedCards.length === 0 ? (
            allItemCount === 0 ? null : (
            <AppSection theme="glass" groupRows={false}>
              <VStack
                spacing={10}
                alignment="center"
                padding={{ vertical: 22, horizontal: 16 }}
                frame={{ maxWidth: "infinity" }}
              >
                <Image
                  systemName={
                    displayedQuery.keyword.trim()
                      ? "magnifyingglass"
                      : displayedQuery.statusFilter !== "all"
                        ? ITEM_STATUS_META[displayedQuery.statusFilter].icon
                        : "shippingbox"
                  }
                  font={30}
                  foregroundStyle={
                    displayedQuery.statusFilter !== "all"
                      ? ITEM_STATUS_META[displayedQuery.statusFilter].color
                      : "tertiaryLabel"
                  }
                />
                <Text
                  font="headline"
                  fontWeight="semibold"
                  multilineTextAlignment="center"
                >
                  {displayedQuery.keyword.trim()
                    ? "没有匹配的物品"
                    : displayedQuery.statusFilter === "in_use"
                      ? "没有在用的物品"
                      : displayedQuery.statusFilter === "idle"
                        ? "没有闲置物品"
                        : displayedQuery.statusFilter === "damaged"
                          ? "没有损坏物品"
                          : displayedQuery.statusFilter === "sold"
                            ? "没有已出售的物品"
                            : displayedQuery.statusFilter === "gifted"
                              ? "没有已赠送的物品"
                              : displayedQuery.statusFilter === "discarded"
                                ? "没有已丢弃的物品"
                                : displayedQuery.statusFilter === "lost"
                                  ? "没有已遗失的物品"
                                  : "还没有任何物品"}
                </Text>
                <Text
                  font="subheadline"
                  foregroundStyle="secondaryLabel"
                  multilineTextAlignment="center"
                >
                  当前筛选下没有结果，换个状态看看。
                </Text>
                <Button
                  title="查看全部物品"
                  buttonStyle="borderless"
                  action={() => {
                    setQuery("");
                    controller.select({
                      statusFilter: "all",
                      categoryId: "all",
                      keyword: "",
                    });
                  }}
                />
              </VStack>
            </AppSection>
            )
          ) : layout === "card" ? (
            <Section
              listRowBackground={<Rectangle fill="clear" />}
              listRowSeparator="hidden"
              listRowInsets={0}
            >
              <LazyVGrid
                columns={[
                  {
                    size: { type: "adaptive", min: 160, max: 220 },
                    spacing: 14,
                  },
                ]}
                spacing={14}
                frame={{ minWidth: 0, maxWidth: "infinity" }}
                listRowInsets={0}
              >
                {sortedCards.map((card) => (
                  <GridItemCard
                    key={card.item.id}
                    card={card}
                    onTap={() => openItem(card.item.id)}
                  />
                ))}
              </LazyVGrid>
            </Section>
          ) : (
            <Section
              listRowBackground={<Rectangle fill="clear" />}
              listRowSeparator="hidden"
              listRowInsets={0}
            >
              {sortedCards.map((card) => (
                <VStack
                  key={card.item.id}
                  spacing={0}
                  frame={{ maxWidth: "infinity" }}
                  padding={{ top: 14, bottom: 14, leading: 16, trailing: 16 }}
                  glassEffect={{
                    glass: UIGlass.regular().interactive(true),
                    shape: {
                      type: "rect",
                      cornerRadius: 20,
                      style: "continuous",
                    },
                  }}
                >
                  <InventoryRow
                    card={card}
                    onTap={() => openItem(card.item.id)}
                  />
                </VStack>
              ))}
            </Section>
          )}
          {snapshot?.hasMore ? (
            <Section>
                <Button
                  title={operation === "append" ? "正在加载…" : "加载更多"}
                  disabled={operation !== null || inventory.stale}
                  action={() => controller.append()}
                />
                {error?.kind === "append" ? (
                  <Text font="caption" foregroundStyle="systemRed">
                    加载更多失败，请重试
                  </Text>
                ) : null}
            </Section>
          ) : null}
        </List>
        <VStack
          spacing={0}
          frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        >
          {allItemCount > 0 ? (
            <InventoryStatusBar
              selected={statusFilter}
              onSelect={(status) =>
                controller.select({ statusFilter: status })
              }
            />
          ) : null}
          <Spacer />
        </VStack>
        {aiHudPhase ? (
          <AiVisionHud
            phase={aiHudPhase}
            onCancel={() => {
              tasks.cancel();
              closeAiSession();
              setAiHudPhase(null);
            }}
            cancelTitle="取消等待"
          />
        ) : null}
      </ZStack>
    </NavigationStack>
  );
}
