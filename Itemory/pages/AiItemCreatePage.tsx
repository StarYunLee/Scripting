import {
  Button,
  List,
  Navigation,
  NavigationStack,
  Section,
  Text,
  ZStack,
  useEffect,
  useRef,
  useState,
} from "scripting";
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
import type { AiItemWorkflowResult } from "../services/ai-item-workflow";
import {
  createAiEntrySession,
  type AiEntrySession,
  type AiEntrySnapshot,
} from "../services/ai-entry-session";
import { readAiEntryPolicy } from "../services/ai-entry-policy";
import { makeAiItemEditorDraft } from "../services/ai-item-draft";
import type { ItemEditorDraft } from "./ItemEditorPage";
import { safeAiVisionError } from "../services/ai-vision-diagnostics";
import { pickCoverImage } from "../services/covers";
import { AiVisionSettingsModal } from "./AiVisionSettingsPage";
import { AiItemResultView } from "../ui/ai-item-result";
import { AiVisionHud } from "../ui/ai-vision-hud";
import { nativeListPageProps, NativeSectionHeader, NativeNoteRow } from "../ui/native-list";


export type AiItemEntrySelection = {
  draft: ItemEditorDraft;
  result: AiItemWorkflowResult;
  session: AiEntrySession;
};

/** Creator owns the operation until handoff; disappearing behind a modal is not disposal. */
export function AiItemCreatePage(props: {
  onContinue(selection: AiItemEntrySelection): boolean;
  onSession?(session: AiEntrySession): boolean;
}) {
  const dismiss = Navigation.useDismiss();
  const [snapshot, setSnapshot] = useState<AiEntrySnapshot | null>(null);
  const [selecting, setSelecting] = useState(false);
  const [background, setBackground] = useState("light");
  const [notice, setNotice] = useState("");
  const session = useRef<AiEntrySession | null>(null);
  const unsubscribe = useRef<(() => void) | null>(null);
  const alive = useRef(true);
  const actionLock = useRef(false);
  const accepted = useRef(false);
  const revision = useRef(0);
  useEffect(
    () => () => {
      alive.current = false;
      revision.current++;
      unsubscribe.current?.();
      unsubscribe.current = null;
      // Handoff keeps the image branch alive; abandoning a creator releases its original image.
      session.current?.abandon();
      session.current = null;
    },
    [],
  );

  function continueToEditor(manual = false) {
    const current = session.current;
    if (
      !alive.current ||
      accepted.current ||
      !current ||
      current.getSnapshot().closed
    )
      return;
    const next = current.getSnapshot();
    if (!manual && !next.result.information?.editorDraft) return;
    accepted.current = true; // handoff publishes synchronously: guard BEFORE handing ownership over.
    if (manual) current.cancel("information");
    const result = manual
      ? { ...current.getSnapshot().result, information: null }
      : next.result;
    const draft = makeAiItemEditorDraft(result);
    if (manual) draft.dateNeedsConfirmation = true;
    if (!current.handoff()) {
      current.close();
      dismiss();
      return;
    }
    unsubscribe.current?.();
    unsubscribe.current = null;
    try {
      if (!props.onContinue({ draft, result, session: current }))
        current.close();
    } catch (error) {
      current.close();
      if (alive.current) setNotice(safeAiVisionError(error));
    }
    session.current = null;
    dismiss();
  }

  async function selectImage() {
    if (
      actionLock.current ||
      accepted.current ||
      session.current ||
      !alive.current
    )
      return;
    actionLock.current = true;
    const epoch = ++revision.current;
    const current = () =>
      alive.current && !accepted.current && revision.current === epoch;
    let key = "";
    setSelecting(true);
    setNotice("");
    try {
      // Disabled policy must not even open Photos or inspect image configuration.
      const policy = readAiEntryPolicy();
      if (!policy.mode) {
        const go = await Dialog.confirm({
          title: "启用 AI 识图录入",
          message:
            "请到设置启用物品信息解析。录入生图可另行开启；效果测试不受开关影响。",
          confirmLabel: "去设置",
          cancelLabel: "取消",
        });
        if (go && current())
          await Navigation.present({ element: <AiVisionSettingsModal /> });
        return;
      }
      const profile = readAiVisionProfile();
      key = readAiVisionApiKey() ?? "";
      let cutoutModel = "",
        cutoutPrompt: string | undefined;
      let valid =
        !!profile.baseURL.trim() &&
        !!profile.model.trim() &&
        profile.model.trim().length <= 200 &&
        !!key.trim();
      try {
        resolveOpenAICompatibleRoot(profile.baseURL);
      } catch {
        valid = false;
      }
      if (policy.mode === "combined" && valid) {
        cutoutModel = readAiCutoutModel(profile.baseURL);
        cutoutPrompt = resolveAiCutoutPrompt(
          readAiCutoutPrompt(),
          AI_CUTOUT_DEFAULT_PROMPT,
        );
        valid =
          isSupportedAiCutoutModel(cutoutModel) && cutoutPrompt.length <= 6000;
      }
      if (!valid) {
        const go = await Dialog.confirm({
          title: "配置 AI 识图录入",
          message:
            policy.mode === "combined"
              ? "请保存接口、密钥、信息模型及支持的物品图模型和提示词。两路并行请求，可能分别计费。"
              : "请保存接口、密钥与信息解析模型。仅信息解析不读取或请求图片模型。",
          confirmLabel: "去设置",
          cancelLabel: "取消",
        });
        if (go && current())
          await Navigation.present({ element: <AiVisionSettingsModal /> });
        return;
      }
      const picked = await pickCoverImage();
      if (!picked || !current()) return;
      const next = createAiEntrySession({
        mode: policy.mode,
        profile,
        cutoutModel,
        cutoutPrompt,
        apiKey: key,
        image: picked,
      });
      session.current = next;
      if (props.onSession && !props.onSession(next)) {
        next.close();
        session.current = null;
        accepted.current = true;
        dismiss();
        return;
      }
      const stop = next.subscribe((value) => {
        if (!current() || session.current !== next) return;
        setSnapshot(value);
        if (
          value.informationStatus === "success" &&
          value.result.information?.editorDraft
        )
          continueToEditor();
      });
      // subscribe immediately calls back, including an already-completed snapshot.
      if (accepted.current || session.current !== next) stop();
      else unsubscribe.current = stop;
      if (current())
        void next.start().catch((error) => {
          if (current()) setNotice(safeAiVisionError(error, [key]));
        });
    } catch (error) {
      if (current()) setNotice(safeAiVisionError(error, [key]));
    } finally {
      actionLock.current = false;
      if (current()) setSelecting(false);
    }
  }

  async function retryInformation() {
    const next = session.current;
    if (!next || actionLock.current || accepted.current || !alive.current)
      return;
    actionLock.current = true;
    try {
      const go = await Dialog.confirm({
        title: "重试信息解析？",
        message:
          "仅重新请求信息解析，可能再次计费；图片分支保留，不会重复生图。",
        confirmLabel: "重试信息",
        cancelLabel: "取消",
      });
      if (
        go &&
        alive.current &&
        !accepted.current &&
        session.current === next &&
        !next.getSnapshot().closed
      )
        await next.retry("information");
    } catch (error) {
      if (alive.current && !accepted.current)
        setNotice(safeAiVisionError(error));
    } finally {
      actionLock.current = false;
    }
  }

  function cancelWaiting() {
    if (!alive.current || accepted.current) return;
    if (session.current) session.current.cancel();
    else {
      revision.current++;
      setSelecting(false);
    }
    setNotice("已停止本地等待；取消不保证上游停止处理或计费。");
  }

  function abandon() {
    if (!alive.current || accepted.current) return;
    accepted.current = true;
    revision.current++;
    unsubscribe.current?.();
    unsubscribe.current = null;
    session.current?.close();
    session.current = null;
    dismiss();
  }
  const busy =
    selecting ||
    snapshot?.informationStatus === "running" ||
    snapshot?.informationStatus === "idle";
  const recoverable =
    snapshot?.informationStatus === "failed" ||
    snapshot?.informationStatus === "cancelled";
  return (
    <NavigationStack>
      <ZStack frame={{ maxWidth: "infinity", maxHeight: "infinity" }}>
        <List navigationTitle="AI 识图录入" {...nativeListPageProps("inline")}>
          <Section
            header={<NativeSectionHeader title="识图录入" />}
            footer={
              <NativeNoteRow text="按设置中的录入能力处理。信息成功后自动进入可编辑草稿；开启生图时图片继续等待，不阻塞填写。原订单图不会自动成为封面。" />
            }
          >
              <Button
                title={selecting ? "正在准备…" : "选图处理"}
                disabled={selecting || snapshot != null}
                action={() => void selectImage()}
              />
          </Section>
          <Section
            header={<NativeSectionHeader title="处理状态" />}
            footer={
              <NativeNoteRow text="信息失败可单独重试或手动填写。取消等待不保证上游停止处理或计费；当前页面不创建物品，保存由编辑器负责。" />
            }
          >
              {notice ? (
                <Text
                  font="footnote"
                  foregroundStyle="secondaryLabel"
                  textSelection={true}
                  padding={12}
                >
                  {notice}
                </Text>
              ) : null}
              <AiItemResultView
                result={snapshot?.result ?? null}
                busy={!!busy}
                previewBackground={background}
                onPreviewBackground={setBackground}
              />
              {recoverable ? (
                <Button
                  title="重试信息"
                  action={() => void retryInformation()}
                />
              ) : null}
              {recoverable ? (
                <Button
                  title={
                    snapshot?.result.cutout?.cutout
                      ? "使用已有物品图并手动填写"
                      : "手动填写并继续等图"
                  }
                  action={() => continueToEditor(true)}
                />
              ) : null}
              <Button title="放弃录入" action={abandon} />
          </Section>
        </List>
        {busy ? (
          <AiVisionHud
            phase={snapshot?.phase || "正在准备图片…"}
            onCancel={cancelWaiting}
            cancelTitle="取消等待"
          />
        ) : null}
      </ZStack>
    </NavigationStack>
  );
}
