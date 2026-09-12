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
  const failed = props.authSheet.status.startsWith("授权失败：");
  const deferred = props.authSheet.status.startsWith("授权待继续：");
  const singleCheck =
    props.authSheet.provider === "cursor" ||
    props.authSheet.provider === "kimi";
  const waiting = props.authSheet.autoComplete
    ? Boolean(props.completing) || failed || deferred
    : pasteCallback && Boolean(props.completing);
  const failureDetail = failed
    ? props.authSheet.status.replace(/^授权失败：/, "")
    : "";
  const pasteProvider = props.authSheet.provider;

  async function copyDeviceCode(code: string) {
    await Pasteboard.setString(code);
    await Dialog.alert({
      title: "已复制设备码",
      message: "现在可以手动打开 GitHub 授权页并粘贴该设备码。",
      buttonLabel: "知道了",
    });
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
  if (failed && !props.completing) lifecycle.current.submitted = false;
  lifecycle.current.sessionKey = sessionKey;
  lifecycle.current.completing = Boolean(props.completing);
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
    try {
      await openAuthorizationPage(props.authSheet.authorizationUrl!);
      if (current() && props.authSheet.autoComplete) props.onSubmit();
    } catch (error) {
      if (current())
        await Dialog.alert({
          title: "无法打开授权页",
          message: error instanceof Error ? error.message : "请稍后重试",
          buttonLabel: "关闭",
        });
    } finally {
      lifecycle.current.pending = false;
    }
  }

  return (
    <NavigationStack>
      <List
        navigationTitle={`连接 ${meta.title}`}
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
        {waiting ? (
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

        {deferred ? (
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
                  继续授权
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
