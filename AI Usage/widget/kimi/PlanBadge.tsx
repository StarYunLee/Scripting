import { HStack, Text } from "scripting";
import { ProviderLogo } from "../../components/ProviderLogo";
import { kimiBadgePalette } from "../../providers/kimi/theme";

export function PlanBadge({
  label,
  small = false,
}: {
  label: string;
  small?: boolean;
}) {
  const p = kimiBadgePalette(label);
  const showTier = p.text !== "KIMI";
  return (
    <HStack
      spacing={small ? 5 : 6}
      padding={{ horizontal: small ? 8 : 10, vertical: small ? 3 : 4 }}
      background={p.background}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      <ProviderLogo
        provider="kimi"
        size={small ? 10 : 11}
        tint={p.logoTint ?? p.foreground}
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
