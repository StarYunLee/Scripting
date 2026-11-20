import {
  Button,
  HStack,
  Image,
  List,
  Navigation,
  NavigationStack,
  Picker,
  Spacer,
  Text,
  TextField,
  Toggle,
  useEffect,
  useRef,
  useState,
} from "scripting";


import {
  AI_VISION_EXTRACT_DEFAULT_PROMPT,
  emptyAiVisionProfile,
  hasAiVisionApiKey,
  saveAiVisionCredentials,
  maskAiVisionApiKey,
  readAiVisionApiKey,
  readAiVisionProfile,
  refreshAiVisionModels,
  uniqueModelIds,
  writeAiVisionApiKey,
  writeAiVisionProfile,
  type AiVisionEndpointKind,
  type AiVisionProfile,
} from "../services/ai-vision";
import { safeAiVisionError } from "../services/ai-vision-diagnostics";
import {
  useAiVisionTasks,
  type AiVisionUiTask,
} from "../services/ai-vision-task-hook";
import {
  listAiCutoutModels,
  readAiCutoutModel,
  readAiCutoutPrompt,
  readAiCutoutRequestFormat,
  saveAiCutoutRequestFormat,
  type AiCutoutRequestFormat,
  saveAiCutoutModel,
  saveAiCutoutPrompt,
} from "../services/ai-cutout-config";
import { AI_CUTOUT_DEFAULT_PROMPT } from "../services/ai-cutout";
import {
  AiCutoutSettingsSection,
  AiCutoutRequestFormatRow,
} from "../ui/ai-cutout-settings-section";
import { AiItemWorkbench } from "../ui/ai-item-workbench";
import { AiVisionPromptEditorPage } from "./AiVisionConfigurationPanels";
import {
  readAiEntryPolicy,
  writeAiEntryPolicy,
  type AiEntrySwitches,
} from "../services/ai-entry-policy";
import { NativeSectionHeader, NativeNoteRow } from "../ui/native-list";
import { appListProps, AppSection } from "../ui/theme-props";
import { useSettingsTheme } from "../ui/theme";

function formatFetchedAt(value: number | null): string {
  if (!value) return "尚未刷新";
  try {
    const d = new Date(value);
    const hours = String(d.getHours()).padStart(2, "0");
    const minutes = String(d.getMinutes()).padStart(2, "0");
    return `${d.getMonth() + 1}/${d.getDate()} ${hours}:${minutes}`;
  } catch {
    return "尚未刷新";
  }
}

export function AiVisionSettingsPage() {
  const uiTheme = useSettingsTheme();
  const [profile, setProfile] = useState<AiVisionProfile>(
    emptyAiVisionProfile(),
  );
  const [baseURLDraft, setBaseURLDraft] = useState("");
  const [modelDraft, setModelDraft] = useState("");
  const [entrySwitches, setEntrySwitches] = useState<AiEntrySwitches>({
    informationEnabled: false,
    cutoutEnabled: false,
  });
  const [endpointDraft, setEndpointDraft] =
    useState<AiVisionEndpointKind>("chat_completions");
  const baseURLInput = useRef("");
  const [keySaved, setKeySaved] = useState(false);
  const [savedKeyMask, setSavedKeyMask] = useState("");
  const [promptDraft, setPromptDraft] = useState("");
  const [cutoutPromptDraft, setCutoutPromptDraft] = useState("");
  const panelOpen = useRef(false);
  const alive = useRef(true);
  const panelRevision = useRef(0);
  const [busy, setBusy] = useState<
    "save" | "models" | "extract" | "cutout" | null
  >(null);

  const [cutoutModel, setCutoutModel] = useState("");
  const [cutoutFormat, setCutoutFormat] = useState<AiCutoutRequestFormat>(
    () => readAiCutoutRequestFormat(),
  );
  const tasks = useAiVisionTasks();

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      panelRevision.current++;
    };
  }, []);

  useEffect(() => {
    try {
      const next = readAiVisionProfile();
      setProfile(next);
      setCutoutModel(next.baseURL ? readAiCutoutModel(next.baseURL) : "");
      baseURLInput.current = next.baseURL;
      setBaseURLDraft(next.baseURL);
      setModelDraft(next.model);
      setEntrySwitches(readAiEntryPolicy());
      setEndpointDraft(next.endpointKind);
      if (next.reasoningEffort !== "low") {
        setProfile(writeAiVisionProfile({ reasoningEffort: "low" }));
      }
      setPromptDraft(
        next.customPrompt.trim()
          ? next.customPrompt
          : AI_VISION_EXTRACT_DEFAULT_PROMPT,
      );
      setCutoutPromptDraft(readAiCutoutPrompt() || AI_CUTOUT_DEFAULT_PROMPT);
      const hasKey = hasAiVisionApiKey();
      setKeySaved(hasKey);
      setSavedKeyMask(hasKey ? maskAiVisionApiKey(readAiVisionApiKey()) : "");
    } catch (error) {
      void Dialog.alert({
        title: "配置暂不可用",
        message: safeAiVisionError(error),
      });
    }
  }, []);

  const credentialsDirty = baseURLDraft.trim() !== profile.baseURL;

  async function run(
    kind: "save" | "models" | "extract",
    work: (task: AiVisionUiTask) => Promise<void>,
  ) {
    const task = tasks.begin();
    if (!task) return;
    setBusy(kind);
    try {
      await work(task);
    } catch (error) {
      if (!tasks.current(task)) return;
      await Dialog.alert({
        title:
          kind === "save"
            ? "未能保存接口"
            : kind === "models"
              ? "未能刷新模型"
              : "识图验证未完成",
        message: safeAiVisionError(error),
      });
    } finally {
      if (tasks.finish(task)) setBusy(null);
    }
  }

  function syncServiceProfile(next: AiVisionProfile) {
    setProfile(next);
    baseURLInput.current = next.baseURL;
    setBaseURLDraft(next.baseURL);
    setModelDraft(next.model);
    setEntrySwitches(readAiEntryPolicy());
    setEndpointDraft(next.endpointKind);
    setCutoutModel(next.baseURL ? readAiCutoutModel(next.baseURL) : "");
    const hasKey = hasAiVisionApiKey();
    setKeySaved(hasKey);
    setSavedKeyMask(hasKey ? maskAiVisionApiKey(readAiVisionApiKey()) : "");
  }

  function handleBaseURLChanged(value: string) {
    // Typing is local; submit/blur is the only configuration migration boundary.
    baseURLInput.current = value;
    setBaseURLDraft(value);
  }

  function commitBaseURL(): boolean {
    if (tasks.busy() || !alive.current) return false;
    try {
      const input = baseURLInput.current.trim();
      if (input === readAiVisionProfile().baseURL) return true;
      syncServiceProfile(saveAiVisionCredentials(input, "", false));
      return true;
    } catch (error) {
      void Dialog.alert({
        title: "接口地址未能保存",
        message: safeAiVisionError(error),
      });
      return false;
    }
  }

  const informationModels = uniqueModelIds([modelDraft, ...profile.models]);
  const cutoutModels = listAiCutoutModels(profile.models, cutoutModel);
  const canRefreshModels = !credentialsDirty && !!profile.baseURL && keySaved;

  async function handleRefreshModels() {
    if (!canRefreshModels) return;
    await run("models", async (task) => {
      const key = readAiVisionApiKey() ?? "";
      const next = await refreshAiVisionModels({
        baseURL: profile.baseURL,
        apiKey: key,
        signal: task.signal,
        isCurrent: () => tasks.current(task),
      });
      if (!tasks.current(task) || !alive.current) return;
      setProfile(next);
      setCutoutModel(next.baseURL ? readAiCutoutModel(next.baseURL) : "");
    });
  }

  function persistRecognitionPatch(
    patch: Partial<AiVisionProfile>,
    title: string,
  ) {
    if (tasks.busy()) return;
    if (credentialsDirty) {
      void Dialog.alert({ title, message: "请先保存接口地址与密钥" });
      return;
    }
    try {
      const nextProfile = writeAiVisionProfile(patch);
      setProfile(nextProfile);
      if (patch.model !== undefined) setModelDraft(nextProfile.model);
      if (patch.endpointKind !== undefined)
        setEndpointDraft(nextProfile.endpointKind);
    } catch (error) {
      void Dialog.alert({ title, message: safeAiVisionError(error) });
    }
  }

  function persistEntrySwitches(patch: Partial<AiEntrySwitches>) {
    if (tasks.busy() || !alive.current) return;
    try {
      setEntrySwitches(writeAiEntryPolicy(patch));
    } catch (error) {
      void Dialog.alert({
        title: "录入开关未能保存",
        message: safeAiVisionError(error),
      });
    }
  }

  function handleInformationModelChanged(value: string) {
    if (!value || tasks.busy()) return;
    persistRecognitionPatch({ model: value.trim() }, "信息模型未能保存");
  }

  function handleCutoutModelChanged(value: string) {
    if (
      !value ||
      tasks.busy() ||
      credentialsDirty ||
      !profile.baseURL ||
      !keySaved
    )
      return;
    try {
      setCutoutModel(saveAiCutoutModel(profile.baseURL, value));
    } catch (error) {
      void Dialog.alert({
        title: "图像模型未能保存",
        message: safeAiVisionError(error),
      });
    }
  }

  function handleCutoutFormatChanged(value: AiCutoutRequestFormat) {
    if (tasks.busy()) return;
    try {
      setCutoutFormat(saveAiCutoutRequestFormat(value));
    } catch (error) {
      void Dialog.alert({
        title: "请求格式未能保存",
        message: safeAiVisionError(error),
      });
    }
  }

  async function openPromptEditor(kind: "information" | "cutout") {
    if (tasks.busy() || panelOpen.current) return;
    panelOpen.current = true;
    const revision = ++panelRevision.current;
    try {
      const value = await Navigation.present<string | null>({
        element: (
          <AiVisionPromptEditorPage
            value={kind === "cutout" ? cutoutPromptDraft : promptDraft}
            defaultValue={
              kind === "cutout"
                ? AI_CUTOUT_DEFAULT_PROMPT
                : AI_VISION_EXTRACT_DEFAULT_PROMPT
            }
            title={kind === "cutout" ? "生成提示词" : "解析提示词"}
          />
        ),
        modalPresentationStyle: "pageSheet",
      });
      if (
        !alive.current ||
        revision !== panelRevision.current ||
        typeof value !== "string"
      )
        return;
      if (kind === "cutout") {
        const saved = saveAiCutoutPrompt(
          value.trim() === AI_CUTOUT_DEFAULT_PROMPT.trim() ? "" : value.trim(),
        );
        setCutoutPromptDraft(saved || AI_CUTOUT_DEFAULT_PROMPT);
        return;
      }
      const customPrompt =
        value.trim() === AI_VISION_EXTRACT_DEFAULT_PROMPT.trim()
          ? ""
          : value.trim();
      const next = writeAiVisionProfile({ customPrompt });
      setProfile(next);
      setPromptDraft(next.customPrompt || AI_VISION_EXTRACT_DEFAULT_PROMPT);
    } catch (error) {
      if (alive.current && revision === panelRevision.current) {
        await Dialog.alert({
          title: "配置面板暂不可用",
          message: safeAiVisionError(error),
        });
      }
    } finally {
      panelOpen.current = false;
    }
  }

  async function handleEditApiKey() {
    if (tasks.busy() || panelOpen.current || !commitBaseURL()) return;
    panelOpen.current = true;
    const revision = ++panelRevision.current;
    const root = readAiVisionProfile().baseURL;
    try {
      const raw = await Dialog.prompt({
        title: keySaved ? "更换 API Key" : "设置 API Key",
        message: keySaved
          ? "输入新密钥后保存替换，或清空保存以删除。"
          : "请输入与当前接口地址匹配的 API Key：",
        defaultValue: "",
        obscureText: true,
        confirmLabel: "保存",
        cancelLabel: "取消",
      });
      if (
        !alive.current ||
        revision !== panelRevision.current ||
        raw == null ||
        readAiVisionProfile().baseURL !== root
      )
        return;
      await run("save", async () => {
        writeAiVisionApiKey(raw.trim());
        syncServiceProfile(readAiVisionProfile());
      });
    } catch (error) {
      if (alive.current && revision === panelRevision.current) {
        await Dialog.alert({
          title: "密钥未能保存",
          message: safeAiVisionError(error),
        });
      }
    } finally {
      panelOpen.current = false;
    }
  }

  async function handleClearService() {
    if (tasks.busy()) return;
    const confirmed = await Dialog.confirm({
      title: "清除服务配置？",
      message: "将清空接口地址、绑定的 API Key 及已同步的模型缓存。",
      confirmLabel: "清除",
      cancelLabel: "取消",
    });
    if (!confirmed || !alive.current) return;
    await run("save", async () => {
      if (readAiVisionProfile().baseURL) writeAiVisionApiKey("");
      const nextProfile = writeAiVisionProfile({
        baseURL: "",
        model: "",
        models: [],
        modelsFetchedAt: null,
      });
      syncServiceProfile(nextProfile);
    });
  }

  return (
      <List {...appListProps(uiTheme, "inline")}>
        {/* 共享接口与端点；关闭录入能力不清除任何服务配置。 */}
        <AppSection theme={uiTheme}

          disabled={busy !== null}
          header={
            <HStack spacing={10} frame={{ maxWidth: "infinity" }}>
              <Text font="headline" fontWeight="semibold" foregroundStyle="secondaryLabel">AI 服务</Text>
              <Spacer />
              {profile.baseURL || keySaved ? (
                <Button
                  buttonStyle="plain"
                  disabled={busy !== null}
                  action={() => void handleClearService()}
                >
                  <Text foregroundStyle="systemRed">清除配置</Text>
                </Button>
              ) : null}
            </HStack>
          }
          footer={
            <NativeNoteRow text="密钥通过钥匙串安全存储，不随数据数据导出备份。" />
          }
        >
            <HStack spacing={10} frame={{ maxWidth: "infinity" }} alignment="center">
              <Image
                systemName="network"
                font={17}
                foregroundStyle="accentColor"
                frame={{ width: 24 }}
              />
              <Text>接口地址</Text>
              <TextField
                title=" "
                value={baseURLDraft}
                onChanged={handleBaseURLChanged}
                onSubmit={() => {
                  if (commitBaseURL()) Keyboard.hide();
                }}
                onBlur={() => {
                  commitBaseURL();
                }}
                submitLabel="done"
                prompt="https://api.example.com/v1"
                keyboardType="URL"
                axis="horizontal"
                multilineTextAlignment="trailing"
                frame={{ maxWidth: "infinity" }}
              />
            </HStack>
            <HStack spacing={10} frame={{ maxWidth: "infinity" }} alignment="center">
              <Image
                systemName="key.fill"
                font={17}
                foregroundStyle="#FF9500"
                frame={{ width: 24 }}
              />
              <Text>API Key</Text>
              <Spacer />
              <Text
                foregroundStyle={keySaved ? "secondaryLabel" : "tertiaryLabel"}
                lineLimit={1}
              >
                {keySaved ? savedKeyMask : "尚未设置"}
              </Text>
              <Button
                title={keySaved ? "更换" : "设置"}
                buttonStyle="borderless"
                disabled={busy !== null}
                action={() => void handleEditApiKey()}
              />
            </HStack>
            {/* API 端点移至 API Key 下面 */}
            <HStack
              spacing={10}
              alignment="center"
            >
              <Image
                systemName="point.3.connected.trianglepath.dotted"
                font={17}
                foregroundStyle="accentColor"
                frame={{ width: 24, alignment: "center" }}
              />
              <Picker
                title="API 端点"
                value={endpointDraft}
                onChanged={(val: string) =>
                  persistRecognitionPatch(
                    {
                      endpointKind:
                        val === "responses" ? "responses" : "chat_completions",
                    },
                    "端点未能保存",
                  )
                }
                pickerStyle="menu"
                frame={{ maxWidth: "infinity" }}
              >
                <Text tag="chat_completions">/v1/chat/completions</Text>
                <Text tag="responses">/v1/responses</Text>
              </Picker>
            </HStack>
            <Button
              buttonStyle="plain"
              disabled={busy !== null || !canRefreshModels}
              action={() => void handleRefreshModels()}
            >
              <HStack
                spacing={10}
                contentShape="rect"
              >
                <Image
                  systemName="arrow.triangle.2.circlepath"
                  font={17}
                  foregroundStyle={
                    busy !== null || !canRefreshModels
                      ? "secondaryLabel"
                      : "accentColor"
                  }
                  frame={{ width: 24, alignment: "center" }}
                />
                <Text
                  foregroundStyle={
                    busy !== null || !canRefreshModels
                      ? "secondaryLabel"
                      : "label"
                  }
                >
                  刷新模型列表
                </Text>
                <Spacer />
                <Text font="subheadline" foregroundStyle="secondaryLabel">
                  {busy === "models"
                    ? "刷新中…"
                    : profile.models.length > 0
                      ? `共 ${profile.models.length} 个 · ${formatFetchedAt(profile.modelsFetchedAt)}`
                      : formatFetchedAt(profile.modelsFetchedAt)}
                </Text>
              </HStack>
            </Button>
        </AppSection>

        <AppSection theme={uiTheme}

          disabled={busy !== null}
          header={<NativeSectionHeader title="物品信息解析" />}
          footer={
            <NativeNoteRow text="从订单截图中提取物品名称、金额和购入日期等信息。" />
          }
        >
                          <HStack
                spacing={10}
              >
                <Image
                  systemName="text.badge.checkmark"
                  font={17}
                  foregroundStyle="accentColor"
                  frame={{ width: 24 }}
                />
                <Toggle
                  title="解析物品信息"
                  value={entrySwitches.informationEnabled}
                  onChanged={(value) =>
                    persistEntrySwitches({ informationEnabled: value })
                  }
                  frame={{ maxWidth: "infinity" }}
                />
              </HStack>
              <HStack
                spacing={10}
              >
                <Image
                  systemName="text.viewfinder"
                  font={17}
                  foregroundStyle="accentColor"
                  frame={{ width: 24 }}
                />
                <Text lineLimit={1}>解析模型</Text>
                <Picker
                  title="解析模型"
                  labelsHidden
                  value={modelDraft}
                  onChanged={handleInformationModelChanged}
                  pickerStyle="menu"
                  frame={{ maxWidth: "infinity", alignment: "trailing" }}
                >
                  {modelDraft ? null : <Text tag="">未选择</Text>}
                  {informationModels.map((id) => (
                    <Text key={id} tag={id}>
                      {id}
                    </Text>
                  ))}
                </Picker>
              </HStack>
              <Button
                buttonStyle="plain"
                action={() => void openPromptEditor("information")}
              >
                <HStack
                  spacing={10}
                  contentShape="rect"
                >
                  <Image
                    systemName="doc.text"
                    font={17}
                    foregroundStyle="accentColor"
                    frame={{ width: 24 }}
                  />
                  <Text>解析提示词</Text>
                  <Spacer />
                  <Text font="subheadline" foregroundStyle="secondaryLabel">
                    {promptDraft.trim() ===
                    AI_VISION_EXTRACT_DEFAULT_PROMPT.trim()
                      ? "默认"
                      : "自定义"}
                  </Text>
                  <Image
                    systemName="chevron.right"
                    font={12}
                    foregroundStyle="tertiaryLabel"
                  />
                </HStack>
              </Button>
        </AppSection>

        <AppSection theme={uiTheme}

          disabled={busy !== null}
          header={<NativeSectionHeader title="物品图生成" />}
          footer={
            <NativeNoteRow
              text={
                entrySwitches.informationEnabled
                  ? "根据订单截图中的商品图生成透明物品图，可能产生额外费用。"
                  : "需先开启物品信息解析。生成图片可能产生额外费用。"
              }
            />
          }
        >
                          <HStack
                spacing={10}
              >
                <Image
                  systemName="photo"
                  font={17}
                  foregroundStyle="#AF52DE"
                  frame={{ width: 24 }}
                />
                <Toggle
                  title="生成透明物品图"
                  value={entrySwitches.cutoutEnabled}
                  disabled={!entrySwitches.informationEnabled}
                  onChanged={(value) =>
                    persistEntrySwitches({ cutoutEnabled: value })
                  }
                  frame={{ maxWidth: "infinity" }}
                />
              </HStack>
              <AiCutoutSettingsSection
                model={cutoutModel}
                models={cutoutModels}
                disabled={
                  busy !== null ||
                  credentialsDirty ||
                  !profile.baseURL ||
                  !keySaved
                }
                onChanged={handleCutoutModelChanged}
              />
              <AiCutoutRequestFormatRow
                value={cutoutFormat}
                disabled={busy !== null}
                onChanged={handleCutoutFormatChanged}
              />
              <Button
                buttonStyle="plain"
                action={() => void openPromptEditor("cutout")}
              >
                <HStack
                  spacing={10}
                  contentShape="rect"
                >
                  <Image
                    systemName="paintbrush.pointed"
                    font={17}
                    foregroundStyle="#AF52DE"
                    frame={{ width: 24 }}
                  />
                  <Text>生成提示词</Text>
                  <Spacer />
                  <Text font="subheadline" foregroundStyle="secondaryLabel">
                    {cutoutPromptDraft.trim() ===
                    AI_CUTOUT_DEFAULT_PROMPT.trim()
                      ? "默认"
                      : "自定义"}
                  </Text>
                  <Image
                    systemName="chevron.right"
                    font={12}
                    foregroundStyle="tertiaryLabel"
                  />
                </HStack>
              </Button>
        </AppSection>
        <AppSection theme={uiTheme}

          header={<NativeSectionHeader title="效果测试" />}
        >
            <AiItemWorkbench
              informationEnabled={entrySwitches.informationEnabled}
              cutoutEnabled={entrySwitches.cutoutEnabled}
              profile={profile}
              cutoutModel={cutoutModel}
              keySaved={keySaved}
              credentialsDirty={credentialsDirty}
              recognitionDirty={false}
              busy={busy !== null}
              tasks={tasks}
            />
        </AppSection>
      </List>

  );
}

/** Standalone recovery modal; normal settings navigation still uses the page directly. */
export function AiVisionSettingsModal() {
  return (
    <NavigationStack>
      <AiVisionSettingsPage />
    </NavigationStack>
  );
}
