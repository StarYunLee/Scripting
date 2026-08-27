import type { Color, DynamicShapeStyle } from "scripting";

/** MiniMax 品牌主色（橙红） */
export const MINIMAX_ACCENT = "#E85D04";

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

export type MinimaxBadgePalette = {
  text: string;
  background: DynamicShapeStyle;
  foreground: Color;
};

function normalizeTier(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/coding\s*plan\s*/g, "")
    .replace(/token\s*plan\s*/g, "")
    .replace(/minimax\s*/g, "")
    .replace(/[\s_]+/g, "-");
}

export function minimaxBadgePalette(label: string): MinimaxBadgePalette {
  const tier = normalizeTier(label);

  if (tier === "ultra") {
    return {
      text: "ULTRA",
      background: linear(
        ["#7C2D12", "#C2410C", "#EA580C"],
        ["#7C2D12", "#EA580C", "#FB923C"],
      ),
      foreground: "#FFF7ED",
    };
  }
  if (tier === "max") {
    return {
      text: "MAX",
      background: linear(
        ["#9A3412", "#E85D04", "#F97316"],
        ["#9A3412", "#F97316", "#FDBA74"],
      ),
      foreground: "#FFF7ED",
    };
  }
  if (tier === "pro" || tier === "plus") {
    return {
      text: tier === "plus" ? "PLUS" : "PRO",
      background: linear(
        ["#C2410C", "#E85D04", "#FB923C"],
        ["#C2410C", "#F97316", "#FDBA74"],
      ),
      foreground: "#FFF7ED",
    };
  }
  if (tier === "free" || tier === "starter") {
    return {
      text: tier === "starter" ? "STARTER" : "FREE",
      background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
      foreground: "#FFFFFF",
    };
  }

  const display = label.trim().toUpperCase() || "MINIMAX";
  return {
    text: display.length > 12 ? "MINIMAX" : display,
    background: linear(
      ["#7C2D12", "#C2410C", "#E85D04"],
      ["#7C2D12", "#EA580C", "#F97316"],
    ),
    foreground: "#FFF7ED",
  };
}

export function minimaxWidgetColors(): Record<string, Color | DynamicShapeStyle> {
  const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
    light,
    dark,
  });
  return {
    bg: "systemBackground",
    primary: "label",
    secondary: "secondaryLabel",
    accent: dynamic(MINIMAX_ACCENT, "#FB923C"),
    accentSoft: dynamic("rgba(232,93,4,0.12)", "rgba(251,146,60,0.18)"),
    track: dynamic("#FFEDD5", "#9A3412"),
    trackBorder: dynamic("rgba(232,93,4,0.15)", "rgba(251,146,60,0.22)"),
    warn: "systemOrange",
    watermark: dynamic("rgba(232,93,4,0.10)", "rgba(251,146,60,0.14)"),
    capsuleBg: dynamic(MINIMAX_ACCENT, "#F97316"),
    capsuleFg: "#FFFFFF",
  };
}

export const MINIMAX_WIDGET = {
  fiveHourTitle: "5 小时额度",
  weeklyTitle: "每周额度",
  shortFiveHour: "5h",
  shortWeekly: "Weekly",
};
