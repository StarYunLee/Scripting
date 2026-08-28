import type { VStackProps } from "scripting";
import { VStack } from "scripting";

export const ICON_GLASS_TILE_SIZE = 80;

/** 图标网格的固定尺寸玻璃底板；只使用系统玻璃，不附加外部阴影。 */
export function IconGlassTile(props: { children: VStackProps["children"] }) {
  return (
    <VStack
      padding={8}
      frame={{
        width: ICON_GLASS_TILE_SIZE,
        height: ICON_GLASS_TILE_SIZE,
      }}
      glassEffect={{
        glass: UIGlass.regular(),
        shape: {
          type: "rect",
          cornerRadius: 20,
          style: "continuous",
        },
      }}
    >
      {props.children}
    </VStack>
  );
}
