import type { VStackProps } from "scripting";
import { VStack } from "scripting";

const CARD_RADIUS = 20;

/** ScrollView 内玻璃卡片（图标网格等）。 */
export function GlassCard(props: {
  children: VStackProps["children"];
  padding?: number;
  spacing?: number;
  alignment?: VStackProps["alignment"];
}) {
  return (
    <VStack
      alignment={props.alignment ?? "center"}
      spacing={props.spacing ?? 0}
      padding={props.padding ?? 14}
      frame={{ maxWidth: "infinity" }}
      glassEffect={{
        glass: UIGlass.regular(),
        shape: {
          type: "rect",
          cornerRadius: CARD_RADIUS,
          style: "continuous",
        },
      }}
      shadow={{ color: "rgba(72,88,120,0.16)", radius: 12, y: 5 }}
    >
      {props.children}
    </VStack>
  );
}
