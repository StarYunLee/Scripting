import {
  Button, HStack, Image, List, NavigationStack, Rectangle, Section, Spacer,
  Text, TextField, VStack, useRef, useEffect, useState,
} from "scripting";
import { providerMeta, type AuthSheet } from "../models";
import { clipboardPasteError } from "../services/auth-callback-input";
import { isAuthorizationPasteCandidate } from "../services/auth-paste-edit";
import { openAuthorizationPage } from "../services/browser";
import { authGuideCopy, authGuideDetail, authGuideRegions, authGuideSelectedRegion, authGuideState, mayRetryAuthInput } from "../services/auth-guide";
import { PageBackground } from "./PageBackground";
import { ProviderLogo } from "./ProviderLogo";
import { GlassGroup, glassRowBackground } from "./GlassList";
import { AUTH_GUIDE_ICON_COLUMN, AuthGuideAction, AuthGuideRegionPicker, AuthGuideSpinner, AuthGuideStep, AuthGuideNotice } from "./AuthGuideParts";
import type { BackgroundThemeId } from "../services/settings";

export function AuthSheetView(props: {
  authSheet: AuthSheet;
  backgroundTheme: BackgroundThemeId;
  completing?: boolean;
  preparing?: boolean;
  onChangeInput: (value: string) => void;
  onSubmit: (authorizationInput?: string) => void;
  onCancel: () => void;
  onRestart: (region?: "intl" | "cn") => void | Promise<void>;
}) {
  const sheet = props.authSheet;
  const actions = useRef(props);
  actions.current = props;
  const meta = providerMeta(sheet.provider);
  const regionOptions = authGuideRegions(sheet.provider);
  const selectedRegion = authGuideSelectedRegion(sheet);
  const guide = authGuideCopy(sheet.provider, selectedRegion);
  const state = authGuideState(sheet, Boolean(props.completing));
  const detail = authGuideDetail(sheet);
  const [opened, setOpened] = useState(false);
  const [external, setExternal] = useState(false);
  const [opening, setOpening] = useState(false);
  const [restarting, setRestarting] = useState(false);
  const [openError, setOpenError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [pendingRegion, setPendingRegion] = useState<"intl" | "cn" | null>(null);
  const shownRegion = pendingRegion ?? selectedRegion;
  const sessionKey = `${sheet.provider}:${sheet.profileId}:${sheet.sessionId ?? "legacy"}`;
  const lifecycle = useRef({ active: true, sessionKey, pending: false,
    completing: Boolean(props.completing), preparing: Boolean(props.preparing), terminal: false,
    checkAfterOpen: false, inputRevision: 0,
    input: sheet.authorizationInput, submitted: false });
  if (lifecycle.current.sessionKey !== sessionKey) {
    lifecycle.current.inputRevision++;
    lifecycle.current.submitted = false;
    lifecycle.current.pending = false;
    lifecycle.current.checkAfterOpen = false;
    lifecycle.current.active = true;
  }
  lifecycle.current.sessionKey = sessionKey;
  lifecycle.current.completing = Boolean(props.completing);
  lifecycle.current.preparing = Boolean(props.preparing);
  lifecycle.current.terminal = state === "failed" || state === "cancelFailed";
  lifecycle.current.input = sheet.authorizationInput;
  if (mayRetryAuthInput(state) && !props.completing) lifecycle.current.submitted = false;
  useEffect(() => {
    setOpened(false);
    setExternal(false); setOpening(false); setRestarting(false); setOpenError(null); setCopied(false);
    setPendingRegion(null);
  }, [sessionKey, sheet.authorizationRegion]);
  useEffect(() => {
    lifecycle.current.active = true;
    return () => { lifecycle.current.active = false; };
  }, []);
  const current = () => lifecycle.current.active && lifecycle.current.sessionKey === sessionKey;
  const canSubmit = () => current() && !lifecycle.current.completing && !lifecycle.current.preparing;
  const busy = Boolean(props.completing || props.preparing) || opening || restarting;
  const cancelFailed = state === "cancelFailed";
  const terminal = state === "failed" || cancelFailed;
  const canOpen = Boolean(sheet.authorizationUrl);
  const needsRestart = !canOpen || (guide.kind === "device" && !sheet.deviceCode);
  const tint = meta.accent === "#111111" ? "label" : meta.accent;
  const pageError = openError;

  // If a reopened page closes before the previous check settles, check once after it releases.
  useEffect(() => {
    if (!current() || !lifecycle.current.checkAfterOpen || props.completing || props.preparing) return;
    lifecycle.current.checkAfterOpen = false;
    if (!terminal) actions.current.onSubmit();
  }, [sessionKey, props.completing, props.preparing, state]);

  function cancel() {
    if (!current()) return;
    lifecycle.current.active = false;
    lifecycle.current.checkAfterOpen = false;
    actions.current.onCancel();
  }
  async function restart(region?: "intl" | "cn") {
    if (!canSubmit() || lifecycle.current.pending) return;
    lifecycle.current.pending = true;
    setRestarting(true);
    try {
      await actions.current.onRestart(region);
    } catch (error) {
      if (current()) await Dialog.alert({ title: "无法开始授权", message: error instanceof Error ? error.message : "请稍后重试。", buttonLabel: "关闭" });
    } finally {
      if (lifecycle.current.sessionKey === sessionKey) {
        lifecycle.current.pending = false;
        if (lifecycle.current.active) {
          setRestarting(false);
          setPendingRegion(null);
        }
      }
    }
  }
  function submitInput(value: string) {
    if (!canSubmit() || lifecycle.current.submitted || lifecycle.current.terminal) return;
    lifecycle.current.submitted = true;
    actions.current.onSubmit(value);
  }
  function changeInput(value: string) {
    if (!canSubmit()) return;
    const previous = lifecycle.current.input;
    lifecycle.current.input = value;
    lifecycle.current.inputRevision++;
    actions.current.onChangeInput(value);
    if (!canSubmit() || lifecycle.current.pending || terminal) return;
    // The native paste action already supplied this text; do not require another clipboard read.
    if (isAuthorizationPasteCandidate(sheet.provider, previous, value)) submitInput(value.trim());
  }
  async function paste() {
    if (!canSubmit() || lifecycle.current.pending || terminal) return;
    lifecycle.current.pending = true;
    const revision = ++lifecycle.current.inputRevision;
    try {
      const raw = await Pasteboard.getString();
      if (!canSubmit() || revision !== lifecycle.current.inputRevision) return;
      const error = clipboardPasteError(sheet.provider, raw);
      if (error) {
        if (raw?.trim()) actions.current.onChangeInput(raw.trim());
        await Dialog.alert({ ...error, buttonLabel: "知道了" }); return;
      }
      actions.current.onChangeInput(raw!.trim());
      lifecycle.current.inputRevision++;
      submitInput(raw!.trim());
    } catch (error) {
      if (current()) await Dialog.alert({ title: "无法读取剪贴板", message: error instanceof Error ? error.message : "请稍后重试", buttonLabel: "关闭" });
    } finally { if (lifecycle.current.sessionKey === sessionKey) lifecycle.current.pending = false; }
  }
  async function copyCode() {
    if (!current() || lifecycle.current.preparing || !sheet.deviceCode) return;
    try { await Pasteboard.setString(sheet.deviceCode); if (current()) setCopied(true); }
    catch (error) { if (current()) await Dialog.alert({ title: "无法复制设备码", message: error instanceof Error ? error.message : "请稍后重试", buttonLabel: "关闭" }); }
  }
  async function openPage() {
    if (!current() || lifecycle.current.preparing || lifecycle.current.pending || !sheet.authorizationUrl || terminal) return;
    lifecycle.current.pending = true; setOpening(true); setOpenError(null);
    try {
      const mode = await openAuthorizationPage(sheet.authorizationUrl);
      if (!current()) return;
      setOpened(true); setExternal(mode === "openURL");
      // present resolves on dismissal; openURL only confirms that opening succeeded.
      if (mode === "present" && !lifecycle.current.terminal && (guide.kind === "check" || guide.kind === "device")) {
        if (lifecycle.current.completing) lifecycle.current.checkAfterOpen = true;
        else if (!lifecycle.current.preparing) actions.current.onSubmit();
      }
    } catch (error) {
      if (current()) setOpenError(error instanceof Error ? error.message : "请检查网络后重试。");
    } finally {
      if (lifecycle.current.sessionKey === sessionKey) {
        lifecycle.current.pending = false;
        if (lifecycle.current.active) setOpening(false);
      }
    }
  }

  function openLabel(): string {
    if (needsRestart) return "重新授权";
    if (opening || restarting) return "正在打开…";
    if (opened || sheet.resumed || pageError) return "重新打开授权页";
    return guide.openLabel;
  }
  function openControl() {
    return <AuthGuideAction title={openLabel()} tint={tint}
      disabled={opening || restarting || Boolean(props.preparing) || (needsRestart && Boolean(props.completing))}
      action={needsRestart ? () => { void restart(); } : () => { void openPage(); }} />;
  }
  function openNotice() {
    if (pageError) return <AuthGuideNotice title="无法打开授权页"
      detail={pageError === "无法打开授权页" ? "请检查网络后重试。" : pageError} error />;
    if (external) return <AuthGuideNotice title="已在外部浏览器打开"
      detail={guide.kind === "check" || guide.kind === "device"
        ? "完成后回到这里，点“检查授权结果”。"
        : guide.kind === "key" ? "完成后回到这里，粘贴到第 2 步。" : "完成后回到这里，继续第 3 步。"} />;
    if (!canOpen) return <AuthGuideNotice title="无法恢复上次的授权页"
      detail={guide.kind === "callback"
        ? "请重新授权，或直接粘贴已有的授权结果。"
        : guide.kind === "key" ? "请重新授权，或直接粘贴已有的密钥。" : "请重新授权。"} />;
    return null;
  }
  function inputArea() {
    return (
      <VStack alignment="leading" spacing={12} frame={{ maxWidth: "infinity" }}>
        <HStack spacing={10}>
          <TextField title={guide.inputTitle} value={sheet.authorizationInput}
            onChanged={value => { void changeInput(value); }} prompt={meta.pastePlaceholder}
            disabled={busy} frame={{ maxWidth: "infinity", minHeight: 36 }} />
          <Button buttonStyle="plain" disabled={busy} action={() => { void paste(); }}>
            <Image systemName="doc.on.clipboard" imageScale="large" foregroundStyle="accentColor" />
          </Button>
        </HStack>
        {state === "checking" ? <AuthGuideSpinner label="正在验证授权信息…" /> : null}
        {state === "rejected" ? <AuthGuideNotice title="授权信息有误" detail={detail} error /> : null}
        {state === "deferred" ? <AuthGuideNotice title="尚未完成授权" detail={detail} error /> : null}
      </VStack>
    );
  }
  function resultArea() {
    if (state === "checking") return <AuthGuideSpinner label="正在检查授权结果…" />;
    // A manual check only matters when the page was opened outside the app or nothing has run yet;
    // after an in-app attempt the next step is reopening the page, not re-checking.
    const checkable = (guide.kind !== "device" || Boolean(sheet.deviceCode)) &&
      (external || (state === "ready" && (opened || sheet.resumed === true)));
    return (
      <VStack alignment="leading" spacing={14} frame={{ maxWidth: "infinity" }}>
        {state === "deferred"
          ? <AuthGuideNotice title="尚未完成授权" detail={detail} error />
          : <Text font={15} foregroundStyle="secondaryLabel">{guide.resultDetail ?? null}</Text>}
        {checkable ? <AuthGuideAction title="检查授权结果" tint={tint} disabled={opening || restarting || Boolean(props.preparing)}
          action={() => { if (canSubmit()) actions.current.onSubmit(); }} /> : null}
      </VStack>
    );
  }

  const siteStep = regionOptions ? (
    <Section listRowBackground={glassRowBackground}>
      <GlassGroup>
        <AuthGuideStep number={0} title="选择站点" detail="两个站点的账号不通用，切换会重新准备授权。" active>
          <AuthGuideRegionPicker options={regionOptions} value={shownRegion} disabled={busy || pendingRegion !== null}
            onChange={value => {
              if (!canSubmit() || lifecycle.current.pending) return;
              setPendingRegion(value);
              void restart(value);
            }} />
          <Text font={13} foregroundStyle="secondaryLabel" lineLimit={1}>
            {pendingRegion
              ? `正在准备${regionOptions.find(option => option.value === pendingRegion)!.label}授权…`
              : `当前站点：${regionOptions.find(option => option.value === shownRegion)!.detail}`}
          </Text>
        </AuthGuideStep>
      </GlassGroup>
    </Section>
  ) : null;

  return (
    <NavigationStack>
      <List navigationTitle="" navigationBarTitleDisplayMode="inline"
        scrollContentBackground="hidden" listStyle="plain" listRowSeparator="hidden"
        listRowSpacing={12} listSectionSpacing={12}
        contentMargins={{ edges: "horizontal", insets: 16, placement: "scrollContent" }}
        background={<PageBackground theme={props.backgroundTheme} />}
        toolbar={{ cancellationAction: <Button title="取消" action={cancel} /> }}>
        <Section listRowBackground={<Rectangle fill="clear" />} listRowSeparator="hidden"
          listRowInsets={{ top: 12, bottom: 8, leading: 16, trailing: 16 }}>
          <HStack spacing={12} padding={{ vertical: 8 }}>
            <ProviderLogo provider={sheet.provider} size={36} />
            <VStack alignment="leading" spacing={4}>
              <Text font={22} fontWeight="bold">{`连接 ${meta.title}`}</Text>
            </VStack>
            <Spacer />
          </HStack>
        </Section>

        {terminal ? <Section listRowBackground={glassRowBackground}>
          <GlassGroup><VStack alignment="leading" spacing={14} padding={{ vertical: 16 }}>
            <AuthGuideNotice title={cancelFailed ? "无法完成取消" : "无法完成授权"} detail={detail} error />
            <AuthGuideAction title={cancelFailed ? "重试取消" : "重新授权"} tint={tint}
              disabled={opening || restarting || Boolean(props.preparing)}
              action={cancelFailed ? cancel : () => { void restart(); }} />
          </VStack></GlassGroup>
        </Section> : <>
          {siteStep}

          {guide.kind === "callback" ? (
            <>
              <Section listRowBackground={glassRowBackground}><GlassGroup>
                <AuthGuideStep number={1} title={guide.openTitle} detail={guide.openDetail} active={!opened}>
                  {openNotice()}{openControl()}
                </AuthGuideStep>
              </GlassGroup></Section>
              <Section listRowBackground={glassRowBackground}><GlassGroup>
                <AuthGuideStep number={2} title={guide.resultTitle} detail={guide.resultDetail}
                  active={opened && !sheet.authorizationInput}>
                  {guide.example ? <HStack alignment="top" spacing={6}
                    frame={{ maxWidth: "infinity", alignment: "leading" }}
                    padding={{ leading: AUTH_GUIDE_ICON_COLUMN + 10 }}>
                    <Image systemName="safari" font={13} foregroundStyle="secondaryLabel" />
                    <Text font={12} foregroundStyle="secondaryLabel" monospaced>{guide.example}</Text>
                  </HStack> : null}
                </AuthGuideStep>
              </GlassGroup></Section>
              <Section listRowBackground={glassRowBackground}><GlassGroup>
                <AuthGuideStep number={3} title={`粘贴 ${guide.inputTitle}`}
                  active={Boolean(sheet.authorizationInput) || state === "checking"}>
                  {inputArea()}
                </AuthGuideStep>
              </GlassGroup></Section>
            </>
          ) : guide.kind === "check" ? (
            <>
              <Section listRowBackground={glassRowBackground}><GlassGroup>
                <AuthGuideStep number={1} title={guide.openTitle} detail={guide.openDetail} active={!opened}>
                  {openNotice()}{openControl()}
                </AuthGuideStep>
              </GlassGroup></Section>
              <Section listRowBackground={glassRowBackground}><GlassGroup>
                <AuthGuideStep number={2} title={guide.resultTitle}
                  active={opened || state === "checking" || state === "deferred"}>
                  {resultArea()}
                </AuthGuideStep>
              </GlassGroup></Section>
            </>
          ) : guide.kind === "device" ? (
            <>
              <Section listRowBackground={glassRowBackground}><GlassGroup>
                <AuthGuideStep number={1} title="复制设备码" detail="在 GitHub 授权页会要求输入此设备码。" active={!opened}>
                  {sheet.deviceCode ? <Button buttonStyle="plain" disabled={opening || restarting || Boolean(props.preparing)} action={() => { void copyCode(); }}>
                    <HStack frame={{ maxWidth: "infinity", minHeight: 40 }}>
                      <Text font={20} fontWeight="semibold" monospaced>{sheet.deviceCode}</Text>
                      <Spacer />
                      {copied ? <Text font={14} foregroundStyle="accentColor">已复制</Text> : <Image systemName="doc.on.doc" foregroundStyle="accentColor" />}
                    </HStack>
                  </Button> : <VStack spacing={12}>
                    <AuthGuideNotice title="无法读取设备码" detail="请重新申请本次授权所需的设备码。" error />
                    <AuthGuideAction title="重新申请设备码" tint={tint} disabled={busy} action={() => { void restart(); }} />
                  </VStack>}
                </AuthGuideStep>
              </GlassGroup></Section>
              <Section listRowBackground={glassRowBackground}><GlassGroup>
                <AuthGuideStep number={2} title={guide.openTitle} detail={guide.openDetail} active={!opened}>
                  {openNotice()}{sheet.deviceCode ? openControl() : null}
                </AuthGuideStep>
              </GlassGroup></Section>
              <Section listRowBackground={glassRowBackground}><GlassGroup>
                <AuthGuideStep number={3} title={guide.resultTitle} active={opened || state === "checking"}>
                  {resultArea()}
                </AuthGuideStep>
              </GlassGroup></Section>
            </>
          ) : (
            <>
              <Section listRowBackground={glassRowBackground}><GlassGroup>
                <AuthGuideStep number={1} title={guide.openTitle} detail={guide.openDetail} active={!opened}>
                  {openNotice()}{openControl()}
                </AuthGuideStep>
              </GlassGroup></Section>
              <Section listRowBackground={glassRowBackground}><GlassGroup>
                <AuthGuideStep number={2} title={guide.resultTitle}
                  active={opened || Boolean(sheet.authorizationInput) || state === "checking"}>
                  {inputArea()}
                </AuthGuideStep>
              </GlassGroup></Section>
            </>
          )}
        </>}
      </List>
    </NavigationStack>
  );
}
