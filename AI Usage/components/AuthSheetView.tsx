import {
  Button,
  Divider,
  HStack,
  List,
  NavigationStack,
  Section,
  Spacer,
  Text,
  TextField,
  VStack,
} from "scripting";
import { providerMeta, type AuthSheet } from "../models";
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
