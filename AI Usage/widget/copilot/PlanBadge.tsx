import { HStack, Text } from "scripting";
import { ProviderLogo } from "../../components/ProviderLogo";
import { copilotBadgePalette } from "../../providers/copilot/theme";

export function PlanBadge({
  label,
  small = false,
}: {
  label: string;
  small?: boolean;
}) {
  const p = copilotBadgePalette(label);
  const showTier = p.text !== "COPILOT";
  return (
    <HStack
      spacing={small ? 5 : 6}
      padding={{ horizontal: small ? 8 : 10, vertical: small ? 3 : 4 }}
      background={p.background}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      <ProviderLogo
        provider="copilot"
        size={small ? 10 : 11}
        tint={p.foreground}
      />
      {showTier ? (
        <Text
          font={small ? 9 : 10}
          fontWeight="bold"
          foregroundStyle={p.foreground}
          lineLimit={1}
          minScaleFactor={0.65}
        >
          {p.text}
        </Text>
      ) : null}
    </HStack>
  );
}
