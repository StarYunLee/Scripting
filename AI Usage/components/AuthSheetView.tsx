import {
  Button,
  Divider,
  HStack,
  Image,
  List,
  NavigationStack,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
  useEffect,
} from "scripting";
import { providerMeta, type AuthSheet } from "../models";
import { getPendingUserCode } from "../providers/copilot/oauth";
import { openPendingAuthorizationPage } from "../services/auth-flow";
import { PageBackground } from "./PageBackground";
import type { BackgroundThemeId } from "../services/settings";

function AuthRowBackground() {
  return (
    <VStack
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      glassEffect={{
        glass: UIGlass.regular(),
        shape: { type: "rect", cornerRadius: 20, style: "continuous" },
      }}
    />
  );
}

const authRowBackground = <AuthRowBackground />;

export function AuthSheetView(props: {
  authSheet: AuthSheet;
  backgroundTheme: BackgroundThemeId;
  onChangeInput: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const meta = providerMeta(props.authSheet.provider);
  const status = props.authSheet.status;
  const statusFailed = status.includes("失败");
  const statusInProgress = status.includes("正在验证");
  // cursor / kimi / copilot 免粘贴，其余平台需粘贴回调地址、授权码或 API Key
  const pasteFree =
    props.authSheet.provider === "cursor" ||
    props.authSheet.provider === "kimi" ||
    props.authSheet.provider === "copilot";
  const submitDisabled =
    !pasteFree && props.authSheet.authorizationInput.trim().length === 0;
  // GitHub 设备授权码：从 Keychain 的 pending 状态读取（开始授权时已写入）
  const deviceCode =
    props.authSheet.provider === "copilot" ? getPendingUserCode() : null;

  // 设备码弹窗出现时自动复制到剪贴板，用户打开授权页后直接粘贴
  useEffect(() => {
    if (deviceCode) void Pasteboard.setString(deviceCode);
  }, []);

  async function copyDeviceCode(code: string) {
    await Pasteboard.setString(code);
    await Dialog.alert({
      title: "已复制设备码",
      message: "请在 GitHub 设备授权页粘贴或输入该设备码。",
      buttonLabel: "知道了",
    });
  }

  async function openGitHubDevicePage() {
    try {
      await openPendingAuthorizationPage("copilot");
    } catch (error) {
      await Dialog.alert({
        title: "无法打开授权页",
        message:
          error instanceof Error && error.message
            ? error.message
            : "授权会话可能已过期，请取消后重新开始。",
        buttonLabel: "关闭",
      });
    }
  }
  return (
    <NavigationStack>
      <List
        navigationTitle={`连接 ${meta.title}`}
        navigationBarTitleDisplayMode="inline"
        scrollContentBackground="hidden"
        listStyle="plain"
        listRowSpacing={12}
        listSectionSpacing={12}
        contentMargins={{
          edges: "horizontal",
          insets: 16,
          placement: "scrollContent",
        }}
        background={<PageBackground theme={props.backgroundTheme} />}
        toolbar={{
          cancellationAction: <Button title="取消" action={props.onCancel} />,
        }}
      >
        <Section
          listRowBackground={authRowBackground}
          footer={
            <Text font="caption" foregroundStyle="secondaryLabel">
              {meta.pasteHint}
            </Text>
          }
        >
          <VStack
            spacing={0}
            frame={{ maxWidth: "infinity" }}
            listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
          >
            {deviceCode ? (
              <Button
                buttonStyle="plain"
                frame={{ maxWidth: "infinity" }}
                action={() => copyDeviceCode(deviceCode)}
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
                    <Text font="title3" fontWeight="bold" monospaced>
                      {deviceCode}
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
            ) : null}
            {deviceCode ? <Divider /> : null}
            {deviceCode ? (
              <Button
                buttonStyle="plain"
                frame={{ maxWidth: "infinity" }}
                action={() => void openGitHubDevicePage()}
              >
                <HStack
                  padding={{ vertical: true }}
                  frame={{ minHeight: 44, maxWidth: "infinity" }}
                  contentShape="rect"
                >
                  <Image
                    systemName="safari"
                    imageScale="medium"
                    foregroundStyle="accentColor"
                  />
                  <Text foregroundStyle="accentColor" fontWeight="semibold">
                    打开 GitHub 授权页
                  </Text>
                  <Spacer />
                </HStack>
              </Button>
            ) : null}
            {deviceCode ? <Divider /> : null}
            {status ? (
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
              >
                <Text
                  font="subheadline"
                  foregroundStyle={
                    statusFailed
                      ? "systemRed"
                      : statusInProgress
                        ? "secondaryLabel"
                        : undefined
                  }
                >
                  {status}
                </Text>
                <Spacer />
              </HStack>
            ) : null}
            {status ? <Divider /> : null}
            <TextField
              title="授权内容"
              value={props.authSheet.authorizationInput}
              onChanged={props.onChangeInput}
              prompt={meta.pastePlaceholder}
              padding={{ vertical: true }}
              frame={{ minHeight: 44, maxWidth: "infinity" }}
            />
            <Divider />
            <Button
              buttonStyle="plain"
              frame={{ maxWidth: "infinity" }}
              disabled={submitDisabled}
              action={props.onSubmit}
            >
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
                contentShape="rect"
              >
                <Text foregroundStyle="accentColor" fontWeight="semibold">
                  提交并完成授权
                </Text>
                <Spacer />
              </HStack>
            </Button>
          </VStack>
        </Section>
      </List>
    </NavigationStack>
  );
}
