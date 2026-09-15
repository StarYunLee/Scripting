import {
  Button,
  HStack,
  Image,
  List,
  NavigationStack,
  Rectangle,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  useRef,
  useEffect,
  useState,
} from "scripting";
import { providerMeta, type AuthSheet } from "../models";
import {
  clipboardPasteError,
  isPasteCallbackProvider,
  looksLikeAuthorizationInput,
} from "../services/auth-callback-input";
import { isAuthorizationPasteCandidate } from "../services/auth-paste-edit";
import { openAuthorizationPage } from "../services/browser";
import { PageBackground } from "./PageBackground";
import { ProviderLogo } from "./ProviderLogo";
import {
  GlassDivider,
  GlassGroup,
  GlassNoteRow,
  glassRowBackground,
} from "./GlassList";
import type { BackgroundThemeId } from "../services/settings";

const WAITING_LOGO_SLOT = 46;
const WAITING_LOGO_SIZE = 40;
const AUTH_HERO_LOGO_SIZE = 52;

function isOAuthCallbackPasteProvider(
  provider: AuthSheet["provider"],
): boolean {
  return (
    provider === "codex" ||
    provider === "grok" ||
    provider === "claude" ||
    provider === "antigravity"
  );
}

function isSingleCheckProvider(provider: AuthSheet["provider"]): boolean {
  return provider === "cursor" || provider === "kimi";
}

function singleCheckInstruction(provider: AuthSheet["provider"]): string {
  return provider === "kimi"
    ? "完成 Kimi Code 设备授权后，返回应用即可自动连接。"
    : "完成 Cursor 网页登录后，返回应用即可自动连接。";
}

function isConsoleSecretProvider(provider: AuthSheet["provider"]): boolean {
  return provider === "zai" || provider === "minimax";
}

function consoleSecretTitle(provider: AuthSheet["provider"]): string {
  return provider === "zai" ? "API Key" : "Subscription Key";
}

function consoleRegionLabel(
  provider: AuthSheet["provider"],
  region: "intl" | "cn" | undefined,
): string {
  if (provider === "zai")
    return region === "cn" ? "国内站 · 智谱开放平台" : "国际站 · Z.ai";
  return region === "cn" ? "国内站 · minimaxi.com" : "国际站 · minimax.io";
}

function consoleSecretInstruction(provider: AuthSheet["provider"]): string {
  return provider === "zai"
    ? "从所选控制台复制 API Key，粘贴后将自动验证账户。"
    : "从所选站点复制 Subscription Key，粘贴后将自动验证账户。";
}

function callbackInputTitle(provider: AuthSheet["provider"]): string {
  if (provider === "grok") return "回调地址或一次性授权码";
  if (provider === "claude") return "授权码";
  return "回调地址";
}

function callbackInstruction(provider: AuthSheet["provider"]): string {
  if (provider === "codex")
    return "完成 ChatGPT 授权后，粘贴浏览器地址栏中的完整回调地址。";
  if (provider === "grok")
    return "完成 xAI 授权后，粘贴回调地址或页面显示的一次性授权码。";
  if (provider === "claude")
    return "完成 Anthropic 授权后，粘贴页面显示的完整授权码。";
  return "完成 Google 授权后，粘贴浏览器地址栏中的完整回调地址。";
}

export function AuthSheetView(props: {
  authSheet: AuthSheet;
  backgroundTheme: BackgroundThemeId;
  completing?: boolean;
  onChangeInput: (value: string) => void;
  onSubmit: (authorizationInput?: string) => void;
  onCancel: () => void;
  onRestart: () => void;
}) {
  const meta = providerMeta(props.authSheet.provider);
  const pasteCallback = isPasteCallbackProvider(props.authSheet.provider);
  const callbackPaste = isOAuthCallbackPasteProvider(props.authSheet.provider);
  const failed = props.authSheet.status.startsWith("授权失败：");
  const openFailed = props.authSheet.status.startsWith("无法打开授权页：");
  const callbackCompleting = callbackPaste && Boolean(props.completing);
  const callbackEntry =
    callbackPaste && !failed && !openFailed && !callbackCompleting;
  const deferred = props.authSheet.status.startsWith("授权待继续：");
  const singleCheck = isSingleCheckProvider(props.authSheet.provider);
  const singleCheckCompleting = singleCheck && Boolean(props.completing);
  const copilot = props.authSheet.provider === "copilot";
  const copilotCompleting = copilot && Boolean(props.completing);
  const consoleSecret = isConsoleSecretProvider(props.authSheet.provider);
  const consoleCompleting = consoleSecret && Boolean(props.completing);
  const inputRejected = props.authSheet.status.startsWith("授权输入有误：");
  const [deviceCodeCopied, setDeviceCodeCopied] = useState(false);
  const [copilotOpenError, setCopilotOpenError] = useState<string | null>(null);
  const [consolePageRecovered, setConsolePageRecovered] = useState(false);
  const focusedAuth = callbackPaste || singleCheck || copilot || consoleSecret;
  const waiting = props.authSheet.autoComplete
    ? Boolean(props.completing) || failed || deferred
    : pasteCallback && Boolean(props.completing);
  const failureDetail = failed
    ? props.authSheet.status.replace(/^授权失败：/, "")
    : "";
  const callbackMessage = callbackInstruction(props.authSheet.provider);
  const callbackHeroTitle = callbackCompleting
    ? `正在连接 ${meta.title}`
    : `连接 ${meta.title}`;
  const callbackHeroMessage = callbackCompleting
    ? "请稍候，连接完成后将自动返回。"
    : openFailed
      ? "请检查网络后再次打开授权页。"
      : failed
        ? "本次授权信息已失效，请重新授权。"
        : callbackMessage;
  const canContinueSingleCheck = Boolean(props.authSheet.authorizationUrl);
  const singleCheckHeroTitle = singleCheckCompleting
    ? `正在连接 ${meta.title}`
    : `连接 ${meta.title}`;
  const singleCheckHeroMessage = singleCheckCompleting
    ? "请稍候，连接完成后将自动返回。"
    : openFailed
      ? "请检查网络后再次打开授权页。"
      : failed
        ? "本次授权信息已失效，请重新授权。"
        : deferred
          ? canContinueSingleCheck
            ? "网页授权尚未完成，请继续完成登录。"
            : "检测到未完成的授权，请重新开始。"
          : singleCheckInstruction(props.authSheet.provider);
  const singleCheckStatusTitle = singleCheckCompleting
    ? "正在检查授权结果"
    : openFailed
      ? "无法打开授权页"
      : failed
        ? "无法完成连接"
        : deferred
          ? "等待继续授权"
          : "等待检查授权结果";
  const singleCheckStatusDetail = singleCheckCompleting
    ? "正在确认服务端授权状态，请勿重复操作。"
    : openFailed
      ? props.authSheet.status.replace(/^无法打开授权页：/, "")
      : failed
        ? failureDetail || "请重新发起授权后再试。"
        : deferred
          ? canContinueSingleCheck
            ? props.authSheet.status.replace(/^授权待继续：/, "")
            : "原授权页面无法恢复，请重新发起授权。"
          : "完成网页授权后，应用将自动检查连接结果。";
  const copilotOpenFailed = copilot && Boolean(copilotOpenError);
  const copilotHeroTitle = copilotCompleting
    ? `正在连接 ${meta.title}`
    : `连接 ${meta.title}`;
  const copilotHeroMessage = copilotCompleting
    ? "请稍候，连接完成后将自动返回。"
    : failed
      ? "本次设备授权已失效，请重新授权。"
      : copilotOpenFailed
        ? "请检查网络后再次打开 GitHub 授权页。"
        : "复制设备码，然后前往 GitHub 完成授权。";
  const copilotStatusTitle = copilotCompleting
    ? "正在等待 GitHub 授权"
    : failed
      ? "无法完成连接"
      : copilotOpenFailed
        ? "无法打开授权页"
        : "GitHub 设备码";
  const copilotStatusDetail = copilotCompleting
    ? "请在 GitHub 页面完成确认，应用将持续检查授权结果。"
    : failed
      ? failureDetail || "请重新申请设备码后再试。"
      : copilotOpenFailed
        ? copilotOpenError || "请稍后重试。"
        : "复制后，在 GitHub 页面粘贴设备码并确认。";
  const consoleOpenFailed = openFailed && !consolePageRecovered;
  const inputRejectedDetail = inputRejected
    ? props.authSheet.status.replace(/^授权输入有误：/, "")
    : "";
  const currentConsoleRegion = props.authSheet.authorizationRegion;
  const consoleHeroTitle = consoleCompleting
    ? `正在连接 ${meta.title}`
    : `连接 ${meta.title}`;
  const consoleHeroMessage = consoleCompleting
    ? "请稍候，连接完成后将自动返回。"
    : consoleOpenFailed
      ? "请检查网络后再次打开密钥控制台。"
      : failed
        ? "本次密钥验证会话已失效，请重新开始。"
        : inputRejected
          ? "密钥未能通过验证，请重新复制后粘贴。"
          : consoleSecretInstruction(props.authSheet.provider);
  const consoleStatusTitle = consoleCompleting
    ? `正在验证 ${consoleSecretTitle(props.authSheet.provider)}`
    : consoleOpenFailed
      ? "无法打开控制台"
      : "无法完成连接";
  const consoleStatusDetail = consoleCompleting
    ? props.authSheet.provider === "zai"
      ? "正在确认 API Key 与账户区域，请勿重复提交。"
      : "正在确认站点与可用额度，请勿重复提交。"
    : consoleOpenFailed
      ? props.authSheet.status.replace(/^无法打开授权页：/, "")
      : failureDetail || "请重新开始密钥验证。";
  const pasteProvider = props.authSheet.provider;

  async function copyDeviceCode(code: string) {
    try {
      await Pasteboard.setString(code);
      setDeviceCodeCopied(true);
    } catch (error) {
      await Dialog.alert({
        title: "无法复制设备码",
        message: error instanceof Error ? error.message : "请稍后重试",
        buttonLabel: "关闭",
      });
    }
  }

  const sessionKey = `${props.authSheet.provider}:${props.authSheet.profileId}:${props.authSheet.sessionId ?? "legacy"}`;
  const lifecycle = useRef({
    active: true,
    sessionKey,
    pending: false,
    completing: false,
    inputRevision: 0,
    input: props.authSheet.authorizationInput,
    submitted: false,
  });
  if (lifecycle.current.sessionKey !== sessionKey) {
    lifecycle.current.inputRevision++;
    lifecycle.current.submitted = false;
  }
  lifecycle.current.input = props.authSheet.authorizationInput;
  if ((failed || inputRejected) && !props.completing)
    lifecycle.current.submitted = false;
  lifecycle.current.sessionKey = sessionKey;
  lifecycle.current.completing = Boolean(props.completing);
  useEffect(() => {
    setDeviceCodeCopied(false);
    setCopilotOpenError(null);
    setConsolePageRecovered(false);
  }, [sessionKey]);
  useEffect(() => {
    lifecycle.current.active = true;
    return () => {
      lifecycle.current.active = false;
    };
  }, []);
  const current = () =>
    lifecycle.current.active &&
    lifecycle.current.sessionKey === sessionKey &&
    !lifecycle.current.completing;

  function submitPaste(value: string) {
    if (!current() || lifecycle.current.submitted) return;
    lifecycle.current.submitted = true;
    props.onSubmit(value);
  }

  async function changeInput(value: string) {
    const previous = lifecycle.current.input;
    lifecycle.current.input = value;
    const revision = ++lifecycle.current.inputRevision;
    props.onChangeInput(value);
    if (
      !isAuthorizationPasteCandidate(pasteProvider, previous, value) ||
      !current()
    )
      return;
    // onChanged has no paste event metadata. Confirm the entire edit against
    // the clipboard instead of treating a single keystroke as a complete key.
    try {
      const clipboard = await Pasteboard.getString();
      if (
        current() &&
        revision === lifecycle.current.inputRevision &&
        clipboard?.trim() === value.trim()
      )
        submitPaste(value.trim());
    } catch {
      // If system clipboard access is declined, the explicit clipboard button
      // remains available to request access and finish authorization.
    }
  }

  function cancel() {
    lifecycle.current.active = false;
    props.onCancel();
  }

  function restart() {
    if (!current() || lifecycle.current.pending) return;
    lifecycle.current.sessionKey = "restarting";
    props.onRestart();
  }

  async function pasteFromClipboard() {
    if (!current() || lifecycle.current.pending) return;
    lifecycle.current.pending = true;
    try {
      const raw = await Pasteboard.getString();
      if (!current()) return;
      const error = clipboardPasteError(pasteProvider, raw);
      if (error) {
        if (raw?.trim()) props.onChangeInput(raw.trim());
        await Dialog.alert({ ...error, buttonLabel: "知道了" });
        return;
      }
      props.onChangeInput(raw!.trim());
      lifecycle.current.inputRevision++;
      submitPaste(raw!.trim());
    } catch (error) {
      if (current())
        await Dialog.alert({
          title: "无法读取剪贴板",
          message: error instanceof Error ? error.message : "请稍后重试",
          buttonLabel: "关闭",
        });
    } finally {
      lifecycle.current.pending = false;
    }
  }

  async function reopenAuthorizationPage() {
    if (!current() || lifecycle.current.pending) return;
    lifecycle.current.pending = true;
    if (copilot) setCopilotOpenError(null);
    try {
      await openAuthorizationPage(props.authSheet.authorizationUrl!);
      if (consoleSecret) setConsolePageRecovered(true);
      if (current() && props.authSheet.autoComplete) props.onSubmit();
    } catch (error) {
      if (!current()) return;
      const message = error instanceof Error ? error.message : "请稍后重试";
      if (copilot) setCopilotOpenError(message);
      else
        await Dialog.alert({
          title: "无法打开授权页",
          message,
          buttonLabel: "关闭",
        });
    } finally {
      lifecycle.current.pending = false;
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={focusedAuth ? "" : `连接 ${meta.title}`}
        navigationBarTitleDisplayMode="inline"
        scrollContentBackground="hidden"
        listStyle="plain"
        listRowSeparator="hidden"
        listRowSpacing={12}
        listSectionSpacing={12}
        contentMargins={{
          edges: "horizontal",
          insets: 16,
          placement: "scrollContent",
        }}
        background={<PageBackground theme={props.backgroundTheme} />}
        toolbar={{
          cancellationAction: <Button title="取消" action={cancel} />,
        }}
      >
        {focusedAuth ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 12, bottom: 8, leading: 16, trailing: 16 }}
          >
            <VStack
              alignment="center"
              spacing={12}
              frame={{ maxWidth: "infinity" }}
            >
              <ProviderLogo
                provider={props.authSheet.provider}
                size={AUTH_HERO_LOGO_SIZE}
              />
              <Text font={24} fontWeight="bold" multilineTextAlignment="center">
                {callbackPaste
                  ? callbackHeroTitle
                  : singleCheck
                    ? singleCheckHeroTitle
                    : copilot
                      ? copilotHeroTitle
                      : consoleHeroTitle}
              </Text>
              <Text
                font="subheadline"
                foregroundStyle="secondaryLabel"
                multilineTextAlignment="center"
                frame={{ maxWidth: 320 }}
              >
                {callbackPaste
                  ? callbackHeroMessage
                  : singleCheck
                    ? singleCheckHeroMessage
                    : copilot
                      ? copilotHeroMessage
                      : consoleHeroMessage}
              </Text>
              {consoleSecret &&
              !consoleCompleting &&
              !consoleOpenFailed &&
              !failed ? (
                <Text
                  font="caption"
                  foregroundStyle="secondaryLabel"
                  multilineTextAlignment="center"
                >
                  {`当前站点：${consoleRegionLabel(props.authSheet.provider, currentConsoleRegion)}`}
                </Text>
              ) : null}
            </VStack>
          </Section>
        ) : null}
        {callbackPaste && !callbackEntry ? (
          <Section listRowBackground={glassRowBackground}>
            <GlassGroup>
              <VStack
                alignment="leading"
                spacing={4}
                padding={{ vertical: true }}
                frame={{
                  minHeight: 76,
                  maxWidth: "infinity",
                  alignment: "leading",
                }}
              >
                <Text font="headline">
                  {callbackCompleting
                    ? "正在验证授权信息"
                    : openFailed
                      ? "无法打开授权页"
                      : "无法完成连接"}
                </Text>
                <Text font="subheadline" foregroundStyle="secondaryLabel">
                  {callbackCompleting
                    ? "正在验证授权信息，请勿重复提交。"
                    : openFailed
                      ? props.authSheet.status.replace(/^无法打开授权页：/, "")
                      : failureDetail || "请重新发起授权后再试。"}
                </Text>
              </VStack>
            </GlassGroup>
          </Section>
        ) : callbackPaste ? (
          <Section listRowBackground={glassRowBackground}>
            <GlassGroup>
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 58, maxWidth: "infinity" }}
              >
                <VStack
                  alignment="leading"
                  spacing={4}
                  frame={{ maxWidth: "infinity", alignment: "leading" }}
                >
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    {callbackInputTitle(props.authSheet.provider)}
                  </Text>
                  <TextField
                    title={callbackInputTitle(props.authSheet.provider)}
                    value={props.authSheet.authorizationInput}
                    onChanged={(value) => {
                      void changeInput(value);
                    }}
                    prompt={meta.pastePlaceholder}
                    frame={{ maxWidth: "infinity", minHeight: 36 }}
                  />
                </VStack>
                <Button
                  buttonStyle="plain"
                  disabled={Boolean(props.completing)}
                  action={() => {
                    void pasteFromClipboard();
                  }}
                >
                  <Image
                    systemName="doc.on.clipboard"
                    imageScale="large"
                    foregroundStyle="accentColor"
                  />
                </Button>
              </HStack>
              <GlassDivider />
              <GlassNoteRow text="粘贴后将自动验证并连接。" />
            </GlassGroup>
          </Section>
        ) : singleCheck ? (
          <Section listRowBackground={glassRowBackground}>
            <GlassGroup>
              <VStack
                alignment="leading"
                spacing={4}
                padding={{ vertical: true }}
                frame={{
                  minHeight: 76,
                  maxWidth: "infinity",
                  alignment: "leading",
                }}
              >
                <Text font="headline">{singleCheckStatusTitle}</Text>
                <Text font="subheadline" foregroundStyle="secondaryLabel">
                  {singleCheckStatusDetail}
                </Text>
              </VStack>
            </GlassGroup>
          </Section>
        ) : copilot ? (
          <Section listRowBackground={glassRowBackground}>
            <GlassGroup>
              {props.authSheet.deviceCode &&
              !copilotCompleting &&
              !failed &&
              !copilotOpenFailed ? (
                <Button
                  buttonStyle="plain"
                  frame={{ maxWidth: "infinity" }}
                  action={() => copyDeviceCode(props.authSheet.deviceCode!)}
                >
                  <HStack
                    padding={{ vertical: true }}
                    frame={{ minHeight: 58, maxWidth: "infinity" }}
                    contentShape="rect"
                  >
                    <VStack alignment="leading" spacing={4}>
                      <Text font="caption" foregroundStyle="secondaryLabel">
                        设备码
                      </Text>
                      <Text font="headline" fontWeight="bold" monospaced>
                        {props.authSheet.deviceCode}
                      </Text>
                    </VStack>
                    <Spacer />
                    {deviceCodeCopied ? (
                      <HStack spacing={4}>
                        <Image
                          systemName="checkmark.circle.fill"
                          imageScale="medium"
                          foregroundStyle="accentColor"
                        />
                        <Text font="subheadline" foregroundStyle="accentColor">
                          已复制
                        </Text>
                      </HStack>
                    ) : (
                      <Image
                        systemName="doc.on.doc"
                        imageScale="medium"
                        foregroundStyle="accentColor"
                      />
                    )}
                  </HStack>
                </Button>
              ) : (
                <VStack
                  alignment="leading"
                  spacing={4}
                  padding={{ vertical: true }}
                  frame={{
                    minHeight: 76,
                    maxWidth: "infinity",
                    alignment: "leading",
                  }}
                >
                  <Text font="headline">{copilotStatusTitle}</Text>
                  <Text font="subheadline" foregroundStyle="secondaryLabel">
                    {copilotStatusDetail}
                  </Text>
                </VStack>
              )}
              {!copilotCompleting && !failed && !copilotOpenFailed ? (
                <VStack spacing={0} frame={{ maxWidth: "infinity" }}>
                  <GlassDivider />
                  <GlassNoteRow text={copilotStatusDetail} />
                </VStack>
              ) : null}
            </GlassGroup>
          </Section>
        ) : consoleSecret &&
          (consoleCompleting || consoleOpenFailed || failed) ? (
          <Section listRowBackground={glassRowBackground}>
            <GlassGroup>
              <VStack
                alignment="leading"
                spacing={4}
                padding={{ vertical: true }}
                frame={{
                  minHeight: 76,
                  maxWidth: "infinity",
                  alignment: "leading",
                }}
              >
                <Text font="headline">{consoleStatusTitle}</Text>
                <Text font="subheadline" foregroundStyle="secondaryLabel">
                  {consoleStatusDetail}
                </Text>
              </VStack>
            </GlassGroup>
          </Section>
        ) : consoleSecret ? (
          <Section listRowBackground={glassRowBackground}>
            <GlassGroup>
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 58, maxWidth: "infinity" }}
              >
                <VStack
                  alignment="leading"
                  spacing={4}
                  frame={{ maxWidth: "infinity", alignment: "leading" }}
                >
                  <Text font="caption" foregroundStyle="secondaryLabel">
                    {consoleSecretTitle(props.authSheet.provider)}
                  </Text>
                  <TextField
                    title={consoleSecretTitle(props.authSheet.provider)}
                    value={props.authSheet.authorizationInput}
                    onChanged={(value) => {
                      void changeInput(value);
                    }}
                    prompt={meta.pastePlaceholder}
                    frame={{ maxWidth: "infinity", minHeight: 36 }}
                  />
                </VStack>
                <Button
                  buttonStyle="plain"
                  disabled={Boolean(props.completing)}
                  action={() => {
                    void pasteFromClipboard();
                  }}
                >
                  <Image
                    systemName="doc.on.clipboard"
                    imageScale="large"
                    foregroundStyle="accentColor"
                  />
                </Button>
              </HStack>
              <GlassDivider />
              <GlassNoteRow
                text={
                  inputRejected
                    ? inputRejectedDetail
                    : "粘贴后将自动验证并连接。"
                }
              />
            </GlassGroup>
          </Section>
        ) : waiting ? (
          <Section listRowBackground={glassRowBackground}>
            <GlassGroup>
              <HStack
                alignment="center"
                spacing={12}
                padding={{ vertical: 16 }}
                frame={{ maxWidth: "infinity" }}
              >
                <VStack
                  alignment="center"
                  frame={{
                    width: WAITING_LOGO_SLOT,
                    height: WAITING_LOGO_SLOT,
                    alignment: "center",
                  }}
                >
                  <ProviderLogo
                    provider={props.authSheet.provider}
                    size={WAITING_LOGO_SIZE}
                  />
                </VStack>
                <VStack
                  alignment="leading"
                  spacing={4}
                  frame={{ maxWidth: "infinity", alignment: "leading" }}
                >
                  <Text font="headline">
                    {failed
                      ? "无法完成连接"
                      : deferred
                        ? "等待继续授权"
                        : singleCheck
                          ? "正在检查授权结果"
                          : "正在完成连接"}
                  </Text>
                  <Text font="subheadline" foregroundStyle="secondaryLabel">
                    {deferred
                      ? props.authSheet.status.replace(/^授权待继续：/, "")
                      : failed
                        ? failureDetail ||
                          "授权未完成，请重新打开授权页后再试。"
                        : pasteCallback
                          ? "正在验证授权内容"
                          : singleCheck
                            ? "正在确认服务端授权状态"
                            : "已完成浏览器登录，正在确认授权"}
                  </Text>
                </VStack>
              </HStack>
            </GlassGroup>
          </Section>
        ) : (
          <Section listRowBackground={glassRowBackground}>
            <GlassGroup>
              {props.authSheet.status ? (
                <HStack
                  padding={{ vertical: true }}
                  frame={{ minHeight: 44, maxWidth: "infinity" }}
                >
                  <Text>
                    {pasteCallback && !failed
                      ? "粘贴完整回调地址或授权码后自动连接"
                      : props.authSheet.status}
                  </Text>
                  <Spacer />
                </HStack>
              ) : null}
              {props.authSheet.status ? <GlassDivider /> : null}
              {props.authSheet.deviceCode ? (
                <Button
                  buttonStyle="plain"
                  frame={{ maxWidth: "infinity" }}
                  action={() => copyDeviceCode(props.authSheet.deviceCode!)}
                >
                  <HStack
                    padding={{ vertical: true }}
                    frame={{ minHeight: 44, maxWidth: "infinity" }}
                    contentShape="rect"
                  >
                    <VStack alignment="leading" spacing={2}>
                      <Text font="caption" foregroundStyle="secondaryLabel">
                        设备码（点击复制）
                      </Text>
                      <Text font="headline" fontWeight="bold" monospaced>
                        {props.authSheet.deviceCode}
                      </Text>
                    </VStack>
                    <Spacer />
                    <Image
                      systemName="doc.on.doc"
                      imageScale="medium"
                      foregroundStyle="accentColor"
                    />
                  </HStack>
                </Button>
              ) : pasteCallback ? (
                <HStack
                  padding={{ vertical: true }}
                  frame={{ minHeight: 44, maxWidth: "infinity" }}
                >
                  <TextField
                    title="授权内容"
                    value={props.authSheet.authorizationInput}
                    onChanged={(value) => {
                      void changeInput(value);
                    }}
                    prompt={meta.pastePlaceholder}
                    frame={{ maxWidth: "infinity", minHeight: 44 }}
                  />
                  <Button
                    buttonStyle="plain"
                    disabled={Boolean(props.completing)}
                    action={() => {
                      void pasteFromClipboard();
                    }}
                  >
                    <Image
                      systemName="doc.on.clipboard"
                      imageScale="medium"
                      foregroundStyle="accentColor"
                    />
                  </Button>
                </HStack>
              ) : (
                <TextField
                  title="授权内容"
                  value={props.authSheet.authorizationInput}
                  onChanged={props.onChangeInput}
                  prompt={meta.pastePlaceholder}
                  padding={{ vertical: true }}
                  frame={{ minHeight: 44, maxWidth: "infinity" }}
                />
              )}
              <GlassDivider />
              <GlassNoteRow
                text={
                  pasteCallback
                    ? pasteProvider === "zai" || pasteProvider === "minimax"
                      ? "复制完整密钥后粘贴，或点击右侧剪贴板按钮，自动完成连接。"
                      : "复制完整回调地址或授权码后粘贴，或点击右侧剪贴板按钮，自动完成连接。"
                    : meta.pasteHint
                }
              />
            </GlassGroup>
          </Section>
        )}

        {copilot && copilotOpenFailed ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Button
                controlSize="large"
                buttonStyle="glass"
                buttonBorderShape="capsule"
                disabled={Boolean(props.completing)}
                action={() => {
                  void reopenAuthorizationPage();
                }}
              >
                <Text
                  font={17}
                  fontWeight="medium"
                  multilineTextAlignment="center"
                  frame={{ width: 300, height: 28 }}
                >
                  重新打开授权页
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : deferred ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Button
                controlSize="large"
                buttonStyle="glassProminent"
                buttonBorderShape="capsule"
                tint={meta.accent === "#111111" ? "label" : meta.accent}
                disabled={Boolean(props.completing)}
                action={() => {
                  if (props.authSheet.authorizationUrl)
                    void reopenAuthorizationPage();
                  else restart();
                }}
              >
                <Text
                  font={17}
                  fontWeight="semibold"
                  multilineTextAlignment="center"
                  frame={{ width: 300, height: 28 }}
                >
                  {props.authSheet.authorizationUrl ? "继续授权" : "重新授权"}
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : null}
        {waiting && failed ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Button
                controlSize="large"
                buttonStyle="glassProminent"
                buttonBorderShape="capsule"
                tint={meta.accent === "#111111" ? "label" : meta.accent}
                disabled={Boolean(props.completing)}
                action={restart}
              >
                <Text
                  font={17}
                  fontWeight="semibold"
                  multilineTextAlignment="center"
                  frame={{ width: 300, height: 28 }}
                >
                  重新授权
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : null}

        {!waiting &&
        !copilotOpenFailed &&
        props.authSheet.deviceCode &&
        props.authSheet.authorizationUrl ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Button
                controlSize="large"
                buttonStyle="glassProminent"
                buttonBorderShape="capsule"
                tint={meta.accent === "#111111" ? "label" : meta.accent}
                disabled={Boolean(props.completing)}
                action={() => {
                  void reopenAuthorizationPage();
                }}
              >
                <Text
                  font={17}
                  fontWeight="semibold"
                  multilineTextAlignment="center"
                  frame={{ width: 300, height: 28 }}
                >
                  打开 GitHub 授权页
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : !waiting && callbackEntry ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Button
                controlSize="large"
                buttonStyle="plain"
                disabled={Boolean(props.completing)}
                action={() => {
                  if (props.authSheet.authorizationUrl)
                    void reopenAuthorizationPage();
                  else restart();
                }}
              >
                <Text
                  font={17}
                  fontWeight="medium"
                  frame={{ width: 300, height: 44 }}
                  contentShape="rect"
                >
                  重新打开授权页
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : !waiting && callbackPaste && openFailed ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Button
                controlSize="large"
                buttonStyle="glass"
                buttonBorderShape="capsule"
                disabled={Boolean(props.completing)}
                action={restart}
              >
                <Text
                  font={17}
                  fontWeight="medium"
                  multilineTextAlignment="center"
                  frame={{ width: 300, height: 28 }}
                >
                  重新打开授权页
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : !waiting && singleCheck && openFailed ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Button
                controlSize="large"
                buttonStyle="glass"
                buttonBorderShape="capsule"
                disabled={Boolean(props.completing)}
                action={restart}
              >
                <Text
                  font={17}
                  fontWeight="medium"
                  multilineTextAlignment="center"
                  frame={{ width: 300, height: 28 }}
                >
                  重新打开授权页
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : !waiting && consoleSecret && consoleOpenFailed ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Button
                controlSize="large"
                buttonStyle="glass"
                buttonBorderShape="capsule"
                disabled={Boolean(props.completing)}
                action={() => {
                  if (props.authSheet.authorizationUrl)
                    void reopenAuthorizationPage();
                  else restart();
                }}
              >
                <Text
                  font={17}
                  fontWeight="medium"
                  multilineTextAlignment="center"
                  frame={{ width: 300, height: 28 }}
                >
                  重新打开控制台
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : !waiting && consoleSecret && failed ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Button
                controlSize="large"
                buttonStyle="glassProminent"
                buttonBorderShape="capsule"
                tint={meta.accent === "#111111" ? "label" : meta.accent}
                disabled={Boolean(props.completing)}
                action={restart}
              >
                <Text
                  font={17}
                  fontWeight="semibold"
                  multilineTextAlignment="center"
                  frame={{ width: 300, height: 28 }}
                >
                  重新开始
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : !waiting && consoleSecret ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack
              alignment="center"
              spacing={0}
              frame={{ maxWidth: "infinity" }}
            >
              <Button
                controlSize="large"
                buttonStyle="plain"
                disabled={Boolean(props.completing)}
                action={() => {
                  if (props.authSheet.authorizationUrl)
                    void reopenAuthorizationPage();
                  else restart();
                }}
              >
                <Text
                  font={17}
                  fontWeight="medium"
                  frame={{ width: 300, height: 44 }}
                  contentShape="rect"
                >
                  重新打开控制台
                </Text>
              </Button>
              <Button
                controlSize="large"
                buttonStyle="plain"
                disabled={Boolean(props.completing)}
                action={restart}
              >
                <Text
                  font={15}
                  foregroundStyle="secondaryLabel"
                  frame={{ width: 300, height: 40 }}
                  contentShape="rect"
                >
                  切换站点
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : !waiting && pasteCallback ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <VStack alignment="center" frame={{ maxWidth: "infinity" }}>
              <Button
                controlSize="large"
                buttonStyle="glassProminent"
                buttonBorderShape="capsule"
                tint={meta.accent === "#111111" ? "label" : meta.accent}
                disabled={Boolean(props.completing)}
                action={restart}
              >
                <Text
                  font={17}
                  fontWeight="semibold"
                  multilineTextAlignment="center"
                  frame={{ width: 300, height: 28 }}
                >
                  重新授权
                </Text>
              </Button>
            </VStack>
          </Section>
        ) : !waiting ? (
          <Section
            listRowBackground={<Rectangle fill="clear" />}
            listRowSeparator="hidden"
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            <HStack spacing={12} frame={{ maxWidth: "infinity" }}>
              <Spacer />
              <Button
                controlSize="large"
                buttonStyle="glass"
                buttonBorderShape="capsule"
                disabled={Boolean(props.completing)}
                action={restart}
              >
                <HStack
                  spacing={8}
                  frame={{ width: 128, height: 28 }}
                  contentShape="rect"
                >
                  <Spacer />
                  <Image systemName="safari" imageScale="medium" />
                  <Text font={16} fontWeight="medium">
                    重新授权
                  </Text>
                  <Spacer />
                </HStack>
              </Button>
              <Button
                controlSize="large"
                buttonStyle="glassProminent"
                buttonBorderShape="capsule"
                tint={meta.accent === "#111111" ? "label" : meta.accent}
                disabled={
                  Boolean(props.completing) ||
                  (pasteCallback &&
                    !looksLikeAuthorizationInput(
                      pasteProvider,
                      props.authSheet.authorizationInput,
                    ))
                }
                action={() => {
                  if (current()) props.onSubmit();
                }}
              >
                <Text
                  font={16}
                  fontWeight="semibold"
                  multilineTextAlignment="center"
                  frame={{ width: 128, height: 28 }}
                >
                  完成授权
                </Text>
              </Button>
              <Spacer />
            </HStack>
          </Section>
        ) : null}
      </List>
    </NavigationStack>
  );
}
