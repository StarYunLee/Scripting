import { Widget } from "scripting";
import type { Color, DynamicShapeStyle, ShapeStyle } from "scripting";

const dynamic = (light: Color, dark: Color): DynamicShapeStyle => ({
  light,
  dark,
});

/**
 * 判断当前小组件是否启用了透明背景模式。
 * 兼容 Scripting 标准声明与潜在的宿主变体字段。
 */
export function isWidgetTransparent(): boolean {
  try {
    const w = Widget as {
      isTransparentBackground?: boolean;
      isTransparentMode?: boolean;
      isBlurMode?: boolean;
    };
    return Boolean(w.isTransparentBackground || w.isTransparentMode || w.isBlurMode);
  } catch {
    return false;
  }
}

/**
 * 小组件统一配色体系：根据是否开启透明小组件返回对应的视觉配置。
 */
export function getWidgetPalette(isTransparent: boolean) {
  if (isTransparent) {
    return {
      isTransparent: true,
      // 黄金甜点位微透底板：15% 半透黑，纯色壁纸通透，复杂人像/花壁纸有效压制高频高光
      bg: "rgba(0, 0, 0, 0.15)" as Color as ShapeStyle,
      // 核心标题与数值：通透纯白高亮
      primary: "#FFFFFF" as Color,
      // 倒计时、副标题：高对比度白半透明
      secondary: "rgba(255, 255, 255, 0.88)" as Color,
      // 仪表盘单元分割线：微收透明度至 10%，减少对画面的切碎感
      divider: "rgba(255, 255, 255, 0.10)" as Color,
      accent: "#64D2FF" as Color,
      warn: "#FF9F0A" as Color,
      // 进度条轨道底槽：通透白半透明槽
      track: "rgba(255, 255, 255, 0.16)" as Color,
      trackBorder: "clear" as Color,
      // 进度条用量状态色：清透苹果亮绿
      progressNormal: "#30D158" as Color,
      progressWarning: "#FF9F0A" as Color,
      progressCritical: "#FF453A" as Color,
      // 文字柔和微暗影：配合 15% 暗底提供清晰浮凸感
      textShadow: {
        color: "rgba(0, 0, 0, 0.40)" as Color,
        radius: 2,
        x: 0,
        y: 1,
      },
    };
  }

  return {
    isTransparent: false,
    bg: "systemBackground" as Color as ShapeStyle,
    primary: "label" as Color,
    secondary: "secondaryLabel" as Color,
    divider: dynamic("rgba(60, 60, 67, 0.12)", "rgba(235, 235, 245, 0.16)"),
    accent: "systemBlue" as Color,
    warn: "systemOrange" as Color,
    track: dynamic("#C7C8CC", "#55565C"),
    trackBorder: dynamic("rgba(0, 0, 0, 0.07)", "rgba(255, 255, 255, 0.10)"),
    progressNormal: "systemGreen" as Color,
    progressWarning: "systemOrange" as Color,
    progressCritical: "systemRed" as Color,
    textShadow: undefined,
  };
}

export type WidgetPalette = ReturnType<typeof getWidgetPalette>;

/**
 * 统一的组件级配色代理对象（单例惰性求值，消除重复函数调用）。
 */
export const widgetTheme = {
  get isTransparent() {
    return isWidgetTransparent();
  },
  get current() {
    return getWidgetPalette(isWidgetTransparent());
  },
  get bg() {
    return getWidgetPalette(isWidgetTransparent()).bg;
  },
  get primary() {
    return getWidgetPalette(isWidgetTransparent()).primary;
  },
  get secondary() {
    return getWidgetPalette(isWidgetTransparent()).secondary;
  },
  get accent() {
    return getWidgetPalette(isWidgetTransparent()).accent;
  },
  get divider() {
    return getWidgetPalette(isWidgetTransparent()).divider;
  },
  get warn() {
    return getWidgetPalette(isWidgetTransparent()).warn;
  },
  get textShadow() {
    return getWidgetPalette(isWidgetTransparent()).textShadow;
  },
};
