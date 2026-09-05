import { NavigationStack, Spacer, VStack } from "scripting";
import { EmptyState } from "../ui/common";
import { GlassActionRow, GlassDivider } from "../ui/glass";
import { PageBackground } from "../ui/page-background";
import { useRootToolbar } from "./root-toolbar";

const CARD_RADIUS = 20;

export function TokenRequiredPage(props: {
  navigationTitle: string;
  onOpenSettings: () => void;
}) {
  const toolbar = useRootToolbar();
  return (
    <NavigationStack>
      <VStack
        spacing={0}
        frame={{ maxWidth: "infinity", maxHeight: "infinity" }}
        navigationTitle={props.navigationTitle}
        navigationBarTitleDisplayMode="inline"
        background={<PageBackground />}
        safeAreaPadding={{ bottom: 84 }}
        toolbar={toolbar}
      >
        <Spacer />
        <VStack padding={{ horizontal: 16 }} frame={{ maxWidth: "infinity" }}>
          <VStack
            spacing={0}
            padding={{ horizontal: 16 }}
            frame={{ maxWidth: "infinity" }}
            glassEffect={{
              glass: UIGlass.regular(),
              shape: {
                type: "rect",
                cornerRadius: CARD_RADIUS,
                style: "continuous",
              },
            }}
          >
            <EmptyState
              title="未配置 GitHub Token"
              detail="请先在设置中配置 Token"
            />
            <GlassDivider />
            <GlassActionRow
              title="前往设置"
              centered
              action={props.onOpenSettings}
            />
          </VStack>
        </VStack>
        <Spacer />
      </VStack>
    </NavigationStack>
  );
}
