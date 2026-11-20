import {
  buildItemMutationPayload,
  isUnknownMutationError,
  newMutationContext,
  type MutationContext,
} from "../services/mutation";
import { createSubmissionGuard } from "../services/submission-guard";
import {
  createAiEntryEditorController,
  type AiEntryEditorController,
} from "../services/ai-entry-editor";
import type {
  AiEntrySession,
  AiEntrySnapshot,
} from "../services/ai-entry-session";
import {
  Button,
  Circle,
  DatePicker,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Picker,
  ProgressView,
  Section,
  Spacer,
  Text,
  TextField,
  Toggle,
  VStack,
  ZStack,
  type Color,
  useEffect,
  useState,
  useRef,
} from "scripting";
import type {
  CategoryRecord,
  ExitReason,
  ItemCondition,
  TagRecord,
} from "../models/types";
import { ITEM_STATUS_META } from "../models/types";
import { nativeListPageProps, NativeSectionHeader } from "../ui/native-list";

import {
  closeDraftCoverSession,
  cleanupDraftCover,
  createDraftCoverSession,
  promoteDraftCover,
  replaceDraftCover,
  saveDraftCoverImage,
  pickCoverImage,
  removeUnreferencedCoverPhoto,
  rollbackCommittedCover,
  resolveCoverPath,
  invalidateCoverValidation,
} from "../services/covers";
import { CoverCropPage } from "./CoverCropPage";
import {
  addYearsYmd,
  formatYmdZh,
  minorToDecimalText,
  parseYuanToMinor,
  todayYmd,
  tsToYmd,
  ymdToTs,
} from "../services/format";
import { draftFilePath } from "../services/paths";
import { filterSelectableCategories } from "../services/prefs";
import { getItemDetail, listCategories, listTags } from "../services/queries";
import { matchBestCategory } from "../services/ai-vision";
import { buildAiCutoutDiagnostic } from "../services/ai-cutout";
import { createItem, updateItem } from "../services/commands";
import { getDatabase } from "../services/db";


import { IconPickerModal } from "./IconPickerModal";
import { TagCreateSheet } from "./TagSettingsPage";
import { isEmojiSymbol } from "../ui/UniversalIcon";
import {
  ITEMORY_NAME_MAX_LENGTH,
  ITEMORY_TEXT_MAX_LENGTH,
} from "../domain/text-limits";

/**
 * Field limits come from the shared exchange contract (name 500, free text
 * 20,000). The editor never truncates: it explains the limit and blocks the
 * save instead, so a manually entered item cannot become un-exportable.
 */
function TextLimitNotice(props: {
  label: string;
  value: string;
  max: number;
}) {
  if (props.value.length <= props.max) return null;
  return (
    <Text font="caption" foregroundStyle="red">
      {props.label}已有 {props.value.length} 个字符，超过 {props.max} 个字符上限，请缩短后再保存
    </Text>
  );
}

function LabeledField(props: {
  title: string;
  value: string;
  onChanged: (value: string) => void;
  decimal?: boolean;
}) {
  const field = props.decimal ? (
    <TextField
      title=" "
      value={props.value}
      onChanged={props.onChanged}
      axis="horizontal"
      keyboardType="decimalPad"
      multilineTextAlignment="trailing"
      frame={{ maxWidth: "infinity" }}
    />
  ) : (
    <TextField
      title=" "
      value={props.value}
      onChanged={props.onChanged}
      axis="horizontal"
      multilineTextAlignment="trailing"
      frame={{ maxWidth: "infinity" }}
    />
  );
  return (
    <HStack
      spacing={12}
      alignment="center"
    >
      <Text>{props.title}</Text>
      {field}
    </HStack>
  );
}

function TagMultiSelectSheet(props: {
  availableTags: TagRecord[];
  selectedTagIds: string[];
  onConfirm: (selectedIds: string[]) => void;
  onTagCreated: (newTag: TagRecord) => void;
}) {
  const [tags, setTags] = useState<TagRecord[]>(props.availableTags);
  const [selectedIds, setSelectedIds] = useState<string[]>(props.selectedTagIds);
  const dismiss = Navigation.useDismiss();

  const toggle = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id],
    );
  };

  async function openCreateTag() {
    await Navigation.present({
      element: (
        <TagCreateSheet
          onSaved={(newTag) => {
            props.onTagCreated(newTag);
            setTags((prev) =>
              prev.some((t) => t.id === newTag.id) ? prev : [...prev, newTag],
            );
            setSelectedIds((prev) =>
              prev.includes(newTag.id) ? prev : [...prev, newTag.id],
            );
          }}
        />
      ),
      modalPresentationStyle: "pageSheet",
    });
  }

  return (
    <NavigationStack>
      <List
        navigationTitle="选择标签"
        {...nativeListPageProps("inline")}
        toolbar={{
          cancellationAction: (
            <Button
              title="取消"
              action={() => {
                dismiss();
              }}
            />
          ),
          confirmationAction: (
            <Button
              title="完成"
              action={() => {
                props.onConfirm(selectedIds);
                dismiss();
              }}
            />
          ),
        }}
      >
        <Section
          header={<NativeSectionHeader title="所有标签" />}
        >
            {tags.length === 0 ? (
              <Text
                font="subheadline"
                foregroundStyle="secondaryLabel"
                padding={{ vertical: 16 }}
              >
                暂无标签，点击下方按钮添加
              </Text>
            ) : (
              tags.map((tag) => {
                const isSelected = selectedIds.includes(tag.id);
                return (
                  <VStack key={tag.id} spacing={0} frame={{ maxWidth: "infinity" }}>
                    <HStack
                      spacing={12}
                      alignment="center"
                      contentShape="rect"
                      onTapGesture={() => toggle(tag.id)}
                    >
                      <VStack
                        frame={{ width: 14, height: 14 }}
                        background={tag.color as Color}
                        clipShape="circle"
                      />
                      <Text font="body">{tag.name}</Text>
                      <Spacer />
                      {isSelected ? (
                        <Image
                          systemName="checkmark"
                          font={15}
                          foregroundStyle="accentColor"
                        />
                      ) : null}
                    </HStack>
                  </VStack>
                );
              })
            )}
        </Section>

        <Section>
            <HStack
              spacing={8}
              alignment="center"
              contentShape="rect"
              onTapGesture={() => void openCreateTag()}
            >
              <Image
                systemName="plus.circle.fill"
                font={20}
                foregroundStyle="accentColor"
              />
              <Text font="body" foregroundStyle="accentColor">
                新建标签…
              </Text>
            </HStack>
        </Section>
      </List>
    </NavigationStack>
  );
}

export type { ItemEditorDraft } from "../services/item-editor-draft";
import {
  normalizeItemEditorDraft,
  type ItemEditorDraft,
} from "../services/item-editor-draft";

export function ItemEditorPage(props: {
  itemId?: string | null;
  initialDraft?: ItemEditorDraft | null;
  initialCoverImage?: UIImage | null;
  aiEntrySession?: AiEntrySession | null;
  onSaved?: (id: string) => void | Promise<void>;
  onCancel?: () => void;
}) {
  const { itemId, onSaved, onCancel } = props;
  const initialDraft = normalizeItemEditorDraft(props.initialDraft);
  const isEditing = !!itemId;
  const dismiss = Navigation.useDismiss();

  const handleClose = () => {
    editorClosed.current = true;
    aiController.current?.close();
    if (
      !submission.current.isCompleted() &&
      !unknownOutcomeRef.current &&
      !commandInFlight.current
    ) {
      void closeDraftCoverSession(coverSession.current);
    }
    if (onCancel) {
      onCancel();
    } else {
      dismiss();
    }
  };

  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [unknownOutcome, setUnknownOutcome] = useState(false);
  const unknownOutcomeRef = useRef(false);
  const submission = useRef(createSubmissionGuard());
  const [loadedRevision, setLoadedRevision] = useState<number | null>(null);
  const mutation = useRef<MutationContext | null>(null);
  const [categories, setCategories] = useState<CategoryRecord[]>([]);
  const [availableTags, setAvailableTags] = useState<TagRecord[]>([]);

  // Initial-read recovery. A failed read must stay recoverable in place:
  // `loadError` drives a small, non-disabled screen whose retry button only
  // bumps `reloadToken`. Nothing else (AI session, draft cover, typed fields)
  // is re-created by a retry.
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loadMissing, setLoadMissing] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  const initAttempt = useRef(0);
  const initInFlight = useRef(false);
  const draftApplied = useRef(false);

  // 核心字段
  const [name, setName] = useState(initialDraft?.name ?? "");
  const [purchasePriceText, setPurchasePriceText] = useState(
    initialDraft?.purchasePriceText ?? "",
  );
  const [purchasedOn, setPurchasedOn] = useState(
    initialDraft?.purchasedOn ?? todayYmd(),
  );
  const [dateConfirmed, setDateConfirmed] = useState(
    !initialDraft?.dateNeedsConfirmation,
  );
  const [priceConfirmed, setPriceConfirmed] = useState(
    !initialDraft?.priceNeedsConfirmation,
  );
  const [categoryId, setCategoryId] = useState<string>(
    initialDraft?.categoryId ?? "",
  );
  const [holdingCondition, setHoldingCondition] =
    useState<ItemCondition>("in_use");
  const [exitReason, setExitReason] = useState<ExitReason | null>(null);
  const [exitDate, setExitDate] = useState<string | null>(null);

  // 外观
  const [coverFile, setCoverFile] = useState<string | null>(null);
  const originalCoverRef = useRef<string | null>(null);
  const [draftCoverFile, setDraftCoverFile] = useState<string | null>(null);
  const draftCoverRef = useRef<string | null>(null);
  const coverSession = useRef(createDraftCoverSession());
  // Capture the first image only; an existing item must never inherit AI imagery.
  const initialCoverImage = useRef<UIImage | null>(
    !isEditing && !props.aiEntrySession
      ? (props.initialCoverImage ?? null)
      : null,
  );
  const coverInitializationStarted = useRef(false);
  const coverPreparation = useRef<Promise<void> | null>(null);
  const coverInitializingRef = useRef(!!initialCoverImage.current);
  const [coverInitializing, setCoverInitializing] = useState(
    !!initialCoverImage.current,
  );
  const editorClosed = useRef(false);
  const commandInFlight = useRef(false);
  const saveInProgress = useRef(false);
  const pickingCover = useRef(false);
  const aiSession = useRef<AiEntrySession | null>(
    !isEditing ? (props.aiEntrySession ?? null) : null,
  );
  const aiController = useRef<AiEntryEditorController | null>(null);
  const [aiSnapshot, setAiSnapshot] = useState<AiEntrySnapshot | null>(
    aiSession.current?.getSnapshot() ?? null,
  );
  const [aiPreparing, setAiPreparing] = useState(false);
  const [aiCoverError, setAiCoverError] = useState("");
  const [aiDiagnosticCopied, setAiDiagnosticCopied] = useState(false);
  const aiRetrying = useRef(false);
  const [icon, setIcon] = useState<string | null>(null);

  // 封面显示路径只来自库内字节（可丢弃的 cache/covers 缓存），只刷新显示：
  // 不写库、不碰草稿。重建结果按“发起时的封面 + 会话 + 有无草稿”校验，过期即丢弃。
  const [coverRepairTick, setCoverRepairTick] = useState(0);
  // 已入库封面显示的是可丢弃缓存路径；库里没有字节时保持为空（不读常驻副本）。
  const [resolvedCoverPath, setResolvedCoverPath] = useState<string | null>(null);
  const coverFileRef = useRef<string | null>(null);
  coverFileRef.current = coverFile;
  useEffect(() => {
    const assetId = coverFile;
    if (!ready || !assetId || draftCoverFile) return;
    let active = true;
    void (async () => {
      try {
        // 缓存里可能仍记着“已校验”的旧路径：先清掉，再从权威字节重建。
        invalidateCoverValidation(assetId);
        const session = coverSession.current;
        const restored = await resolveCoverPath(assetId);
        // 过期/被取代的结果一律丢弃：编辑器已关闭、封面会话已更换、用户已改选
        // 其它封面，或已经裁切出新草稿时，绝不把旧图重新贴回表单。
        if (
          !active ||
          editorClosed.current ||
          session.closed ||
          coverSession.current !== session ||
          coverFileRef.current !== assetId ||
          draftCoverRef.current !== null
        )
          return;
        let visible = false;
        try {
          visible = !!restored.path && FileManager.existsSync(restored.path);
        } catch {
          visible = false;
        }
        if (visible) {
          setResolvedCoverPath(restored.path);
          setCoverRepairTick((n) => n + 1);
        }
        else console.log(`[Cover] ${assetId} 封面显示重建失败（${restored.status}）`);
      } catch (error) {
        console.log(`[Cover] ${assetId} 封面显示重建失败：${String(error)}`);
      }
    })();
    return () => {
      active = false;
    };
  }, [coverFile, draftCoverFile, ready, coverRepairTick]);

  // 维保与辅助
  const [channel, setChannel] = useState(initialDraft?.channel ?? "");
  const [enableWarranty, setEnableWarranty] = useState(
    !!initialDraft.warrantyUntil,
  );
  const [warrantyUntil, setWarrantyUntil] = useState<string | null>(
    initialDraft.warrantyUntil ?? null,
  );
  const [valuationText, setValuationText] = useState("");
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [notes, setNotes] = useState(initialDraft?.notes ?? "");
  const [sourceNotice] = useState<string | null>(
    initialDraft?.sourceNotice ?? null,
  );

  useEffect(() => {
    let cancelled = false;
    const session = coverSession.current;
    const isCurrent = () =>
      !cancelled &&
      !editorClosed.current &&
      !session.closed &&
      coverSession.current === session;

    if (!coverInitializationStarted.current) {
      coverInitializationStarted.current = true;
      const image = initialCoverImage.current;
      initialCoverImage.current = null;
      if (!isEditing && image && isCurrent()) {
        coverPreparation.current = (async () => {
          try {
            const filename = await replaceDraftCover(session, image);
            // Closing can race with PNG/file preparation. Close may have run
            // before replaceDraftCover assigned session.current, so clean again.
            if (!isCurrent()) {
              if (session.current === filename) session.current = null;
              await cleanupDraftCover(filename);
              return;
            }
            draftCoverRef.current = filename;
            setDraftCoverFile(filename);
          } catch {
            if (isCurrent()) {
              try {
                await Dialog.alert({
                  title: "无法准备封面",
                  message: "透明物品图未能准备为封面，请手动选取相片或图标。",
                  buttonLabel: "好",
                });
              } catch {
                /* Dismissal must not prevent manual editing. */
              }
            }
          } finally {
            coverInitializingRef.current = false;
            if (isCurrent()) setCoverInitializing(false);
          }
        })();
      } else {
        coverInitializingRef.current = false;
        if (isCurrent()) setCoverInitializing(false);
      }
    }
    return () => {
      cancelled = true;
      editorClosed.current = true;
      aiController.current?.close();
      initialCoverImage.current = null;
      if (
        !submission.current.isCompleted() &&
        !unknownOutcomeRef.current &&
        !commandInFlight.current
      ) {
        void closeDraftCoverSession(coverSession.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    // Every run gets its own generation: a late response from a previous
    // itemId or from a superseded retry can never write into the new state.
    const attempt = ++initAttempt.current;
    const isCurrent = () =>
      !cancelled && attempt === initAttempt.current && !editorClosed.current;
    initInFlight.current = true;
    setReady(false);
    setLoadError(null);
    setLoadMissing(false);
    if (reloadToken > 0) setReloading(true);
    void (async () => {
      try {
        const [catList, tagList] = await Promise.all([
          listCategories(),
          listTags(),
        ]);
        if (!isCurrent()) return;
        setCategories(catList);
        setAvailableTags(tagList);

        if (itemId) {
          const detail = await getItemDetail(itemId);
          if (!isCurrent()) return;
          if (!detail) {
            setLoadMissing(true);
            setLoadError("找不到这件物品的档案，可能已被删除。");
            return;
          }
          const knownIds = new Set(tagList.map((t) => t.id));

          setName(detail.item.name);
          setLoadedRevision(detail.item.revision);
          setPurchasedOn(detail.item.acquiredOn);
          setPurchasePriceText(
            detail.item.acquisitionAmountMinor !== null
              ? minorToDecimalText(detail.item.acquisitionAmountMinor)
              : "",
          );
          setCategoryId(detail.item.categoryId ?? "");
          setCoverFile(detail.item.coverAssetId ?? null);
          originalCoverRef.current = detail.item.coverAssetId ?? null;
          setIcon(detail.item.iconSymbol ?? null);
          setHoldingCondition(detail.item.holdingCondition);
          setExitReason(detail.exit?.reason ?? null);
          setExitDate(detail.exit?.exitedOn ?? null);
          setChannel(detail.item.channel ?? "");
          setEnableWarranty(detail.item.warrantyUntil != null);
          setWarrantyUntil(detail.item.warrantyUntil ?? null);
          setValuationText(
            detail.item.valuationMinor !== null
              ? minorToDecimalText(detail.item.valuationMinor)
              : "",
          );
          setSelectedTags(
            detail.tags.map((t) => t.id).filter((id) => knownIds.has(id)),
          );
          setNotes(detail.item.notes ?? "");
        } else if (!draftApplied.current) {
          // Apply the imported draft exactly once. A retry after a failed read
          // must not overwrite a category the user already picked or applied.
          draftApplied.current = true;
          const selectableCategories = filterSelectableCategories(catList);
          if (
            initialDraft?.categoryId &&
            !selectableCategories.some(
              (category) => category.id === initialDraft.categoryId,
            )
          ) {
            setCategoryId("");
          } else if (initialDraft?.categoryHint && !initialDraft.categoryId) {
            const matched = matchBestCategory(
              initialDraft.categoryHint,
              selectableCategories,
            );
            if (matched) {
              setCategoryId(matched.id);
            }
          }
        }
        // Do not expose Save or manual cover controls before the initial PNG
        // draft settles, even when category/tag loading wins the race. A retry
        // awaits the same promise: cover preparation never runs twice and Save
        // never opens early.
        await coverPreparation.current;
        if (!isCurrent() || coverSession.current.closed) return;
        setReady(true);
      } catch (err) {
        if (!isCurrent()) return;
        setReady(false);
        setLoadError(err instanceof Error ? err.message : String(err));
      } finally {
        if (attempt === initAttempt.current && !editorClosed.current) {
          initInFlight.current = false;
          setReloading(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [itemId, reloadToken]);

  useEffect(() => {
    const session = aiSession.current;
    if (!session) return;
    const controller = createAiEntryEditorController(session, {
      current: () =>
        !editorClosed.current &&
        !coverSession.current.closed &&
        !submission.current.isCompleted() &&
        !unknownOutcomeRef.current &&
        !commandInFlight.current,
      prepare: (image) => saveDraftCoverImage(image),
      apply: (filename) => {
        const previous = coverSession.current.current;
        coverSession.current.current = filename;
        if (previous && previous !== filename) void cleanupDraftCover(previous);
        draftCoverRef.current = filename;
        setDraftCoverFile(filename);
        setAiCoverError("");
      },
      discard: async (filename) => {
        if (coverSession.current.current === filename)
          coverSession.current.current = null;
        if (draftCoverRef.current === filename) {
          draftCoverRef.current = null;
          if (!editorClosed.current) setDraftCoverFile(null);
        }
        await cleanupDraftCover(filename);
      },
      changed: (snapshot, preparing) => {
        setAiSnapshot(snapshot);
        setAiPreparing(preparing);
      },
      failed: () =>
        setAiCoverError("生成图片未能准备为封面，可手动选择相片或重试图片。"),
    });
    aiController.current = controller;
    const unsubscribe = controller.connect();
    return () => {
      unsubscribe();
      controller.close();
    };
  }, []);

  /**
   * Re-read categories/tags/detail in place after an initial-load failure.
   * Only the init effect re-runs: the AI session, the prepared draft cover and
   * every field already on screen stay as they are, and a second tap while a
   * read is in flight is ignored (single flight).
   */
  function retryInitialLoad() {
    if (initInFlight.current || editorClosed.current) return;
    // Reserve synchronously so a double tap cannot start two reads before the
    // reloading state reaches the button.
    initInFlight.current = true;
    setReloading(true);
    setReloadToken((v) => v + 1);
  }

  async function retryAiCover() {
    const session = aiSession.current;
    if (
      !session ||
      editorClosed.current ||
      busy ||
      saveInProgress.current ||
      pickingCover.current ||
      unknownOutcomeRef.current ||
      aiRetrying.current
    )
      return;
    aiRetrying.current = true;
    try {
      const retry = await Dialog.confirm({
        title: "重新生成物品图？",
        message:
          "仅重新请求物品图，保留已填写字段。此次请求可能再次计费；取消本地等待不保证上游停止计费。",
        confirmLabel: "重试图片",
        cancelLabel: "取消",
      });
      if (
        retry &&
        !editorClosed.current &&
        !saveInProgress.current &&
        !pickingCover.current &&
        !unknownOutcomeRef.current &&
        !submission.current.isCompleted()
      ) {
        setAiCoverError("");
        const started = await aiController.current?.retryImage();
        // A refused retry never sends a request; say so instead of leaving a
        // button that silently does nothing.
        if (!started && !editorClosed.current)
          await Dialog.alert({
            title: "无法重新生成物品图",
            message:
              session.getSnapshot().closed
                ? "本次 AI 生成会话已结束，未发送新的请求。可手动选择相片，或重新开始 AI 录入。"
                : "当前正在准备封面或处理相片，暂不能重试；未发送新的请求。请待当前操作完成后再试。",
            buttonLabel: "好",
          });
      }
    } finally {
      aiRetrying.current = false;
    }
  }

  async function handlePickPhoto() {
    if (
      !ready ||
      coverInitializingRef.current ||
      editorClosed.current ||
      saveInProgress.current ||
      unknownOutcomeRef.current ||
      coverSession.current.closed ||
      pickingCover.current
    )
      return;
    if (aiController.current && !aiController.current.beginPicking()) return;
    pickingCover.current = true;
    const session = coverSession.current;
    const current = () =>
      !editorClosed.current &&
      !session.closed &&
      coverSession.current === session;
    try {
      const picked = await pickCoverImage();
      if (!picked || !current()) return;
      const cropped = await Navigation.present<UIImage | null>({
        element: <CoverCropPage image={picked} />,
        modalPresentationStyle: "pageSheet",
      });
      if (!cropped || !current()) return;
      await aiController.current?.settle();
      if (!current()) return;
      const filename = await replaceDraftCover(session, cropped);
      if (!current()) {
        if (session.current === filename) session.current = null;
        await cleanupDraftCover(filename);
        return;
      }
      await aiController.current?.manualAccepted();
      if (!current()) return;
      draftCoverRef.current = filename;
      setDraftCoverFile(filename);
    } catch (err) {
      if (!current()) return;
      await Dialog.alert({
        title: "无法选取相片",
        message: err instanceof Error ? err.message : String(err),
        buttonLabel: "好",
      });
    } finally {
      pickingCover.current = false;
      aiController.current?.endPicking();
    }
  }

  async function openIconSelector() {
    if (
      !ready ||
      coverInitializingRef.current ||
      editorClosed.current ||
      saveInProgress.current ||
      unknownOutcomeRef.current ||
      coverSession.current.closed
    )
      return;
    if (pickingCover.current) return;
    if (aiController.current && !aiController.current.beginPicking()) return;
    pickingCover.current = true;
    try {
      await Navigation.present({
        element: (
          <IconPickerModal
            kind="item"
            selectedSymbol={icon}
            onSelect={async (selected) => {
              if (editorClosed.current || submission.current.isCompleted())
                return;
              await aiController.current?.manualAccepted();
              if (editorClosed.current || submission.current.isCompleted())
                return;
              await closeDraftCoverSession(coverSession.current);
              coverSession.current = createDraftCoverSession();
              draftCoverRef.current = null;
              setDraftCoverFile(null);
              setCoverFile(null);
              setIcon(selected.symbol);
            }}
          />
        ),
        modalPresentationStyle: "pageSheet",
      });
    } finally {
      pickingCover.current = false;
      aiController.current?.endPicking();
    }
  }

  /** Copy the scrubbed cutout diagnostic (host, model, path, response structure; never key/prompt/image). */
  async function copyAiCoverDiagnostic() {
    const cutout = aiSnapshot?.result.cutout;
    if (!cutout) return;
    try {
      await Pasteboard.setString(buildAiCutoutDiagnostic(cutout));
      if (editorClosed.current) return;
      setAiDiagnosticCopied(true);
      setTimeout(() => {
        if (!editorClosed.current) setAiDiagnosticCopied(false);
      }, 2000);
    } catch {
      if (!editorClosed.current)
        await Dialog.alert({ title: "诊断未能复制", message: "请稍后重试。" });
    }
  }

  async function stopAiCoverWaiting() {
    if (
      !ready ||
      busy ||
      saveInProgress.current ||
      pickingCover.current ||
      editorClosed.current ||
      unknownOutcomeRef.current
    )
      return;
    await aiController.current?.manualAccepted();
    if (!editorClosed.current) setAiCoverError("");
  }

  async function removeEditorCover() {
    if (
      !ready ||
      busy ||
      saveInProgress.current ||
      pickingCover.current ||
      editorClosed.current ||
      unknownOutcomeRef.current
    )
      return;
    pickingCover.current = true;
    try {
      await aiController.current?.manualAccepted();
      if (editorClosed.current) return;
      await closeDraftCoverSession(coverSession.current);
      if (editorClosed.current) return;
      coverSession.current = createDraftCoverSession();
      draftCoverRef.current = null;
      setDraftCoverFile(null);
      setCoverFile(null);
    } finally {
      pickingCover.current = false;
    }
  }

  async function openTagSelector() {
    await Navigation.present({
      element: (
        <TagMultiSelectSheet
          availableTags={availableTags}
          selectedTagIds={selectedTags}
          onConfirm={(ids) => setSelectedTags(ids)}
          onTagCreated={(tag) => {
            setAvailableTags((prev) =>
              prev.some((item) => item.id === tag.id) ? prev : [...prev, tag],
            );
          }}
        />
      ),
      modalPresentationStyle: "pageSheet",
    });
  }

  async function handleSave() {
    if (
      !ready ||
      coverInitializingRef.current ||
      editorClosed.current ||
      coverSession.current.closed ||
      pickingCover.current ||
      busy ||
      saveInProgress.current ||
      unknownOutcome
    )
      return;
    const trimmedName = name.trim();
    if (!trimmedName) {
      await Dialog.alert({
        title: "无法保存",
        message: "请填写物品名称。",
        buttonLabel: "好",
      });
      return;
    }
    // Explain the exchange-contract limits before a write instead of silently
    // truncating (that would lose user text) or leaving an un-exportable item.
    const tooLong = [
      { label: "物品名称", value: trimmedName, max: ITEMORY_NAME_MAX_LENGTH },
      { label: "备注", value: notes.trim(), max: ITEMORY_TEXT_MAX_LENGTH },
      { label: "购入渠道", value: channel.trim(), max: ITEMORY_TEXT_MAX_LENGTH },
    ].find((field) => field.value.length > field.max);
    if (tooLong) {
      await Dialog.alert({
        title: "无法保存",
        message: `${tooLong.label}已有 ${tooLong.value.length} 个字符，超过 ${tooLong.max} 个字符的上限。请缩短后再保存，内容不会被自动截断。`,
        buttonLabel: "好",
      });
      return;
    }
    if (!submission.current.begin()) return;
    saveInProgress.current = true;
    setBusy(true);
    let newlyCommittedCover: string | null = null;
    let commandStarted = false;
    let businessCommitted = false;
    let cleanupWarning: string | null = null;
    const previousCover = originalCoverRef.current;
    const session = coverSession.current;
    const current = () =>
      !editorClosed.current &&
      !session.closed &&
      coverSession.current === session;
    try {
      if (aiController.current?.hasPendingImage()) {
        const saveWithout = await Dialog.confirm({
          title: "物品图尚未准备完成",
          message:
            "可继续等待生成图片，或不含生成图片保存。已有手动封面会保留；保存后不会后台补写封面。",
          confirmLabel: "不含生成图片保存",
          cancelLabel: "继续等待",
        });
        if (!saveWithout || !current()) return;
        await aiController.current.freeze(true);
      } else {
        await aiController.current?.freeze(false);
      }
      if (!current()) return;
      // Ref values, not the render-time closure, own the fixed command cover.
      const fixedDraftCover = draftCoverRef.current;
      if (!isEditing && !dateConfirmed) {
        const confirmed = await Dialog.confirm({
          title: "确认购入日期",
          message: `图片未识别购入日期。是否确认使用 ${purchasedOn}？`,
          confirmLabel: "确认此日期",
          cancelLabel: "返回修改",
        });
        if (!confirmed || !current()) return;
        setDateConfirmed(true);
      }
      if (!isEditing && !priceConfirmed && purchasePriceText.trim()) {
        const confirmed = await Dialog.confirm({
          title: "确认单件人民币金额",
          message: `旧格式未明确金额归属和币种。是否确认 ${purchasePriceText} 元属于这件物品，而不是整单或外币？`,
          confirmLabel: "确认此金额",
          cancelLabel: "返回修改",
        });
        if (!confirmed || !current()) return;
        setPriceConfirmed(true);
      }
      const acqMinor = parseYuanToMinor(purchasePriceText);
      const valMinor = parseYuanToMinor(valuationText);
      let committedCover = coverFile;
      if (fixedDraftCover) {
        committedCover = await promoteDraftCover(session);
        newlyCommittedCover = committedCover;
        if (!current()) return;
      }

      const commandPayload = buildItemMutationPayload({
        id: itemId ?? null,
        name: trimmedName,
        categoryId: categoryId || null,
        acquiredOn: purchasedOn,
        acquisitionAmountMinor: acqMinor,
        holdingCondition,
        iconSymbol: icon ?? null,
        coverAssetId: committedCover,
        channel: channel.trim() || null,
        warrantyUntil: enableWarranty ? warrantyUntil : null,
        valuationMinor: valMinor,
        notes: notes.trim() || null,
        tagIds: selectedTags,
        expectedRevision: loadedRevision,
      });
      if (!mutation.current) {
        mutation.current = newMutationContext(
          isEditing ? "item.update" : "item.create",
          commandPayload,
        );
      }

      if (!current()) return;
      let savedId = itemId ?? "";
      commandStarted = true;
      commandInFlight.current = true;
      if (isEditing && itemId) {
        if (loadedRevision === null)
          throw new Error("档案修订号尚未载入，请重新打开编辑页");
        await updateItem({
          ...commandPayload,
          id: itemId,
          expectedRevision: loadedRevision,
          command: mutation.current,
        });
      } else {
        savedId = await createItem({
          ...commandPayload,
          command: mutation.current,
        });
      }

      // From this point on the DB result is known committed. UI refresh and
      // physical cleanup must not be allowed to change that business truth.
      businessCommitted = true;
      submission.current.complete();
      draftCoverRef.current = null;
      session.current = null;
      if (previousCover && previousCover !== committedCover) {
        const cleanup = await removeUnreferencedCoverPhoto(
          await getDatabase(),
          previousCover,
        );
        if (cleanup.status === "failed" || cleanup.warning)
          cleanupWarning = cleanup.warning ?? "旧正式封面清理失败";
      }
      originalCoverRef.current = committedCover;
      if (!current()) return;
      setCoverFile(committedCover);
      setDraftCoverFile(null);

      if (cleanupWarning) {
        await Dialog.alert({
          title: "已保存，但封面清理有警告",
          message: `${cleanupWarning}。业务数据已经提交，不要重复保存。`,
          buttonLabel: "知道了",
        });
      }
      if (!current()) return;
      if (onSaved) await Promise.resolve(onSaved(savedId));
      if (current()) handleClose();
    } catch (err) {
      const unknown =
        commandStarted && !businessCommitted && isUnknownMutationError(err);
      if (!businessCommitted && !unknown) {
        mutation.current = null;
        if (newlyCommittedCover) {
          const rollback = await rollbackCommittedCover(newlyCommittedCover);
          if (rollback.status === "failed") {
            cleanupWarning = rollback.warning ?? "新封面无法恢复为草稿";
            draftCoverRef.current = null;
            if (current()) setDraftCoverFile(null);
          } else {
            session.promoted.delete(newlyCommittedCover);
            if (current()) {
              session.current = newlyCommittedCover;
              draftCoverRef.current = newlyCommittedCover;
            } else {
              await cleanupDraftCover(newlyCommittedCover);
            }
          }
          newlyCommittedCover = null; // Rollback ownership has already been settled.
        }
      }

      if (unknown) {
        unknownOutcomeRef.current = true;
        if (!current()) return;
        setUnknownOutcome(true);
        await Dialog.alert({
          title: "保存结果未知",
          message: "请重启并核对待决操作后再继续，当前不要重复保存。",
          buttonLabel: "知道了",
        });
      } else if (businessCommitted || submission.current.isCompleted()) {
        if (!current()) return;
        await Dialog.alert({
          title: "已保存",
          message: "刷新或关闭页面失败，请返回列表，勿重复保存。",
          buttonLabel: "知道了",
        });
      } else {
        if (!current()) return;
        const base = err instanceof Error ? err.message : String(err);
        await Dialog.alert({
          title: "无法保存",
          message: cleanupWarning ? `${base}；${cleanupWarning}` : base,
          buttonLabel: "好",
        });
        submission.current.release();
      }
      if (current()) setBusy(false);
    } finally {
      // Cancellation before a command must release the real intent lock.
      // A promoted file without a command has no possible DB owner.
      if (!commandStarted && newlyCommittedCover) {
        const rollback = await rollbackCommittedCover(newlyCommittedCover);
        session.promoted.delete(newlyCommittedCover);
        if (rollback.status !== "failed" && current()) {
          session.current = newlyCommittedCover;
          draftCoverRef.current = newlyCommittedCover;
        } else if (rollback.status !== "failed") {
          await cleanupDraftCover(newlyCommittedCover);
        }
      }
      commandInFlight.current = false;
      saveInProgress.current = false;
      if (!businessCommitted && !unknownOutcomeRef.current) {
        submission.current.release();
        if (current()) aiController.current?.releaseSave();
      }
      if (
        editorClosed.current &&
        !businessCommitted &&
        !unknownOutcomeRef.current
      ) {
        await closeDraftCoverSession(session);
      }
      if (current() && !businessCommitted && !unknownOutcomeRef.current)
        setBusy(false);
    }
  }

  // 草稿优先；已入库封面只认解析出的缓存路径，绝不回落到 covers/<id>.png 副本。
  const coverPath = draftCoverFile
    ? draftFilePath(draftCoverFile)
    : coverFile
      ? resolvedCoverPath
      : null;
  const currentCategory = categories.find((c) => c.id === categoryId);
  const displayIcon = icon || currentCategory?.icon || "shippingbox.fill";
  const waitingForAiCover =
    !!aiSnapshot &&
    !aiSnapshot.closed &&
    (["idle", "running"].includes(aiSnapshot.cutoutStatus) || aiPreparing);
  const showAiRetry =
    !!aiSnapshot &&
    !aiSnapshot.closed &&
    (!!aiCoverError ||
      ["failed", "ignored", "cancelled"].includes(aiSnapshot.cutoutStatus));
  const hasVisibleCover = !!coverPath && FileManager.existsSync(coverPath);

  // A failed initial read must not be a dead end. This screen is rendered
  // instead of the (disabled) form, so «重新载入» and «取消» stay tappable.
  if (loadError) {
    return (
      <List
        navigationTitle={isEditing ? "编辑物品" : "添加物品"}
        {...nativeListPageProps("inline")}
        toolbar={{
          cancellationAction: <Button title="取消" action={handleClose} />,
        }}
      >
        <Section>
          <VStack
            alignment="leading"
            spacing={10}
            padding={{ vertical: 12 }}
            frame={{ maxWidth: "infinity", alignment: "leading" }}
          >
            <Text font="headline">
              {loadMissing ? "这件物品已不存在" : "无法载入物品数据"}
            </Text>
            <Text font="subheadline" foregroundStyle="secondaryLabel">
              {loadError}
            </Text>
            <Text font="footnote" foregroundStyle="secondaryLabel">
              {loadMissing
                ? "它可能已在其他页面被删除。可以重新载入确认，或返回列表。"
                : "已填写的内容、生成中的物品图和封面都不会因为重新载入而丢失。"}
            </Text>
            <Button
              title={reloading ? "重新载入中…" : "重新载入"}
              disabled={reloading}
              action={() => retryInitialLoad()}
            />
            <Button title="取消" buttonStyle="bordered" action={handleClose} />
          </VStack>
        </Section>
      </List>
    );
  }

  return (
    <List
      navigationTitle={isEditing ? "编辑物品" : "添加物品"}
      {...nativeListPageProps("inline")}
      disabled={
        !ready ||
        coverInitializing ||
        busy ||
        unknownOutcome ||
        submission.current.isCompleted()
      }
      toolbar={{
        confirmationAction: (
          <Button
            title={
              !ready
                ? "等待载入"
                : busy
                  ? "保存中"
                  : unknownOutcome
                    ? "待核对"
                    : "保存"
            }
            disabled={
              !ready ||
              coverInitializing ||
              busy ||
              unknownOutcome ||
              submission.current.isCompleted()
            }
            action={() => void handleSave()}
          />
        ),
      }}
    >
      {/* 顶部封面与主操作 */}
      <Section>
          <VStack
            alignment="center"
            spacing={16}
            frame={{ maxWidth: "infinity" }}
          >
            {sourceNotice ? (
              <HStack
                spacing={6}
                frame={{ maxWidth: "infinity" }}
                alignment="center"
              >
                <Image
                  systemName="sparkles"
                  font={12}
                  foregroundStyle="accentColor"
                />
                <Text
                  font="caption"
                  foregroundStyle="accentColor"
                  lineLimit={2}
                  frame={{ maxWidth: "infinity", alignment: "leading" }}
                >
                  {sourceNotice}
                </Text>
              </HStack>
            ) : null}

            {waitingForAiCover && !hasVisibleCover ? (
              <VStack frame={{ width: 124, height: 124 }} alignment="center">
                <ProgressView
                  progressViewStyle="circular"
                  controlSize="large"
                />
              </VStack>
            ) : coverPath && hasVisibleCover ? (
              <ZStack frame={{ width: 132, height: 132 }} alignment="center">
                <Image
                  filePath={coverPath}
                  resizable
                  renderingMode="original"
                  frame={{ width: 124, height: 124 }}
                  clipShape={{ type: "rect", cornerRadius: 22 }}
                />
                {!waitingForAiCover ? (
                  <VStack
                    frame={{
                      width: 132,
                      height: 132,
                      alignment: "topTrailing",
                    }}
                  >
                    <ZStack frame={{ width: 44, height: 44 }} alignment="center">
                      <VStack
                        frame={{ width: 24, height: 24 }}
                        background="rgba(60, 60, 67, 0.6)"
                        clipShape="circle"
                        allowsHitTesting={false}
                      />
                      <Button
                        title="移除封面"
                        systemImage="xmark"
                        labelStyle="iconOnly"
                        buttonStyle="plain"
                        font={11}
                        fontWeight="bold"
                        foregroundStyle="white"
                        frame={{ width: 44, height: 44 }}
                        contentShape="circle"
                        action={() => void removeEditorCover()}
                      />
                    </ZStack>
                  </VStack>
                ) : null}
              </ZStack>
            ) : (
              <VStack
                frame={{ width: 124, height: 124 }}
                background="clear"
                clipShape={{ type: "rect", cornerRadius: 22 }}
                alignment="center"
              >
                {isEmojiSymbol(displayIcon) ? (
                  <Text
                    font={76}
                    multilineTextAlignment="center"
                    frame={{ width: 116, height: 116, alignment: "center" }}
                  >
                    {displayIcon}
                  </Text>
                ) : (
                  <Image
                    systemName={displayIcon}
                    font={72}
                    foregroundStyle="accentColor"
                  />
                )}
              </VStack>
            )}

            {waitingForAiCover ? (
              <Text font="subheadline" foregroundStyle="secondaryLabel">
                正在生成物品图…
              </Text>
            ) : null}
            {!aiSnapshot?.closed &&
            (aiSnapshot?.cutoutStatus === "failed" || aiCoverError) ? (
              <Text
                font="footnote"
                foregroundStyle="secondaryLabel"
                multilineTextAlignment="center"
              >
                {aiCoverError || "物品图未完成，已填写字段不会丢失。"}
              </Text>
            ) : null}
            {!waitingForAiCover &&
            !hasVisibleCover &&
            aiSnapshot?.closed ? (
              <Text font="footnote" foregroundStyle="secondaryLabel">
                {"AI 生成会话已结束，未生成物品图。可手动选择相片，或重新开始 AI 录入。"}
              </Text>
            ) : null}

            {waitingForAiCover ? (
              <HStack spacing={10} frame={{ maxWidth: "infinity" }}>
                <Button
                  buttonStyle="plain"
                  frame={{ maxWidth: "infinity" }}
                  action={() => void stopAiCoverWaiting()}
                >
                  <HStack
                    spacing={8}
                    alignment="center"
                    padding={{ horizontal: 18, vertical: 10 }}
                    frame={{ minHeight: 44, maxWidth: "infinity", alignment: "center" }}
                    background="accentColor"
                    clipShape="capsule"
                    contentShape="capsule"
                  >
                    <Image systemName="xmark" font={15} foregroundStyle="white" />
                    <Text font="body" fontWeight="semibold" foregroundStyle="white" lineLimit={1}>
                      停止等待
                    </Text>
                  </HStack>
                </Button>
                <Button
                  buttonStyle="plain"
                  frame={{ maxWidth: "infinity" }}
                  action={() => void handlePickPhoto()}
                >
                  <HStack
                    spacing={8}
                    alignment="center"
                    padding={{ horizontal: 18, vertical: 10 }}
                    frame={{ minHeight: 44, maxWidth: "infinity", alignment: "center" }}
                    background="secondarySystemFill"
                    clipShape="capsule"
                    contentShape="capsule"
                  >
                    <Image systemName="camera.fill" font={15} foregroundStyle="accentColor" />
                    <Text font="body" fontWeight="semibold" foregroundStyle="accentColor" lineLimit={1}>
                      {hasVisibleCover ? "更换相片" : "选取相片"}
                    </Text>
                  </HStack>
                </Button>
              </HStack>
            ) : (
              <VStack spacing={10} frame={{ maxWidth: "infinity" }}>
                {showAiRetry ? (
                  <HStack spacing={10} frame={{ maxWidth: "infinity" }}>
                    <Button
                      buttonStyle="plain"
                      frame={{ maxWidth: "infinity" }}
                      action={() => void retryAiCover()}
                    >
                      <HStack
                        spacing={8}
                        alignment="center"
                        padding={{ horizontal: 18, vertical: 10 }}
                        frame={{ minHeight: 44, maxWidth: "infinity", alignment: "center" }}
                        background="secondarySystemFill"
                        clipShape="capsule"
                        contentShape="capsule"
                      >
                        <Image systemName="arrow.clockwise" font={15} foregroundStyle="accentColor" />
                        <Text font="body" fontWeight="semibold" foregroundStyle="accentColor" lineLimit={1}>
                          重新生成
                        </Text>
                      </HStack>
                    </Button>
                    {aiSnapshot?.result.cutout?.error ? (
                      <Button
                        buttonStyle="plain"
                        frame={{ maxWidth: "infinity" }}
                        action={() => void copyAiCoverDiagnostic()}
                      >
                        <HStack
                          spacing={8}
                          alignment="center"
                          padding={{ horizontal: 18, vertical: 10 }}
                          frame={{ minHeight: 44, maxWidth: "infinity", alignment: "center" }}
                          background="secondarySystemFill"
                          clipShape="capsule"
                          contentShape="capsule"
                        >
                          <Image systemName="doc.on.doc" font={15} foregroundStyle="accentColor" />
                          <Text font="body" fontWeight="semibold" foregroundStyle="accentColor" lineLimit={1}>
                            {aiDiagnosticCopied ? "已复制诊断" : "复制诊断"}
                          </Text>
                        </HStack>
                      </Button>
                    ) : null}
                  </HStack>
                ) : null}
                <HStack spacing={10} frame={{ maxWidth: "infinity" }}>
                  <Button
                    buttonStyle="plain"
                    frame={{ maxWidth: "infinity" }}
                    action={() => void handlePickPhoto()}
                  >
                    <HStack
                      spacing={8}
                      alignment="center"
                      padding={{ horizontal: 18, vertical: 10 }}
                      frame={{ minHeight: 44, maxWidth: "infinity", alignment: "center" }}
                      background="accentColor"
                      clipShape="capsule"
                      contentShape="capsule"
                    >
                      <Image systemName="camera.fill" font={15} foregroundStyle="white" />
                      <Text font="body" fontWeight="semibold" foregroundStyle="white" lineLimit={1}>
                        {hasVisibleCover ? "更换相片" : "选取相片"}
                      </Text>
                    </HStack>
                  </Button>
                  <Button
                    buttonStyle="plain"
                    frame={{ maxWidth: "infinity" }}
                    action={() => void openIconSelector()}
                  >
                    <HStack
                      spacing={8}
                      alignment="center"
                      padding={{ horizontal: 18, vertical: 10 }}
                      frame={{ minHeight: 44, maxWidth: "infinity", alignment: "center" }}
                      background="secondarySystemFill"
                      clipShape="capsule"
                      contentShape="capsule"
                    >
                      <Image systemName="square.grid.2x2.fill" font={15} foregroundStyle="accentColor" />
                      <Text font="body" fontWeight="semibold" foregroundStyle="accentColor" lineLimit={1}>
                        选择图标
                      </Text>
                    </HStack>
                  </Button>
                </HStack>
              </VStack>
            )}
          </VStack>
      </Section>

      {/* 基础信息 */}
      <Section
        header={<NativeSectionHeader title="基础信息" />}
      >
          <LabeledField title="物品名称" value={name} onChanged={setName} />
          <TextLimitNotice
            label="物品名称"
            value={name}
            max={ITEMORY_NAME_MAX_LENGTH}
          />
          <Picker
            title="所属分类"
            value={categoryId}
            onChanged={setCategoryId}
            pickerStyle="menu"
          >
            <Text tag="">未分类</Text>
            {filterSelectableCategories(
              categories,
              isEditing ? categoryId : null,
            ).map((c) => (
              <HStack key={c.id} tag={c.id} spacing={6}>
                <Image systemName={c.icon} />
                <Text>{c.name}</Text>
              </HStack>
            ))}
          </Picker>
          {exitReason ? (
            <>
              <HStack
                spacing={12}
                alignment="center"
              >
                <Text>物品状态</Text>
                <Spacer />
                <Text foregroundStyle={ITEM_STATUS_META[exitReason].color}>
                  {ITEM_STATUS_META[exitReason].label}
                </Text>
              </HStack>
              {exitDate ? (
                <>
                  <HStack
                    spacing={12}
                    alignment="center"
                  >
                    <Text>结束日期</Text>
                    <Spacer />
                    <Text>{formatYmdZh(exitDate)}</Text>
                  </HStack>
                </>
              ) : null}
            </>
          ) : (
            <Picker
              title="物品状态"
              value={holdingCondition}
              onChanged={(v: string) => setHoldingCondition(v as ItemCondition)}
              pickerStyle="menu"
            >
              <Text tag="in_use">在用</Text>
              <Text tag="idle">闲置</Text>
              <Text tag="damaged">损坏</Text>
            </Picker>
          )}
          <HStack
            spacing={12}
            alignment="center"
            contentShape="rect"
            onTapGesture={() => void openTagSelector()}
          >
            <Text>物品标签</Text>
            <Spacer />
            {selectedTags.length === 0 ? (
              <HStack spacing={4} alignment="center">
                <Text foregroundStyle="secondaryLabel">未添加</Text>
                <Image
                  systemName="chevron.right"
                  font={12}
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            ) : (
              <HStack spacing={6} alignment="center">
                {selectedTags.slice(0, 2).map((tagId) => {
                  const tag = availableTags.find((t) => t.id === tagId);
                  if (!tag) return null;
                  return (
                    <HStack key={tag.id} spacing={3} alignment="center">
                      <Circle
                        fill={tag.color as Color}
                        frame={{ width: 6, height: 6 }}
                      />
                      <Text
                        font="footnote"
                        foregroundStyle="secondaryLabel"
                        lineLimit={1}
                      >
                        {tag.name}
                      </Text>
                    </HStack>
                  );
                })}
                {selectedTags.length > 2 ? (
                  <Text font="footnote" foregroundStyle="secondaryLabel">
                    +{selectedTags.length - 2}
                  </Text>
                ) : null}
                <Image
                  systemName="chevron.right"
                  font={12}
                  foregroundStyle="tertiaryLabel"
                />
              </HStack>
            )}
          </HStack>
      </Section>

      <Section
        header={<NativeSectionHeader title="购入信息" />}
      >
          <VStack
            spacing={4}
            alignment="leading"
            frame={{ maxWidth: "infinity" }}
          >
            <DatePicker
              title="购入日期"
              value={ymdToTs(purchasedOn)}
              displayedComponents={["date"]}
              datePickerStyle="compact"
              onChanged={(ts) => {
                setPurchasedOn(tsToYmd(ts));
                setDateConfirmed(true);
              }}
            />
            {!dateConfirmed ? (
              <Text font="caption" foregroundStyle="orange">
                未识别，暂填今天；保存前需确认
              </Text>
            ) : null}
          </VStack>
          <LabeledField
            title="购入价格"
            value={purchasePriceText}
            onChanged={(value) => {
              setPurchasePriceText(value);
              setPriceConfirmed(true);
            }}
            decimal
          />
          {!priceConfirmed ? (
            <Text font="caption" foregroundStyle="orange">
              金额归属/币种待确认，请确认是单件人民币金额
            </Text>
          ) : null}
          <LabeledField
            title="购入渠道"
            value={channel}
            onChanged={setChannel}
          />
          <TextLimitNotice
            label="购入渠道"
            value={channel}
            max={ITEMORY_TEXT_MAX_LENGTH}
          />
      </Section>

      <Section
        header={<NativeSectionHeader title="保修信息" />}
      >
          <Toggle
            title="设置保修期"
            value={enableWarranty}
            onChanged={(on) => {
              setEnableWarranty(on);
              if (on && !warrantyUntil)
                setWarrantyUntil(addYearsYmd(purchasedOn, 1));
            }}
          />
          {enableWarranty ? (
            <>
              <DatePicker
                title="保修截止日期"
                value={ymdToTs(warrantyUntil ?? todayYmd())}
                displayedComponents={["date"]}
                datePickerStyle="compact"
                onChanged={(ts) => setWarrantyUntil(tsToYmd(ts))}
              />
            </>
          ) : null}
      </Section>

      <Section
        header={<NativeSectionHeader title="当前估值" />}
      >
          <LabeledField
            title="当前估值"
            value={valuationText}
            onChanged={setValuationText}
            decimal
          />
      </Section>

      <Section
        header={<NativeSectionHeader title="备注" />}
      >
          <TextField
            title="备注"
            prompt="添加关于物品的补充说明"
            value={notes}
            onChanged={setNotes}
            axis="vertical"
            lineLimit={{ min: 1, max: 6 }}
            padding={{ vertical: 12 }}
            frame={{ maxWidth: "infinity" }}
          />
          <TextLimitNotice
            label="备注"
            value={notes}
            max={ITEMORY_TEXT_MAX_LENGTH}
          />
      </Section>
    </List>
  );
}
