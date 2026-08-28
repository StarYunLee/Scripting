import type { Color, DynamicShapeStyle } from "scripting";

export type PlanBadgeRecipe = {
  text: string;
  background: DynamicShapeStyle;
  foreground: Color | DynamicShapeStyle;
  preserveLogoColor?: boolean;
};

export type PlanBadgeResolver = (label: string) => PlanBadgeRecipe;

export const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
  light,
  dark,
});

export const linear = (
  light: Color[],
  dark: Color[] = light,
): DynamicShapeStyle => ({
  light: {
    gradient: light.map((color, index) => ({
      color,
      location: light.length > 1 ? index / (light.length - 1) : 0,
    })),
    startPoint: "leading" as const,
    endPoint: "trailing" as const,
  },
  dark: {
    gradient: dark.map((color, index) => ({
      color,
      location: dark.length > 1 ? index / (dark.length - 1) : 0,
    })),
    startPoint: "leading" as const,
    endPoint: "trailing" as const,
  },
});

export function normalizePlan(label: string, providerPrefix?: string): string {
  let value = label
    .replace(/DEMO\s*[·•|-]?\s*/i, "")
    .trim()
    .toLowerCase();
  if (providerPrefix) {
    value = value.replace(new RegExp(`^${providerPrefix}\\s+`, "i"), "");
  }
  return value.replace(/×/g, "x").replace(/[\s_]+/g, "-");
}
