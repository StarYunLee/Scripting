import {
  Button,
  Menu,
  Navigation,
  Spacer,
  Text,
  Toolbar,
  ToolbarItem,
  VStack,
} from "scripting";
import { PROVIDERS, providerMeta, type ProviderId } from "../models";
import { PageBackground } from "./PageBackground";
import type { BackgroundThemeId } from "../services/settings";

export function ConnectEmptyView(props: {
  provider: ProviderId;
  backgroundTheme: BackgroundThemeId;
  onSelectProvider: (id: ProviderId) => void;
  onConnect: () => void;
}) {
  const meta = providerMeta(props.provider);
  const dismiss = Navigation.useDismiss();

  return (
    <VStack
      spacing={0}
      frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
      navigationTitle=""
      navigationBarTitleDisplayMode="inline"
      background={<PageBackground theme={props.backgroundTheme} />}
      toolbar={
        <Toolbar>
          <ToolbarItem placement="topBarLeading">
            <Button
              title="返回"
              systemImage="chevron.left"
              labelStyle="iconOnly"
              action={dismiss}
            />
          </ToolbarItem>
          <ToolbarItem placement="topBarTrailing">
            <Menu title={meta.title}>
              {PROVIDERS.map((item) => (
                <Button
                  key={item.id}
                  title={item.title}
                  systemImage={
                    item.id === props.provider ? "checkmark" : undefined
                  }
                  action={() => props.onSelectProvider(item.id)}
                />
              ))}
            </Menu>
          </ToolbarItem>
        </Toolbar>
      }
    >
      <Spacer />
      <VStack
        spacing={16}
        padding={{ horizontal: 12, vertical: 24 }}
        frame={{ maxWidth: "infinity" }}
      >
        <Text font={28} fontWeight="bold" multilineTextAlignment="center">
          连接 {meta.title}
        </Text>
        <Text
          font={15}
          foregroundStyle="secondaryLabel"
          multilineTextAlignment="center"
          lineLimit={2}
          minScaleFactor={0.9}
          frame={{ minHeight: 44, maxWidth: "infinity" }}
        >
          {meta.subtitle}
        </Text>
        <Button
          action={props.onConnect}
          controlSize="large"
          buttonStyle="glassProminent"
          buttonBorderShape="capsule"
          tint={meta.accent === "#111111" ? "label" : meta.accent}
        >
          <Text
            font={17}
            fontWeight="semibold"
            multilineTextAlignment="center"
            frame={{ width: 300, height: 28 }}
          >
            {meta.connectTitle}
          </Text>
        </Button>
      </VStack>
      <Spacer />
    </VStack>
  );
}
