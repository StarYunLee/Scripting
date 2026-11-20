import { emptyCutoutMetrics } from "../services/ai-cutout";
import {
  Button,
  HStack,
  Divider,
  Image,
  Picker,
  ProgressView,
  Spacer,
  ScrollView,
  NavigationStack,
  Text,
  VStack,
  useEffect,
  useRef,
  useState,
} from "scripting";
import {
  runAiItemWorkflow,
  type AiItemMode,
  type AiItemWorkflowResult,
} from "../services/ai-item-workflow";
import type { AiVisionProfile } from "../services/ai-vision";
import { readAiVisionApiKey } from "../services/ai-vision";
import type { useAiVisionTasks } from "../services/ai-vision-task-hook";
import { safeAiVisionError } from "../services/ai-vision-diagnostics";
import { pickCoverImage } from "../services/covers";
import { AiItemResultView } from "./ai-item-result";


import { NativeNoteRow } from "./native-list";
/** Settings-only workbench: shared workflow, same selected image, no business writes. */
export function AiItemWorkbench(props: {
  informationEnabled: boolean;
  cutoutEnabled: boolean;
  profile: AiVisionProfile;
  cutoutModel: string;
  keySaved: boolean;
  credentialsDirty: boolean;
  recognitionDirty: boolean;
  busy: boolean;
  tasks: ReturnType<typeof useAiVisionTasks>;
  onBusy?(value: "extract" | "cutout" | null): void;
}) {
  const [mode, setMode] = useState<AiItemMode>("information");
  const [result, setResult] = useState<AiItemWorkflowResult | null>(null);
  const [background, setBackground] = useState("light");
  const [selectedImage, setSelectedImage] = useState<UIImage | null>(null);
  const [picking, setPicking] = useState(false);
  const pickerLock = useRef(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [tab, setTab] = useState<"information" | "cutout">("information");
  const [working, setWorking] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const ownsTask = useRef(false);
  const alive = useRef(true);
  const revision = useRef(0);
  const tasks = props.tasks;
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      ++revision.current;
    };
  }, []);
  useEffect(() => {
    ++revision.current;
    if (ownsTask.current) {
      tasks.cancel();
      ownsTask.current = false;
      props.onBusy?.(null);
    }
    setWorking(false);
    setPhase(null);
    setResult(null);
    setSheetOpen(false);
    setNotice(null);
  }, [props.profile, props.cutoutModel]);

  async function chooseImage() {
    if (pickerLock.current || tasks.busy() || props.busy) return;
    pickerLock.current = true;
    setPicking(true);
    try {
      const image = await pickCoverImage();
      if (image && alive.current) {
        setSelectedImage(image);
        setResult(null);
        setNotice(null);
      }
    } catch (error) {
      if (alive.current) await Dialog.alert({ title: "无法选择截图", message: safeAiVisionError(error) });
    } finally {
      pickerLock.current = false;
      if (alive.current) setPicking(false);
    }
  }

  async function testImage(selectedMode: AiItemMode) {
    const image = selectedImage;
    if (!image || pickerLock.current || props.busy || !alive.current || tasks.busy()) return;
    if (
      props.credentialsDirty ||
      (selectedMode !== "cutout" && props.recognitionDirty)
    ) {
      await Dialog.alert({
        title: "配置未保存",
        message:
          selectedMode === "cutout"
            ? "请先保存上方接口地址与密钥"
            : "请先保存连接配置与识图配置后再识图",
      });
      return;
    }
    const snapshot = { ...props.profile };
    const cutoutModel = props.cutoutModel;
    let apiKey = "";
    try {
      apiKey = readAiVisionApiKey() ?? "";
    } catch (error) {
      await Dialog.alert({
        title: "密钥暂不可用",
        message: safeAiVisionError(error),
      });
      return;
    }
    if (
      !snapshot.baseURL ||
      !apiKey ||
      (selectedMode !== "cutout" && !snapshot.model) ||
      (selectedMode !== "information" && !cutoutModel)
    ) {
      await Dialog.alert({
        title: "配置不完整",
        message: "请保存共享接口与密钥，并选择当前模式所需的模型",
      });
      return;
    }
    // Lock before starting the selected model requests.
    const task = tasks.begin();
    if (!task) return;
    ownsTask.current = true;
    setNotice(null);
    const taskRevision = ++revision.current;
    const current = () =>
      alive.current && taskRevision === revision.current && tasks.current(task);
    let initialTabChosen = false;
    setMode(selectedMode);

    try {
      setTab(selectedMode === "cutout" ? "cutout" : "information");
      setSheetOpen(true);
      setResult(null);
      setBackground("light");
      props.onBusy?.(selectedMode === "cutout" ? "cutout" : "extract");
      setWorking(true);
      setPhase("正在准备图片…");
      const next = await runAiItemWorkflow({
        mode: selectedMode,
        profile: snapshot,
        cutoutModel,
        apiKey,
        image,
        signal: task.signal,
        isCurrent: current,
        onUpdate: (update) => {
          if (!current()) return;
          if (selectedMode === "combined" && !initialTabChosen) {
            if (update.information || update.informationError || update.cutout) {
              setTab(update.information || update.informationError ? "information" : "cutout");
              initialTabChosen = true;
            }
          }
          setResult(update);
        },
        onInformationPhase: (value) => {
          if (current())
            setPhase(
              value === "preparing" ? "正在准备信息图片…" : "正在解析物品信息…",
            );
        },
        onCutoutPhase: (value) => {
          if (current())
            setPhase(
              value === "decoding"
                ? "正在检查透明图片…"
                : value === "preparing"
                  ? "正在准备物品图…"
                  : "正在等待物品图…",
            );
        },
      });
      if (current()) setResult(next);
    } catch (error) {
      if (!current()) return;
      // The workflow normally returns branch failures. Keep diagnostics available for early failures too.
      const message = safeAiVisionError(error, [apiKey]);
      setResult({
        mode: selectedMode,
        information: null,
        cutout:
          selectedMode === "cutout"
            ? {
                cutout: null,
                error: message,
                totalMs: 0,
                httpStatus: null,
                attempts: 0,
                track: null,
                metrics: emptyCutoutMetrics(),
              }
            : null,
        informationError: selectedMode === "cutout" ? null : message,
        totalMs: 0,
        complete: true,
      });
    } finally {
      if (
        tasks.finish(task) &&
        alive.current &&
        taskRevision === revision.current
      ) {
        ownsTask.current = false;
        props.onBusy?.(null);
        setWorking(false);
        setPhase(null);
      }
    }
  }
  function cancel() {
    tasks.cancel();
    ++revision.current;
    props.onBusy?.(null);
    setWorking(false);
    setPhase(null);
    ownsTask.current = false;
    setNotice("已停止等待；取消不代表上游已停止执行或计费。");
    // Preserve complete: cancellation cannot claim that upstream branches settled.
    setResult((previous) => (previous ? { ...previous, stopped: true } : null));
  }
  const infoReturned = Boolean(result?.information || result?.informationError);
  const imageReturned = Boolean(result?.cutout);
  const showTabs = mode === "combined" && (infoReturned || imageReturned);
  const bothPending = mode === "combined" && !showTabs;
  const waiting = working && !result?.complete && (tab === "information" ? !infoReturned : !imageReturned);
  const waitingText = bothPending ? "正在解析信息并生成物品图…"
    : tab === "cutout" ? (phase === "正在检查透明图片…" ? phase : "正在生成物品图…")
      : "正在解析物品信息…";
  const disabled =
    props.busy ||
    working ||
    props.credentialsDirty ||
    (mode !== "cutout" && props.recognitionDirty);
  const hasResult = Boolean(result || notice);
  const feeNote = hasResult
    ? "重新测试将再次调用模型，可能产生费用。"
    : "开始后将调用所选模型，可能产生费用。";
  const entryHint = !props.informationEnabled
    ? "录入功能已关闭，仍可在这里测试。"
    : mode !== "information" && !props.cutoutEnabled
      ? "录入时的物品图生成已关闭，仍可在这里测试。"
      : "";
  return (
    <VStack alignment="leading" spacing={10} frame={{ maxWidth: "infinity" }} sheet={{
      isPresented: sheetOpen,
      onChanged: setSheetOpen,
      content: (
        <NavigationStack presentationDragIndicator="visible" presentationDetents={["medium", "large"]}>
          <VStack spacing={0} navigationTitle="测试结果" navigationBarTitleDisplayMode="inline" toolbar={{
            confirmationAction: <Button title="收起" action={() => setSheetOpen(false)} />,
            topBarLeading: working ? <Button title="停止等待" action={cancel} /> : undefined,
          }}>
            {showTabs ? (
              <Picker title="结果内容" pickerStyle="segmented" value={tab}
                padding={{ horizontal: 20, top: 8 }}
                onChanged={(value: string) => setTab(value === "cutout" ? "cutout" : "information")}>
                <Text tag="information">{working && !infoReturned ? "物品信息 · 解析中" : "物品信息"}</Text>
                <Text tag="cutout">{working && !imageReturned ? "物品图 · 生成中" : "物品图"}</Text>
              </Picker>
            ) : null}
            {waiting ? (
              <VStack spacing={10} alignment="center" frame={{ maxWidth: "infinity", maxHeight: "infinity", alignment: "center" }}>
                <ProgressView progressViewStyle="circular" />
                <Text font="body">{waitingText}</Text>
                {(bothPending || tab === "cutout") ? <Text font="footnote" foregroundStyle="secondaryLabel">收起后可在设置页查看进度</Text> : null}
              </VStack>
            ) : (
              <ScrollView>
                <VStack spacing={12} padding={{ horizontal: 20, vertical: 12 }} alignment="leading" frame={{ maxWidth: "infinity", alignment: "leading" }}>
                  {result || notice ? <AiItemResultView testPreview resultTab={tab} result={result} busy={working}
                    notice={notice} previewBackground={background} onPreviewBackground={setBackground} /> : null}
                </VStack>
              </ScrollView>
            )}
          </VStack>
        </NavigationStack>
      ),
    }}>
      <Picker
        title="测试模式"
        pickerStyle="segmented"
        value={mode}
        onChanged={(value: string) => {
          if (
            !tasks.busy() &&
            (value === "combined" ||
              value === "information" ||
              value === "cutout")
          ) {
            setMode(value);
            setResult(null);
            setNotice(null);
          }
        }}
        disabled={props.busy || working}
        padding={{ top: 4 }}
      >
        <Text tag="combined">信息与物品图</Text>
        <Text tag="information">仅信息</Text>
        <Text tag="cutout">仅物品图</Text>
      </Picker>
      <Button buttonStyle="plain" disabled={picking || working || props.busy} action={() => void chooseImage()}>
        <HStack spacing={12} frame={{ minHeight: 44, maxWidth: "infinity" }} contentShape="rect">
          {selectedImage ? <Image image={selectedImage} resizable scaleToFill frame={{ width: 34, height: 38 }} clipShape={{ type: "rect", cornerRadius: 5 }} />
            : <Image systemName="photo" frame={{ width: 34 }} foregroundStyle="secondaryLabel" />}
          <Text>{selectedImage ? "更换截图" : "选择截图"}</Text><Spacer />
        </HStack>
      </Button>
      <Divider />
      <VStack alignment="leading" spacing={8} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={10} frame={{ maxWidth: "infinity" }}>
          {working ? (
            <Button buttonStyle="borderedProminent" action={() => setSheetOpen(true)}>
              <Text frame={{ maxWidth: "infinity", minHeight: 30 }}>查看测试进度</Text>
            </Button>
          ) : (
            <Button buttonStyle={hasResult ? "bordered" : "borderedProminent"}
              disabled={disabled || picking || !selectedImage || !props.keySaved}
              action={() => void testImage(mode)}>
              <HStack frame={{ maxWidth: "infinity", minHeight: 30 }}>
                <Text>{hasResult ? "重新测试" : "开始测试"}</Text>
              </HStack>
            </Button>
          )}
          {!working && hasResult ? (
            <Button buttonStyle="borderedProminent" action={() => setSheetOpen(true)}>
              <Text frame={{ maxWidth: "infinity", minHeight: 30 }}>查看测试结果</Text>
            </Button>
          ) : null}
        </HStack>
        {!working ? <NativeNoteRow text={entryHint ? `${feeNote}${entryHint}` : feeNote} /> : null}
      </VStack>
    </VStack>
  );
}
