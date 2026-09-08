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
} from "scripting";
import { providerMeta, type AuthSheet } from "../models";
import { openAuthorizationPage } from "../services/browser";
import { PageBackground } from "./PageBackground";
import {
  GlassDivider,
  GlassGroup,
  GlassNoteRow,
  glassRowBackground,
} from "./GlassList";
import type { BackgroundThemeId } from "../services/settings";

export function AuthSheetView(props: {
  authSheet: AuthSheet;
  backgroundTheme: BackgroundThemeId;
  onChangeInput: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  const meta = providerMeta(props.authSheet.provider);

  async function copyDeviceCode(code: string) {
    await Pasteboard.setString(code);
    await Dialog.alert({
      title: "已复制设备码",
      message: "现在可以手动打开 GitHub 授权页并粘贴该设备码。",
      buttonLabel: "知道了",
    });
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
          cancellationAction: <Button title="取消" action={props.onCancel} />,
        }}
      >
        <Section listRowBackground={glassRowBackground}>
          <GlassGroup>
            {props.authSheet.status ? (
              <HStack
                padding={{ vertical: true }}
                frame={{ minHeight: 44, maxWidth: "infinity" }}
              >
                <Text>{props.authSheet.status}</Text>
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
            <GlassNoteRow text={meta.pasteHint} />
          </GlassGroup>
        </Section>

        <Section
          listRowBackground={<Rectangle fill="clear" />}
          listRowSeparator="hidden"
          listRowInsets={{ top: 0, bottom: 0, leading: 16, trailing: 16 }}
        >
          <HStack spacing={12} frame={{ maxWidth: "infinity" }}>
            <Spacer />
            {props.authSheet.authorizationUrl ? (
              <Button
                controlSize="large"
                buttonStyle="glass"
                buttonBorderShape="capsule"
                action={() => {
                  void openAuthorizationPage(
                    props.authSheet.authorizationUrl!,
                  ).catch(async (error) => {
                    await Dialog.alert({
                      title: "无法打开授权页",
                      message:
                        error instanceof Error && error.message
                          ? error.message
                          : "请稍后重试。",
                      buttonLabel: "关闭",
                    });
                  });
                }}
              >
                <HStack
                  spacing={8}
                  frame={{ width: 128, height: 28 }}
                  contentShape="rect"
                >
                  <Spacer />
                  <Image systemName="safari" imageScale="medium" />
                  <Text font={16} fontWeight="medium">
                    {props.authSheet.deviceCode ? "继续授权" : "重新授权"}
                  </Text>
                  <Spacer />
                </HStack>
              </Button>
            ) : null}
            <Button
              controlSize="large"
              buttonStyle="glassProminent"
              buttonBorderShape="capsule"
              tint={meta.accent === "#111111" ? "label" : meta.accent}
              action={props.onSubmit}
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
      </List>
    </NavigationStack>
  );
}
