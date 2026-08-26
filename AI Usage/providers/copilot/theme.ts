import type { Color, DynamicShapeStyle } from "scripting";

/** GitHub Copilot 品牌色 */
export const COPILOT_ACCENT = "#8957E5";

const linear = (light: Color[], dark: Color[]): DynamicShapeStyle => ({
  light: {
    gradient: light.map((color, index) => ({
      color,
      location: index / (light.length - 1),
    })),
    startPoint: "leading",
    endPoint: "trailing",
  },
  dark: {
    gradient: dark.map((color, index) => ({
      color,
      location: index / (dark.length - 1),
    })),
    startPoint: "leading",
    endPoint: "trailing",
  },
});

export type CopilotBadgePalette = {
  text: string;
  background: DynamicShapeStyle;
  foreground: Color;
};

function normalizeTier(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/\+/g, "-plus");
}

export function copilotBadgePalette(label: string): CopilotBadgePalette {
  const tier = normalizeTier(label);

  if (tier === "enterprise") {
    return {
      text: "ENTERPRISE",
      background: linear(["#0F172A", "#334155"], ["#1E293B", "#475569"]),
      foreground: "#F8FAFC",
    };
  }
  if (tier === "business") {
    return {
      text: "BUSINESS",
      background: linear(["#312E81", "#4F46E5"], ["#4338CA", "#6366F1"]),
      foreground: "#FFFFFF",
    };
  }
  if (tier === "pro-plus" || tier === "proplus") {
    return {
      text: "PRO+",
      background: linear(
        ["#581C87", "#8957E5", "#A855F7"],
        ["#6B21A8", "#9333EA", "#C084FC"],
      ),
      foreground: "#FAF5FF",
    };
  }
  if (tier === "pro") {
    return {
      text: "PRO",
      background: linear(
        ["#4C1D95", "#8957E5", "#7C3AED"],
        ["#5B21B6", "#9333EA", "#A78BFA"],
      ),
      foreground: "#F5F3FF",
    };
  }
  if (tier === "free" || tier === "individual") {
    return {
      text: tier === "individual" ? "INDIVIDUAL" : "FREE",
      background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
      foreground: "#FFFFFF",
    };
  }

  const display = label.trim().toUpperCase() || "COPILOT";
  return {
    text: display === "COPILOT" ? "COPILOT" : display,
    background: linear(
      ["#111827", "#581C87", "#8957E5"],
      ["#0F172A", "#6B21A8", "#9333EA"],
    ),
    foreground: "#F5F3FF",
  };
}

export function copilotWidgetColors(): Record<string, Color | DynamicShapeStyle> {
  const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
    light,
    dark,
  });
  return {
    bg: "systemBackground",
    primary: "label",
    secondary: "secondaryLabel",
    accent: dynamic(COPILOT_ACCENT, "#A78BFA"),
    accentSoft: dynamic("rgba(137,87,229,0.12)", "rgba(167,139,250,0.18)"),
    track: dynamic("#EDE9FE", "#4C1D95"),
    trackBorder: dynamic("rgba(137,87,229,0.15)", "rgba(167,139,250,0.22)"),
    warn: "systemOrange",
    watermark: dynamic("rgba(137,87,229,0.10)", "rgba(167,139,250,0.14)"),
    capsuleBg: dynamic(COPILOT_ACCENT, "#9333EA"),
    capsuleFg: "#FFFFFF",
  };
}

export const COPILOT_WIDGET = {
  creditsTitle: "AI Credits",
  chatTitle: "Chat",
  completionsTitle: "Completions",
  shortCredits: "Credits",
  shortChat: "Chat",
  shortCompletions: "Comp",
};
