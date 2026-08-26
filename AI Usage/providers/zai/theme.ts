import type { Color, DynamicShapeStyle } from "scripting";

/** Z.ai / 智谱品牌主色（青绿） */
export const ZAI_ACCENT = "#0EA5A8";

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

export type ZaiBadgePalette = {
  text: string;
  background: DynamicShapeStyle;
  foreground: Color;
};

function normalizeTier(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/glm\s*coding\s*/g, "")
    .replace(/[\s_]+/g, "-");
}

export function zaiBadgePalette(label: string): ZaiBadgePalette {
  const tier = normalizeTier(label);

  if (tier === "max" || tier === "ultra") {
    return {
      text: tier === "ultra" ? "ULTRA" : "MAX",
      background: linear(
        ["#042F2E", "#0F766E", "#14B8A6"],
        ["#022C22", "#0D9488", "#2DD4BF"],
      ),
      foreground: "#F0FDFA",
    };
  }
  if (tier === "pro" || tier === "pro-plus") {
    return {
      text: tier === "pro-plus" ? "PRO+" : "PRO",
      background: linear(
        ["#134E4A", "#0EA5A8", "#14B8A6"],
        ["#115E59", "#14B8A6", "#5EEAD4"],
      ),
      foreground: "#F0FDFA",
    };
  }
  if (tier === "lite") {
    return {
      text: "LITE",
      background: linear(
        ["#155E75", "#0891B2", "#22D3EE"],
        ["#164E63", "#06B6D4", "#67E8F9"],
      ),
      foreground: "#ECFEFF",
    };
  }
  if (tier === "free") {
    return {
      text: "FREE",
      background: linear(["#94A3B8", "#64748B"], ["#64748B", "#475569"]),
      foreground: "#FFFFFF",
    };
  }

  const display = label.trim().toUpperCase() || "Z.AI";
  return {
    text: display.length > 12 ? "Z.AI" : display,
    background: linear(
      ["#042F2E", "#0F766E", "#0EA5A8"],
      ["#022C22", "#115E59", "#14B8A6"],
    ),
    foreground: "#F0FDFA",
  };
}

export function zaiWidgetColors(): Record<string, Color | DynamicShapeStyle> {
  const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
    light,
    dark,
  });
  return {
    bg: "systemBackground",
    primary: "label",
    secondary: "secondaryLabel",
    accent: dynamic(ZAI_ACCENT, "#2DD4BF"),
    accentSoft: dynamic("rgba(14,165,168,0.12)", "rgba(45,212,191,0.18)"),
    track: dynamic("#CCFBF1", "#115E59"),
    trackBorder: dynamic("rgba(14,165,168,0.15)", "rgba(45,212,191,0.22)"),
    warn: "systemOrange",
    watermark: dynamic("rgba(14,165,168,0.10)", "rgba(45,212,191,0.14)"),
    capsuleBg: dynamic(ZAI_ACCENT, "#14B8A6"),
    capsuleFg: "#FFFFFF",
  };
}

export const ZAI_WIDGET = {
  fiveHourTitle: "5 小时额度",
  weeklyTitle: "每周额度",
  monthlyTitle: "每月额度",
  shortFiveHour: "5h",
  shortWeekly: "Weekly",
  shortMonthly: "Monthly",
};
