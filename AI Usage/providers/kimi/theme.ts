import type { Color, DynamicShapeStyle } from "scripting";

/** Kimi Code 品牌主色（与 models.ts accent 对齐） */
export const KIMI_ACCENT = "#4F46E5";

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

export type KimiBadgePalette = {
  text: string;
  background: DynamicShapeStyle;
  foreground: Color;
  /** 是否在徽章上保留 Logo 原色（高档位更醒目） */
  logoTint?: Color;
};

function normalizeTier(label: string): string {
  return label
    .trim()
    .toLowerCase()
    .replace(/^level[_-]?/, "")
    .replace(/^membership[_-]?/, "")
    .replace(/^plan[_-]?/, "")
    .replace(/[\s_]+/g, "-");
}

/** 套餐徽章配色：Allegro → Andante 逐级降低饱和度 */
export function kimiBadgePalette(label: string): KimiBadgePalette {
  const tier = normalizeTier(label);

  if (tier === "allegro" || tier === "vivace" || tier === "ultra") {
    return {
      text: tier === "ultra" ? "ALLEGRO" : tier.toUpperCase(),
      background: linear(
        ["#0A0A12", "#312E81", "#6366F1", "#8B5CF6"],
        ["#000000", "#1E1B4B", "#4F46E5", "#A78BFA"],
      ),
      foreground: "#F5F3FF",
    };
  }
  if (tier === "allegretto" || tier === "advanced" || tier === "pro") {
    return {
      text: "ALLEGRETTO",
      background: linear(
        ["#1E1B4B", "#4338CA", "#6366F1"],
        ["#1E1B4B", "#4F46E5", "#818CF8"],
      ),
      foreground: "#EEF2FF",
    };
  }
  if (tier === "moderato" || tier === "intermediate") {
    return {
      text: "MODERATO",
      background: linear(
        ["#1E3A8A", "#3730A3", "#4F46E5"],
        ["#1E3A8A", "#4338CA", "#6366F1"],
      ),
      foreground: "#EFF6FF",
    };
  }
  if (tier === "andante" || tier === "basic") {
    return {
      text: "ANDANTE",
      background: linear(
        ["#334155", "#475569", "#6366F1"],
        ["#1E293B", "#475569", "#818CF8"],
      ),
      foreground: "#F8FAFC",
    };
  }
  if (tier === "free" || tier === "adagio") {
    return {
      text: "FREE",
      background: linear(
        ["#94A3B8", "#64748B"],
        ["#64748B", "#475569"],
      ),
      foreground: "#FFFFFF",
    };
  }

  const display = label.trim().toUpperCase() || "KIMI";
  return {
    text: display === "KIMI CODE" ? "KIMI" : display,
    background: linear(
      ["#111827", "#312E81", "#4F46E5"],
      ["#0F172A", "#1E1B4B", "#6366F1"],
    ),
    foreground: "#EEF2FF",
  };
}

/** 小组件专用色板 */
export function kimiWidgetColors(): Record<string, Color | DynamicShapeStyle> {
  const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
    light,
    dark,
  });
  return {
    bg: "systemBackground",
    primary: "label",
    secondary: "secondaryLabel",
    accent: dynamic(KIMI_ACCENT, "#818CF8"),
    accentSoft: dynamic("rgba(79,70,229,0.12)", "rgba(129,140,248,0.18)"),
    track: dynamic("#E0E7FF", "#312E81"),
    trackBorder: dynamic("rgba(79,70,229,0.15)", "rgba(129,140,248,0.22)"),
    warn: "systemOrange",
    watermark: dynamic("rgba(79,70,229,0.10)", "rgba(129,140,248,0.14)"),
    capsuleBg: dynamic(KIMI_ACCENT, "#6366F1"),
    capsuleFg: "#FFFFFF",
  };
}

export const KIMI_WIDGET = {
  fiveHourTitle: "5 小时额度",
  weeklyTitle: "每周额度",
  shortFiveHour: "5h",
  shortWeekly: "Weekly",
};
