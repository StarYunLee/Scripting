import { HStack, Text } from "scripting";
import type { Color, DynamicShapeStyle } from "scripting";
import type { ProviderId } from "../models";
import { ProviderLogo } from "./ProviderLogo";
import { kimiBadgePalette } from "../providers/kimi/theme";
import { copilotBadgePalette } from "../providers/copilot/theme";
import { zaiBadgePalette } from "../providers/zai/theme";

const linear = (light: Color[], dark: Color[] = light): DynamicShapeStyle => ({
  light: {
    gradient: light.map((color, index) => ({
      color,
      location: index / (light.length - 1),
    })),
    startPoint: "leading" as const,
    endPoint: "trailing" as const,
  },
  dark: {
    gradient: dark.map((color, index) => ({
      color,
      location: index / (dark.length - 1),
    })),
    startPoint: "leading" as const,
    endPoint: "trailing" as const,
  },
});

function normalize(label: string): string {
  return label
    .replace(/DEMO\s*[·•|-]?\s*/i, "")
    .trim()
    .toLowerCase()
    .replace(/^claude\s+/, "")
    .replace(/×/g, "x")
    .replace(/[\s_]+/g, "-");
}

type BadgePalette = {
  text: string;
  background: DynamicShapeStyle;
  foreground: Color;
};

function palette(provider: ProviderId, label: string): BadgePalette {
  const normalized = normalize(label);

  if (provider === "grok") {
    if (
      normalized === "supergrok-heavy" ||
      normalized === "supergrokheavy" ||
      normalized === "heavy"
    ) {
      return {
        text: "SUPERGROK HEAVY",
        background: linear(
          ["#000000", "#064E3B", "#0F766E"],
          ["#000000", "#065F46", "#0D9488"],
        ),
        foreground: "#ECFDF5",
      };
    }
    if (normalized === "supergrok") {
      return {
        text: "SUPERGROK",
        background: linear(["#171717", "#047857"], ["#262626", "#059669"]),
        foreground: "#ECFDF5",
      };
    }
    return {
      text: label.trim().toUpperCase() || "GROK",
      background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
      foreground: "#FFFFFF",
    };
  }

  if (provider === "antigravity") {
    return {
      text: label.trim().toUpperCase() || "ANTIGRAVITY",
      background: linear(["#475569", "#2563EB"], ["#64748B", "#3B82F6"]),
      foreground: "#FFFFFF",
    };
  }

  if (provider === "cursor") {
    if (normalized === "ultra")
      return {
        text: "ULTRA",
        background: linear(["#111827", "#7C3AED"], ["#1F2937", "#8B5CF6"]),
        foreground: "#F5F3FF",
      };
    if (normalized === "pro")
      return {
        text: "PRO",
        background: linear(["#1E293B", "#0EA5E9"], ["#334155", "#38BDF8"]),
        foreground: "#F8FAFC",
      };
    if (normalized === "team" || normalized === "business")
      return {
        text: normalized.toUpperCase(),
        background: linear(["#312E81", "#4F46E5"], ["#4338CA", "#6366F1"]),
        foreground: "#FFFFFF",
      };
    if (normalized === "enterprise")
      return {
        text: "ENTERPRISE",
        background: linear(["#0F172A", "#334155"], ["#1E293B", "#475569"]),
        foreground: "#F8FAFC",
      };
    return {
      text: label.trim().toUpperCase() || "CURSOR",
      background: linear(["#111827", "#374151"], ["#1F2937", "#4B5563"]),
      foreground: "#F9FAFB",
    };
  }

  if (provider === "kimi") {
    const p = kimiBadgePalette(label);
    return {
      text: p.text,
      background: p.background,
      foreground: p.foreground,
    };
  }

  if (provider === "copilot") {
    const p = copilotBadgePalette(label);
    return {
      text: p.text,
      background: p.background,
      foreground: p.foreground,
    };
  }

  if (provider === "zai") {
    const p = zaiBadgePalette(label);
    return {
      text: p.text,
      background: p.background,
      foreground: p.foreground,
    };
  }

  if (provider === "claude") {
    if (normalized === "max-20x") {
      return {
        text: "MAX 20X",
        background: linear(
          ["#F59E0B", "#EA580C", "#E5254F"],
          ["#FBBF24", "#F97316", "#F43F5E"],
        ),
        foreground: "#000000",
      };
    }
    if (normalized === "max-5x") {
      return {
        text: "MAX 5X",
        background: linear(
          ["#F97316", "#F59E0B", "#F43F5E"],
          ["#FB923C", "#FBBF24", "#FB7185"],
        ),
        foreground: "#000000",
      };
    }
    if (normalized === "pro") {
      return {
        text: "PRO",
        background: linear(["#FCD34D", "#FACC15", "#F59E0B"]),
        foreground: "#000000",
      };
    }
    if (normalized.startsWith("team")) {
      return {
        text: "TEAM",
        background: linear(["#8B5CF6", "#4F46E5"], ["#A78BFA", "#6366F1"]),
        foreground: "#FFFFFF",
      };
    }
    if (normalized === "enterprise" || normalized.startsWith("enterprise")) {
      return {
        text: "ENTERPRISE",
        background: linear(["#0F172A", "#334155"], ["#1E293B", "#475569"]),
        foreground: "#F8FAFC",
      };
    }
    if (normalized === "max") {
      return {
        text: "MAX",
        background: linear(
          ["#F97316", "#F59E0B", "#F43F5E"],
          ["#FB923C", "#FBBF24", "#FB7185"],
        ),
        foreground: "#000000",
      };
    }
    return {
      text:
        label
          .replace(/^Claude\s+/i, "")
          .trim()
          .toUpperCase() || "CLAUDE",
      background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
      foreground: "#FFFFFF",
    };
  }

  if (normalized === "plus") {
    return {
      text: "PLUS",
      background: linear(
        ["#F1F5F9", "#E4E4E7", "#CBD5E1"],
        ["#D4D4D8", "#94A3B8", "#71717A"],
      ),
      foreground: "#1E293B",
    };
  }
  if (normalized === "pro-20x") {
    return {
      text: "PRO 20X",
      background: linear(
        ["#FDE047", "#F59E0B", "#EA580C"],
        ["#FDE047", "#FBBF24", "#F97316"],
      ),
      foreground: "#000000",
    };
  }
  if (normalized === "pro-5x") {
    return {
      text: "PRO 5X",
      background: linear(
        ["#FBBF24", "#EAB308", "#FB923C"],
        ["#FBBF24", "#FACC15", "#FB923C"],
      ),
      foreground: "#000000",
    };
  }
  if (normalized === "pro" || normalized === "chatgptpro") {
    return {
      text: "PRO",
      background: linear(["#FCD34D", "#FACC15", "#F59E0B"]),
      foreground: "#000000",
    };
  }
  if (normalized === "team") {
    return {
      text: "TEAM",
      background: linear(["#8B5CF6", "#4F46E5"], ["#A78BFA", "#6366F1"]),
      foreground: "#FFFFFF",
    };
  }
  return {
    text: label.trim().toUpperCase() || "CODEX",
    background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
    foreground: "#FFFFFF",
  };
}

export function PlanBadge(props: {
  provider: ProviderId;
  label: string;
  small?: boolean;
}) {
  const providerId = props.provider;
  const p = palette(providerId, props.label);
  const rawPlanText =
    props.small && p.text === "SUPERGROK HEAVY" ? "HEAVY" : p.text;
  const providerText =
    props.provider === "codex"
      ? "CODEX"
      : props.provider === "grok"
        ? "GROK"
        : props.provider === "claude"
          ? "CLAUDE"
          : props.provider === "cursor"
            ? "CURSOR"
            : props.provider === "kimi"
              ? "KIMI"
              : props.provider === "copilot"
                ? "COPILOT"
                : props.provider === "zai"
                  ? "Z.AI"
                  : "ANTIGRAVITY";
  const planText = rawPlanText === providerText ? "" : rawPlanText;
  return (
    <HStack
      spacing={props.small ? 5 : 6}
      padding={{
        horizontal: props.small ? 8 : 10,
        vertical: props.small ? 3 : 4,
      }}
      background={p.background}
      clipShape={{ type: "capsule", style: "continuous" }}
    >
      <ProviderLogo
        provider={providerId}
        size={props.small ? 10 : 11}
        tint={providerId === "antigravity" ? undefined : p.foreground}
      />
      {planText ? (
        <Text
          fontDesign="default"
          fontWidth="standard"
          font={props.small ? 9 : 10}
          fontWeight="bold"
          foregroundStyle={p.foreground}
          lineLimit={1}
          minScaleFactor={0.65}
        >
          {planText}
        </Text>
      ) : null}
    </HStack>
  );
}
